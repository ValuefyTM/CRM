// Server-only: the reports that valued properties like the subject of a report, nearby — same type of property
// (else same category), within a radius of its point — newest valuation first, each with a similarity score (distance,
// area, year built, rooms, how recent the valuation is). Only reports the user may open.
import { parseGeo } from "./registry";
import { myReportsSql } from "./perms-db";
import { can, DEFAULT_CONFIG, type PermConfig, type WithPerms } from "./perms";

export const SIM_RADII = ["0.5", "1", "2", "5"];

export type SimilarRow = {
  report_id: string; asset_id: string; number: string | null; date: string | null; status: string; currency: string | null;
  bank: string | null; recipient_id: string | null; type: string | null; category: string | null; address: string | null; city: string | null;
  usable_area: number | null; land_area: number | null; year_built: number | null; rooms: number | null; floor: string | null; cf: string | null;
  value: number | null; sqm: number | null; km: number; score: number;
  /** what the score is made of, 0–100 each (missing data: left out) */
  parts: { k: string; v: number }[];
};

type Subject = { report_id: string; recipient_id: string | null; bank: string | null; asset_id: string; type: string | null; category: string | null;
  geo: string | null; usable_area: number | null; land_area: number | null; year_built: number | null; rooms: number | null };

function km(a: [number, number], b: [number, number]) {
  const R = 6371, d = Math.PI / 180;
  const x = Math.sin(((b[0] - a[0]) * d) / 2) ** 2 + Math.cos(a[0] * d) * Math.cos(b[0] * d) * Math.sin(((b[1] - a[1]) * d) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
const clamp = (v: number) => Math.max(0, Math.min(1, v));
const isLand = (s: { category: string | null; type: string | null }) => /teren/i.test(`${s.category ?? ""} ${s.type ?? ""}`) && !/cas|vil|constr/i.test(s.type ?? "");

/**
 * How alike a valued property is to the subject, 0–100. Weighted, over what both have: distance (35), area (30),
 * year built (15), rooms (10), how recent the valuation is (10). Same type is the filter, not a part of the score.
 */
function similarity(s: Subject, r: { km: number; usable_area: number | null; land_area: number | null; year_built: number | null; rooms: number | null; date: string | null }, radius: number) {
  const parts: { k: string; v: number; w: number }[] = [{ k: "Distanță", v: clamp(1 - r.km / radius), w: 35 }];
  const area = isLand(s) ? [s.land_area, r.land_area] : [s.usable_area ?? s.land_area, r.usable_area ?? r.land_area];
  // area: the same → 1, half or double → 0
  if (area[0] && area[1]) parts.push({ k: "Suprafață", v: clamp(1 - Math.abs(Math.log(area[1] / area[0])) / Math.log(2)), w: 30 });
  if (s.year_built && r.year_built) parts.push({ k: "An construcție", v: clamp(1 - Math.abs(s.year_built - r.year_built) / 30), w: 15 });
  if (s.rooms && r.rooms) parts.push({ k: "Camere", v: clamp(1 - Math.abs(s.rooms - r.rooms) / 2), w: 10 });
  if (r.date) {
    const years = (Date.now() - Date.parse(r.date)) / (365.25 * 864e5);
    parts.push({ k: "Cât de recentă", v: clamp(1 - years / 5), w: 10 });
  }
  const tw = parts.reduce((t, p) => t + p.w, 0);
  return { score: Math.round(parts.reduce((t, p) => t + p.v * p.w, 0) / tw * 100), parts: parts.map((p) => ({ k: p.k, v: Math.round(p.v * 100) })) };
}

/** The subject of a report: its main asset (else the first) with its property. */
async function subjectOf(db: D1Database, reportId: string) {
  return db.prepare(`SELECT r.id AS report_id, r.recipient_id, b.name AS bank, a.id AS asset_id, p.type, p.category, p.geo, p.usable_area, p.land_area, p.year_built, p.rooms
    FROM reports r JOIN assets a ON a.report_id = r.id JOIN crm_properties p ON p.id = a.property_id LEFT JOIN entities b ON b.id = r.recipient_id
    WHERE r.id = ? ORDER BY a.is_main DESC, a.rowid LIMIT 1`).bind(reportId).first<Subject>();
}

export async function similarReports(db: D1Database, user: WithPerms & { id: string; team?: PermConfig["team"] }, reportId: string,
  opt: { radius?: string; sameUser?: boolean; limit?: number } = {}) {
  const radius = SIM_RADII.includes(opt.radius ?? "") ? Number(opt.radius) : 1;
  const s = await subjectOf(db, reportId);
  const ll = s ? parseGeo(s.geo) : null;
  const base = { radius, subject: s ? { type: s.type, category: s.category, bank: s.bank, hasUser: !!s.recipient_id } : null, located: !!ll };
  if (!s || !ll) return { ...base, rows: [] as SimilarRow[] };

  const dLat = radius / 111, dLng = radius / (111 * Math.cos((ll[0] * Math.PI) / 180));
  const LAT = "CAST(trim(substr(p.geo, 1, instr(p.geo, ',') - 1)) AS REAL)", LNG = "CAST(trim(substr(p.geo, instr(p.geo, ',') + 1)) AS REAL)";
  const w = ["r.id <> ?", "r.status <> 'cancelled'", "p.geo LIKE '%_,_%'", `${LAT} BETWEEN ? AND ?`, `${LNG} BETWEEN ? AND ?`];
  const a: (string | number)[] = [reportId, ll[0] - dLat, ll[0] + dLat, ll[1] - dLng, ll[1] + dLng];
  if (s.type) { w.push("LOWER(TRIM(p.type)) = LOWER(TRIM(?))"); a.push(s.type); } else if (s.category) { w.push("p.category = ?"); a.push(s.category); }
  if (opt.sameUser && s.recipient_id) { w.push("r.recipient_id = ?"); a.push(s.recipient_id); }
  // only the reports the user may open
  if (!can(user, "reports.all")) { w.push(myReportsSql(user.team ?? DEFAULT_CONFIG.team)); a.push(user.id); }
  const { results } = await db.prepare(`SELECT r.id AS report_id, a.id AS asset_id, r.number, COALESCE(r.valuation_date, r.report_date, substr(r.created_at, 1, 10)) AS date,
      r.status, r.currency, b.name AS bank, r.recipient_id, p.type, p.category, p.full_address AS address, p.city, p.usable_area, p.land_area, p.year_built, p.rooms,
      p.floor, p.cf_number AS cf, a.value, p.geo
    FROM assets a JOIN reports r ON r.id = a.report_id JOIN crm_properties p ON p.id = a.property_id LEFT JOIN entities b ON b.id = r.recipient_id
    WHERE ${w.join(" AND ")} LIMIT 800`).bind(...a)
    .all<Omit<SimilarRow, "km" | "score" | "parts" | "sqm"> & { geo: string }>();

  const rows: SimilarRow[] = [];
  for (const { geo, ...x } of results) {
    const g = parseGeo(geo);
    if (!g) continue;
    const d = km(ll, g);
    if (d > radius) continue;
    const per = isLand(x) ? x.land_area : x.usable_area ?? x.land_area;
    const sim = similarity(s, { ...x, km: d }, radius);
    rows.push({ ...x, km: Math.round(d * 1000) / 1000, sqm: x.value && per ? Math.round(x.value / per) : null, ...sim });
  }
  // newest valuation first
  rows.sort((p, q) => (q.date ?? "").localeCompare(p.date ?? "") || q.score - p.score);
  return { ...base, rows: rows.slice(0, opt.limit ?? 200) };
}
