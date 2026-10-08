// Server-only: places properties on the map from their cadastral number, through the cadastral locator of VALUEFY Tools
// (/api/localizare/centroid: centre of the parcel in the Timiș plans). Units ("…-C1-U20") are located by their parcel.
import { now } from "./db";

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
      writes.push(db.prepare("UPDATE crm_properties SET geo = ?, geo_source = 'cadastru', geo_note = ?, geo_checked_at = ? WHERE id = ? AND (geo IS NULL OR geo = '' OR geo_source = 'cadastru')")
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

/** One property, after it is saved (quietly: the map is a convenience, saving must not fail because of it). */
export async function locateProperty(db: D1Database, propertyId: string) {
  if (!geolocateEnabled()) return;
  try {
    const p = await db.prepare(`SELECT p.id, p.city, p.cad_building, p.cad_land, p.cf_number FROM crm_properties p WHERE p.id = ? AND ${NEEDS}`).bind(propertyId).first<Prop>();
    if (p) await locate(db, [p]);
  } catch (e) { console.error("geolocate", e); }
}

/** How many properties could still be placed, and how many were already tried without result. */
export async function locateCounts(db: D1Database) {
  const r = await db.prepare(`SELECT SUM(p.geo_checked_at IS NULL) AS todo, SUM(p.geo_checked_at IS NOT NULL) AS tried FROM crm_properties p WHERE ${NEEDS}`)
    .first<{ todo: number | null; tried: number | null }>();
  return { todo: r?.todo ?? 0, tried: r?.tried ?? 0 };
}

/** The next batch of properties never tried (or all without a location again, with `retry`). */
export async function locateBatch(db: D1Database, limit: number, retry = false) {
  const rows = (await db.prepare(`SELECT p.id, p.city, p.cad_building, p.cad_land, p.cf_number FROM crm_properties p WHERE ${NEEDS} ${retry ? "" : "AND p.geo_checked_at IS NULL"}
    ORDER BY p.updated_at DESC LIMIT ?`).bind(limit).all<Prop>()).results;
  if (!rows.length) return { located: 0, failed: 0, processed: 0 };
  const r = await locate(db, rows);
  return { ...r, processed: rows.length };
}
