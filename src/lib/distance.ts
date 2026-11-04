// Server-only: how far an inspection was from the office (the firm's correspondence address, Setări → Date firmă),
// in a straight line. The office is placed on the map once and kept (settings: office_geo) until its address changes;
// an inspection's place is the phone's GPS at the inspection, else the address given with it, else the property's pin.
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

/** Distance from the office to each inspection, in km (one decimal); missing when its place is not known. */
export async function inspectionDistances(db: D1Database, ids: string[]): Promise<Record<string, number>> {
  if (!ids.length) return {};
  const office = await officePoint(db);
  if (!office) return {};
  const { results } = await db.prepare(`SELECT i.id, s.lat AS s_lat, s.lng AS s_lng, i.lat, i.lng, p.geo
      FROM inspections i LEFT JOIN assets a ON a.id = i.asset_id LEFT JOIN crm_properties p ON p.id = a.property_id
      LEFT JOIN inspection_sheets s ON s.id = (SELECT y.id FROM inspection_sheets y WHERE y.inspection_id = i.id AND y.lat IS NOT NULL ORDER BY y.updated_at DESC LIMIT 1)
      WHERE i.id IN (${ids.map(() => "?").join(", ")})`).bind(...ids)
    .all<{ id: string; s_lat: number | null; s_lng: number | null; lat: number | null; lng: number | null; geo: string | null }>();
  const out: Record<string, number> = {};
  for (const r of results) {
    const p: Point | null = r.s_lat != null && r.s_lng != null ? [r.s_lat, r.s_lng] : r.lat != null && r.lng != null ? [r.lat, r.lng] : parseGeo(r.geo);
    if (p) out[r.id] = Math.round(km(office.point, p) * 10) / 10;
  }
  return out;
}
