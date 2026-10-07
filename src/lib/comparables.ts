// Server-only: comparables of a property — other valued properties nearby (same type or category, similar area,
// recent valuation), with distance, value per m² and the spread of values per m² around them.
import { BASE, parseGeo } from "./registry";
import { fileSrc } from "./files";

export type CompFilters = { raza?: string; ani?: string; potrivire?: string; supr?: string };
export const RADII = ["0.5", "1", "2", "5"];
export const YEARS: [string, string][] = [["1", "1 an"], ["2", "2 ani"], ["3", "3 ani"], ["5", "5 ani"], ["0", "Oricând"]];
export const AREA: [string, string][] = [["25", "±25%"], ["50", "±50%"], ["0", "Oricare"]];

export type Comparable = {
  id: string; type: string | null; category: string | null; full_address: string | null; city: string | null; usable_area: number | null; year_built: number | null;
  value: number; sqm: number | null; last_date: string | null; report_id: string | null; report_number: string | null; lat: number; lng: number; km: number; photo: string | null;
};

const LAT = "CAST(trim(substr(p.geo, 1, instr(p.geo, ',') - 1)) AS REAL)";
const LNG = "CAST(trim(substr(p.geo, instr(p.geo, ',') + 1)) AS REAL)";

function km(a: [number, number], b: [number, number]) {
  const R = 6371, d = Math.PI / 180;
  const x = Math.sin(((b[0] - a[0]) * d) / 2) ** 2 + Math.cos(a[0] * d) * Math.cos(b[0] * d) * Math.sin(((b[1] - a[1]) * d) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
const quantile = (s: number[], q: number) => {
  if (!s.length) return null;
  const i = (s.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i);
  return s[lo] + (s[hi] - s[lo]) * (i - lo);
};

export async function comparables(db: D1Database, propertyId: string, f: CompFilters) {
  const subject = await db.prepare(`${BASE} SELECT p.* FROM p WHERE p.id = ?`).bind(propertyId)
    .first<{ id: string; type: string | null; category: string | null; full_address: string | null; city: string | null; geo: string | null; usable_area: number | null; value: number | null; sqm: number | null; last_date: string | null }>();
  if (!subject) return null;
  const ll = parseGeo(subject.geo);
  const radius = RADII.includes(f.raza ?? "") ? Number(f.raza) : 1;
  const years = YEARS.some(([k]) => k === f.ani) ? Number(f.ani) : 3;
  const sameType = f.potrivire !== "categorie" && !!subject.type;
  const tol = AREA.some(([k]) => k === f.supr) ? Number(f.supr) : 50;
  const settings = { radius, years, sameType, tol };
  if (!ll) return { subject, ll: null, settings, rows: [] as Comparable[], stats: null };

  const dLat = radius / 111, dLng = radius / (111 * Math.cos((ll[0] * Math.PI) / 180));
  const w = [`p.id <> ?`, `p.value > 0`, `p.geo LIKE '%_,_%'`, `${LAT} BETWEEN ? AND ?`, `${LNG} BETWEEN ? AND ?`];
  const a: (string | number)[] = [subject.id, ll[0] - dLat, ll[0] + dLat, ll[1] - dLng, ll[1] + dLng];
  if (sameType) { w.push("p.type = ?"); a.push(subject.type!); } else if (subject.category) { w.push("p.category = ?"); a.push(subject.category); }
  if (years) { const d = new Date(); d.setFullYear(d.getFullYear() - years); w.push("p.last_date >= ?"); a.push(d.toISOString().slice(0, 10)); }
  if (tol && subject.usable_area) { w.push("p.usable_area BETWEEN ? AND ?"); a.push(subject.usable_area * (1 - tol / 100), subject.usable_area * (1 + tol / 100)); }
  const raw = (await db.prepare(`${BASE} SELECT p.id, p.type, p.category, p.full_address, p.city, p.usable_area, p.year_built, p.value, p.sqm, p.last_date, p.report_id, p.report_number, p.geo,
      COALESCE(NULLIF(p.image_url, ''), (SELECT 'r2:' || f.r2_key FROM inspection_photos f JOIN inspections i ON i.id = f.inspection_id JOIN assets a ON a.id = i.asset_id
        WHERE a.property_id = p.id AND f.deleted_at IS NULL ORDER BY f.category = 'exterior' DESC LIMIT 1)) AS photo
    FROM p WHERE ${w.join(" AND ")} LIMIT 600`).bind(...a)
    .all<Omit<Comparable, "lat" | "lng" | "km"> & { geo: string }>()).results;

  const rows: Comparable[] = [];
  for (const r of raw) {
    const g = parseGeo(r.geo);
    if (!g) continue;
    const d = km(ll, g);
    if (d <= radius) rows.push({ ...r, photo: fileSrc(r.photo), lat: g[0], lng: g[1], km: Math.round(d * 1000) / 1000 });
  }
  rows.sort((x, y) => x.km - y.km);
  const list = rows.slice(0, 80);
  const s = list.map((r) => r.sqm).filter((x): x is number => x != null && x > 30 && x < 100000).sort((x, y) => x - y);
  const median = quantile(s, 0.5);
  const stats = s.length ? {
    n: list.length, withSqm: s.length, median, p25: quantile(s, 0.25), p75: quantile(s, 0.75), min: s[0], max: s[s.length - 1],
    mean: s.reduce((t, x) => t + x, 0) / s.length,
    estimate: median && subject.usable_area ? median * subject.usable_area : null,
  } : { n: list.length, withSqm: 0, median: null, p25: null, p75: null, min: null, max: null, mean: null, estimate: null };
  return { subject, ll, settings, rows: list, stats };
}
