// Server-only: places properties on the map from their cadastral number, through the cadastral locator of VALUEFY Tools
// (/api/localizare/centroid: centre of the parcel in the Timiș plans). Units ("…-C1-U20") are located by their parcel.
import { now } from "./db";
import { geocodeAddress } from "./geocode";
import { getCloudflareContext } from "@opennextjs/cloudflare";

const API = () => (process.env.LOCATOR_API_URL || "https://tools.valuefy.ro").replace(/\/$/, "") + "/api/localizare/centroid";
export const geolocateEnabled = () => !!process.env.LOCATOR_API_TOKEN;

/** "259154-C1-U20", "CF 259154-C1-U20" → "259154": the parcel of an individual unit (at most the first 6 digits). */
export function cadastralRoot(v: string | null | undefined) {
  const m = (v ?? "").match(/(\d+)/);
  return m ? m[1].slice(0, 6) : null;
}

type Prop = { id: string; city: string | null; cad_building: string | null; cad_land: string | null; cf_number: string | null };
type Hit = { id: string; nr?: string | null; uat?: string; lat?: number; lng?: number; error?: string };

/** The numbers to try for a property, in order: building cadastral, land cadastral, land book (distinct roots). */
const numbersOf = (p: Prop) => [...new Set([p.cad_building, p.cad_land, p.cf_number].map(cadastralRoot).filter((x): x is string => !!x))];

async function ask(items: { id: string; nr: string; city: string | null }[]) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 15000);
  try {
    const r = await fetch(API(), {
      method: "POST", signal: ctl.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.LOCATOR_API_TOKEN}` },
      body: JSON.stringify({ items }),
    });
    if (!r.ok) throw new LocatorError(explain(r.status, await r.text().catch(() => "")));
    const d = (await r.json().catch(() => null)) as { results?: Hit[] } | null;
    if (!d?.results) throw new LocatorError("Localizatorul a răspuns, dar nu cu date de localizare (adresa LOCATOR_API_URL duce în altă parte?).");
    return d.results;
  } catch (e) {
    if (e instanceof LocatorError) throw e;
    throw new LocatorError((e as Error)?.name === "AbortError" ? "Localizatorul nu a răspuns în 15 secunde." : `Nu pot contacta ${API()} — domeniul Tools nu răspunde sau nu e cel corect (LOCATOR_API_URL).`);
  } finally { clearTimeout(t); }
}

/** An error of the link with the Tools locator, said so that it can be fixed (shown to the team). */
export class LocatorError extends Error {}

function explain(status: number, body: string) {
  if (status === 401) return "Tools a refuzat tokenul: LOCATOR_API_TOKEN nu e setat în workerul Tools sau are altă valoare decât în CRM (trebuie identic în ambele, apoi deploy la amândouă).";
  if (status === 403) return /cloudflare|challenge|cf-/i.test(body)
    ? "Cloudflare a blocat cererea înainte de Tools (Bot Fight Mode / WAF pe valuefy.ro). Adaugă o regulă de excepție pentru /api/localizare/ sau dezactivează Bot Fight Mode pentru tools.valuefy.ro."
    : "Cererea către Tools a fost blocată (HTTP 403) înainte să ajungă la localizator: firewall / reguli de securitate pe domeniu.";
  if (status === 404) return /<html/i.test(body) ? "Tools nu are încă API-ul de localizare: fă deploy la Tools (versiunea cu /api/localizare/centroid)." : "Numărul nu a fost găsit în planuri.";
  if (status >= 500) return `Tools a dat eroare (HTTP ${status}). Verifică logurile workerului Tools.`;
  return `Răspuns neașteptat de la Tools (HTTP ${status}).`;
}

/**
 * Checks the whole link (CRM → Tools → plan of the parcels) with one known parcel, and says where it stops.
 * The parcel is any one already placed from the cadastre, else a fixed parcel in Timișoara.
 */
export async function locatorCheck(db: D1Database) {
  const steps: { ok: boolean; text: string }[] = [];
  if (!geolocateEnabled()) return { ok: false, steps: [{ ok: false, text: "LOCATOR_API_TOKEN nu este setat în workerul CRM (Cloudflare → crm → Settings → Variables and Secrets)." }] };
  steps.push({ ok: true, text: `Token prezent în CRM · adresa localizatorului: ${API()}` });
  const known = await db.prepare("SELECT city, cad_building, cad_land, cf_number FROM crm_properties WHERE geo_source = 'cadastru' LIMIT 1")
    .first<{ city: string | null; cad_building: string | null; cad_land: string | null; cf_number: string | null }>().catch(() => null);
  const nr = cadastralRoot(known?.cad_building ?? known?.cad_land ?? known?.cf_number) ?? "400015";
  const city = known?.city ?? "Timișoara";
  try {
    const [hit] = await ask([{ id: "check", nr, city }]);
    steps.push({ ok: true, text: "Tools a acceptat tokenul și a răspuns." });
    if (hit?.lat != null) steps.push({ ok: true, text: `Parcela de probă ${nr} (${city}) a fost găsită: ${hit.lat.toFixed(5)}, ${hit.lng?.toFixed(5)} (plan ${hit.uat}).` });
    else steps.push({ ok: !!hit?.error && !/plan|date|index/i.test(hit.error), text: `Parcela de probă ${nr} (${city}): ${hit?.error ?? "fără rezultat"}. Dacă nicio parcelă nu e găsită, la deploy-ul Tools trebuie rulat și scripts/copy-localizare.mjs (npm run cf:deploy îl rulează).` });
  } catch (e) {
    steps.push({ ok: false, text: e instanceof LocatorError ? e.message : "Eroare necunoscută la apelul către Tools." });
  }
  return { ok: steps.every((x) => x.ok), steps };
}

/** Looks up a set of properties and saves what is found. Returns how many were placed and how many not. */
export async function locate(db: D1Database, props: Prop[]) {
  const items = props.flatMap((p) => numbersOf(p).map((nr, i) => ({ id: `${p.id}|${i}`, nr, city: p.city })));
  if (!items.length) return { located: 0, failed: props.length };
  const results: Hit[] = [];
  for (let i = 0; i < items.length; i += 200) results.push(...(await ask(items.slice(i, i + 200))));
  const t = now();
  let located = 0;
  const writes: D1PreparedStatement[] = [];
  for (const p of props) {
    const mine = results.filter((r) => r.id.split("|")[0] === p.id).sort((a, b) => Number(a.id.split("|")[1]) - Number(b.id.split("|")[1]));
    const hit = mine.find((r) => r.lat != null && r.lng != null);
    if (hit) {
      located++;
      writes.push(db.prepare("UPDATE crm_properties SET geo = ?, geo_source = 'cadastru', geo_note = ?, geo_checked_at = ? WHERE id = ? AND (geo IS NULL OR geo = '' OR geo_source IN ('cadastru', 'adresa', 'localitate'))")
        .bind(`${hit.lat}, ${hit.lng}`, `plan UAT ${hit.uat}, nr. ${hit.nr}`, t, p.id));
    } else {
      writes.push(db.prepare("UPDATE crm_properties SET geo_note = ?, geo_checked_at = ? WHERE id = ?")
        .bind(mine[0]?.error ?? "Fără număr cadastral sau CF.", t, p.id));
    }
  }
  for (let i = 0; i < writes.length; i += 50) await db.batch(writes.slice(i, i + 50));
  return { located, failed: props.length - located };
}

const NEEDS = `(p.geo IS NULL OR p.geo = '') AND (p.county IS NULL OR p.county = '' OR p.county LIKE 'Timi%')
  AND COALESCE(p.cad_building, p.cad_land, p.cf_number) GLOB '*[0-9]*'`;

/** The plans of the Tools locator cover Timiș: other counties go straight to the address. */
const inPlans = (county: string | null) => !county || /^timi/i.test(county.trim());

/** A point from the cadastral number (geoportal plans), for a form not saved yet. Null when the plans do not have it. */
export async function lookupCadastre(p: { city: string | null; county: string | null; cad_building: string | null; cad_land: string | null; cf_number: string | null }) {
  if (!geolocateEnabled() || !inPlans(p.county)) return null;
  const nrs = numbersOf({ id: "x", ...p });
  if (!nrs.length) return null;
  try {
    const hits = await ask(nrs.map((nr, i) => ({ id: `x|${i}`, nr, city: p.city })));
    const hit = hits.sort((a, b) => Number(a.id.split("|")[1]) - Number(b.id.split("|")[1])).find((h) => h.lat != null && h.lng != null);
    return hit ? { lat: hit.lat!, lng: hit.lng!, source: "cadastru" as const, note: `geoportal · plan UAT ${hit.uat}, nr. ${hit.nr}` } : null;
  } catch { return null; }
}

/**
 * Places one property after it is saved (quietly: the map is a convenience, saving must not fail because of it):
 * from the geoportal plans by its cadastral number first, else from its address.
 */
export async function locateProperty(db: D1Database, propertyId: string) {
  try {
    const p = await db.prepare("SELECT id, county, city, full_address, cad_building, cad_land, cf_number, geo, geo_source FROM crm_properties WHERE id = ?").bind(propertyId)
      .first<Prop & { county: string | null; full_address: string | null; geo: string | null; geo_source: string | null }>();
    // A point from the address is replaced by the plans as soon as they have the parcel; other points are kept.
    const fromAddress = p?.geo_source === "adresa" || p?.geo_source === "localitate";
    if (!p || (p.geo?.trim() && !fromAddress)) return;
    if (geolocateEnabled() && inPlans(p.county) && numbersOf(p).length) {
      await locate(db, [p]);
      const now_ = await db.prepare("SELECT geo FROM crm_properties WHERE id = ?").bind(propertyId).first<{ geo: string | null }>();
      if (now_?.geo?.trim()) return;
    }
    if (!p.geo?.trim()) await locateByAddress(db, p);
  } catch (e) { console.error("geolocate", e); }
}

/** Same, after the answer is sent (the form does not wait for the maps). */
export function locateLater(db: D1Database, propertyId: string) {
  const job = locateProperty(db, propertyId);
  try { getCloudflareContext().ctx.waitUntil(job); } catch { /* outside the worker: the promise still runs */ }
}

/** The open inspections without a point, placed after the answer is sent (the inspectors' app list). */
export function locateOpenLater(db: D1Database, limit = 3) {
  const job = locateOpenInspections(db, limit).catch(() => null);
  try { getCloudflareContext().ctx.waitUntil(job); } catch { /* outside the worker: the promise still runs */ }
}

/** Saves the point of the address (never over a point from the plans or one set by hand). */
export async function locateByAddress(db: D1Database, p: { id: string; full_address: string | null; city: string | null; county: string | null }) {
  const hit = await geocodeAddress({ address: p.full_address, city: p.city, county: p.county });
  const t = now();
  if (hit) {
    await db.prepare("UPDATE crm_properties SET geo = ?, geo_source = ?, geo_note = ?, geo_checked_at = ? WHERE id = ? AND (geo IS NULL OR geo = '')")
      .bind(`${hit.lat}, ${hit.lng}`, hit.source, hit.note, t, p.id).run();
    return true;
  }
  // the note says the address was tried too (ADDR_NEEDS leaves it out from then on)
  await db.prepare(`UPDATE crm_properties SET geo_note = CASE WHEN geo_note IS NULL OR geo_note = '' OR geo_note LIKE '%${ADDR_MISS}%' THEN '${ADDR_MISS}' ELSE geo_note || ' · ${ADDR_MISS}' END,
    geo_checked_at = ? WHERE id = ?`).bind(t, p.id).run();
  return false;
}

/** The note of a property whose address was not found on the map. */
const ADDR_MISS = "adresa nu a fost găsită pe hartă";
/** Still without a point, with an address or a locality, and the address not tried yet. */
const ADDR_NEEDS = `(p.geo IS NULL OR p.geo = '') AND COALESCE(NULLIF(TRIM(p.full_address), ''), NULLIF(TRIM(p.city), '')) IS NOT NULL AND (p.geo_note IS NULL OR p.geo_note NOT LIKE '%${ADDR_MISS}%')`;

/** Places a few properties from their address (one a second: Nominatim's limit). Returns how many got a point. */
async function locateAddresses(db: D1Database, rows: { id: string; full_address: string | null; city: string | null; county: string | null }[]) {
  let located = 0;
  for (const [n, p] of rows.entries()) {
    if (n) await new Promise((r) => setTimeout(r, 1100));
    if (await locateByAddress(db, p)) located++;
  }
  return located;
}

/**
 * One property, on request (even if tried before): from the cadastral plans when the locator is set up and the number
 * is known, else from the address. Returns whether it got a point.
 */
export async function locateOne(db: D1Database, id: string) {
  const p = await db.prepare("SELECT id, county, city, full_address, cad_building, cad_land, cf_number FROM crm_properties WHERE id = ?").bind(id)
    .first<Prop & { county: string | null; full_address: string | null }>();
  if (!p) return null;
  if (geolocateEnabled() && inPlans(p.county) && numbersOf(p).length) {
    const r = await locate(db, [p]);
    if (r.located) return true;
  }
  return locateByAddress(db, p);
}

/**
 * The properties of the inspections still to do that have no point yet (nor one from the inspector's phone): placed
 * a few at a time, from the plans or the address. Not tried again within a week.
 */
export async function locateOpenInspections(db: D1Database, limit = 6) {
  const week = new Date(Date.now() - 7 * 86400000).toISOString();
  const { results } = await db.prepare(`SELECT DISTINCT p.id, p.county, p.city, p.full_address, p.cad_building, p.cad_land, p.cf_number, p.geo
      FROM inspections i JOIN assets a ON a.id = i.asset_id JOIN crm_properties p ON p.id = a.property_id LEFT JOIN reports r ON r.id = i.report_id
      WHERE i.status IN ('to_schedule', 'scheduled') AND (r.id IS NULL OR (r.status IN ('draft', 'in_progress') AND r.delivered_at IS NULL))
        AND i.lat IS NULL AND (p.geo IS NULL OR p.geo = '') AND (p.geo_checked_at IS NULL OR p.geo_checked_at < ?)
        AND (COALESCE(p.full_address, p.city, p.cad_building, p.cad_land, p.cf_number) IS NOT NULL)
      LIMIT ?`).bind(week, limit).all<Prop & { county: string | null; full_address: string | null; geo: string | null }>();
  let located = 0;
  for (const [n, p] of results.entries()) {
    if (n) await new Promise((r) => setTimeout(r, 1100)); // one address a second (Nominatim)
    await locateProperty(db, p.id);
    const g = await db.prepare("SELECT geo FROM crm_properties WHERE id = ?").bind(p.id).first<{ geo: string | null }>();
    if (g?.geo?.trim()) located++;
  }
  return { tried: results.length, located };
}

/**
 * How many properties without a point can still be placed (from the plans, never tried; or from an address not tried
 * yet), and how many were tried every way without result.
 */
export async function locateCounts(db: D1Database) {
  const cad = geolocateEnabled() ? `(${NEEDS} AND p.geo_checked_at IS NULL)` : "0";
  const r = await db.prepare(`SELECT SUM(${cad} OR ${ADDR_NEEDS}) AS todo, SUM(NOT (${cad} OR ${ADDR_NEEDS})) AS tried FROM crm_properties p
      WHERE (p.geo IS NULL OR p.geo = '') AND COALESCE(NULLIF(TRIM(p.full_address), ''), NULLIF(TRIM(p.city), ''), p.cad_building, p.cad_land, p.cf_number) IS NOT NULL`)
    .first<{ todo: number | null; tried: number | null }>();
  return { todo: r?.todo ?? 0, tried: r?.tried ?? 0 };
}

/** How many addresses one batch looks up (one a second). */
const ADDR_BATCH = 6;

/**
 * The next batch: from the plans the properties never tried (or all without a point again, with `retry`), then a few
 * from their address. The page calls it until nothing is left.
 */
export async function locateBatch(db: D1Database, limit: number, retry = false) {
  let located = 0, processed = 0;
  if (geolocateEnabled()) {
    const rows = (await db.prepare(`SELECT p.id, p.city, p.cad_building, p.cad_land, p.cf_number FROM crm_properties p WHERE ${NEEDS} ${retry ? "" : "AND p.geo_checked_at IS NULL"}
      ORDER BY p.updated_at DESC LIMIT ?`).bind(limit).all<Prop>()).results;
    if (rows.length) { located += (await locate(db, rows)).located; processed += rows.length; }
  }
  const addr = (await db.prepare(`SELECT p.id, p.full_address, p.city, p.county FROM crm_properties p WHERE ${ADDR_NEEDS} ORDER BY p.updated_at DESC LIMIT ?`).bind(ADDR_BATCH)
    .all<{ id: string; full_address: string | null; city: string | null; county: string | null }>()).results;
  if (addr.length) { located += await locateAddresses(db, addr); processed += addr.length; }
  return { located, failed: processed - located, processed };
}
