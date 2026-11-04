// Server-only: how far an inspection was from the office (the firm's correspondence address, Setări → Date firmă),
// by road, by car (OSRM on OpenStreetMap; a straight line until the router answers). The office is placed on the map
// once and kept (settings: office_geo) until its address changes; an inspection's place is the phone's GPS at the
// inspection, else the address given with it, else the property's pin.
import { now } from "./db";
import { getFirm } from "./settings";
import { geocodeAddress } from "./geocode";
import { parseGeo } from "./registry";

type Point = [number, number];

export function km(a: Point, b: Point) {
  const R = 6371, d = Math.PI / 180;
  const x = Math.sin(((b[0] - a[0]) * d) / 2) ** 2 + Math.cos(a[0] * d) * Math.cos(b[0] * d) * Math.sin(((b[1] - a[1]) * d) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

/** The office's point: from the correspondence address (else the registered office), placed once. */
export async function officePoint(db: D1Database): Promise<{ point: Point; address: string } | null> {
  const firm = await getFirm(db);
  const address = (firm.mail || firm.address || "").trim();
  if (!address) return null;
  const row = await db.prepare("SELECT value FROM settings WHERE key = 'office_geo'").first<{ value: string }>().catch(() => null);
  try {
    const kept = row ? (JSON.parse(row.value) as { address: string; lat: number; lng: number }) : null;
    if (kept && kept.address === address) return { point: [kept.lat, kept.lng], address };
  } catch { /* placed again */ }
  const hit = await geocodeAddress({ address });
  if (!hit) return null;
  await db.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('office_geo', ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
    .bind(JSON.stringify({ address, lat: hit.lat, lng: hit.lng, note: hit.note }), now()).run().catch(() => null);
  return { point: [hit.lat, hit.lng], address };
}

export type Distance = { km: number; road: boolean };

/** Road distances (km) from one point to several, by car (OSRM, OpenStreetMap); null when the router does not answer. */
async function roadKm(from: Point, to: Point[]): Promise<(number | null)[] | null> {
  if (!to.length) return [];
  const base = (process.env.OSRM_URL || "https://router.project-osrm.org").replace(/\/$/, "");
  const coords = [from, ...to].map(([lat, lng]) => `${lng.toFixed(6)},${lat.toFixed(6)}`).join(";");
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 12000);
  try {
    const r = await fetch(`${base}/table/v1/driving/${coords}?sources=0&annotations=distance`, { signal: ctl.signal, headers: { "User-Agent": "VALUEFY-CRM/1.0 (+https://valuefy.ro)" } });
    if (!r.ok) return null;
    const d = (await r.json()) as { code?: string; distances?: (number | null)[][] };
    if (d.code !== "Ok" || !d.distances?.[0]) return null;
    return d.distances[0].slice(1).map((m) => (m == null ? null : Math.round(m / 100) / 10));
  } catch { return null; } finally { clearTimeout(t); }
}

/**
 * Distance from the office to each inspection, in km (one decimal): by road, by car, computed once and kept
 * (inspection_routes); in a straight line (`road: false`) while the router cannot be reached. Missing when the
 * inspection's place is not known.
 */
export async function inspectionDistances(db: D1Database, ids: string[]): Promise<Record<string, Distance>> {
  if (!ids.length) return {};
  const office = await officePoint(db);
  if (!office) return {};
  const key = `${office.point[0].toFixed(5)},${office.point[1].toFixed(5)}`;
  const { results } = await db.prepare(`SELECT i.id, s.lat AS s_lat, s.lng AS s_lng, i.lat, i.lng, p.geo, k.office AS k_office, k.lat AS k_lat, k.lng AS k_lng, k.road_km
      FROM inspections i LEFT JOIN assets a ON a.id = i.asset_id LEFT JOIN crm_properties p ON p.id = a.property_id
      LEFT JOIN inspection_sheets s ON s.id = (SELECT y.id FROM inspection_sheets y WHERE y.inspection_id = i.id AND y.lat IS NOT NULL ORDER BY y.updated_at DESC LIMIT 1)
      LEFT JOIN inspection_routes k ON k.inspection_id = i.id
      WHERE i.id IN (${ids.map(() => "?").join(", ")})`).bind(...ids)
    .all<{ id: string; s_lat: number | null; s_lng: number | null; lat: number | null; lng: number | null; geo: string | null; k_office: string | null; k_lat: number | null; k_lng: number | null; road_km: number | null }>()
    .catch(() => ({ results: [] as never[] }));
  const out: Record<string, Distance> = {};
  const todo: { id: string; p: Point }[] = [];
  for (const r of results) {
    const p: Point | null = r.s_lat != null && r.s_lng != null ? [r.s_lat, r.s_lng] : r.lat != null && r.lng != null ? [r.lat, r.lng] : parseGeo(r.geo);
    if (!p) continue;
    // kept: the same office, the same place
    if (r.road_km != null && r.k_office === key && r.k_lat === p[0] && r.k_lng === p[1]) out[r.id] = { km: r.road_km, road: true };
    else { out[r.id] = { km: Math.round(km(office.point, p) * 10) / 10, road: false }; todo.push({ id: r.id, p }); }
  }
  // the ones not computed yet: one request to the router for up to 80 places at a time
  for (let i = 0; i < todo.length; i += 80) {
    const part = todo.slice(i, i + 80);
    const got = await roadKm(office.point, part.map((x) => x.p));
    if (!got) break;
    const t = now(), stmts: D1PreparedStatement[] = [];
    part.forEach((x, j) => {
      const v = got[j];
      if (v == null) return;
      out[x.id] = { km: v, road: true };
      stmts.push(db.prepare(`INSERT INTO inspection_routes (inspection_id, office, lat, lng, road_km, computed_at) VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(inspection_id) DO UPDATE SET office = excluded.office, lat = excluded.lat, lng = excluded.lng, road_km = excluded.road_km, computed_at = excluded.computed_at`)
        .bind(x.id, key, x.p[0], x.p[1], v, t));
    });
    if (stmts.length) await db.batch(stmts).catch((e) => console.error("routes", e));
  }
  return out;
}
