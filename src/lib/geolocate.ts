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
    if (!r.ok) throw new Error(`locator ${r.status}`);
    return ((await r.json()) as { results: Hit[] }).results;
  } finally { clearTimeout(t); }
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
