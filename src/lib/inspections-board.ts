// Server-only: all the team's inspections for the CRM (list, week calendar, map), with filters and counts.
import { photoUrl, presenceOf, type Presence } from "./presence";
import { parseGeo } from "./registry";

export type BoardFilters = { stare?: string; inspector?: string; perioada?: string; q?: string; saptamana?: string };
export type BoardRow = {
  id: string; status: string; scheduled_at: string | null; done_at: string | null; due_on: string | null; duration_min: number | null;
  report_id: string | null; report_number: string | null; report_label: string | null; type: string | null; category: string | null;
  address: string | null; city: string | null; lat: number | null; lng: number | null;
  inspector_id: string | null; inspector: string | null; presence: Presence | null; seen: string | null; photo: string | null;
  contact_name: string | null; contact_phone: string | null; sheet_status: string | null; late: boolean; glide: boolean;
};

const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Bucharest" });
const addDays = (iso: string, n: number) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
/** Monday of the week of a day. */
export const weekStart = (iso: string) => { const d = new Date(`${iso}T12:00:00Z`); const w = (d.getUTCDay() + 6) % 7; return addDays(iso, -w); };

/** Still to do and the report still open (old unfinished tasks of delivered reports from Glide are left out). */
const ACTIVE = `i.status IN ('to_schedule', 'scheduled') AND (r.id IS NULL OR (r.status IN ('draft', 'in_progress') AND r.delivered_at IS NULL))`;

export const BOARD_STATES: [string, string][] = [
  ["", "Active"], ["deprogramat", "De programat"], ["programate", "Programate"], ["intarziate", "Întârziate"], ["realizate", "Realizate"], ["toate", "Toate"],
];
export const BOARD_PERIODS: [string, string][] = [["", "Oricând"], ["azi", "Azi"], ["maine", "Mâine"], ["saptamana", "Săptămâna aceasta"], ["luna", "Luna aceasta"], ["30", "Ultimele 30 de zile"]];

const SELECT = `SELECT i.id, i.status, i.scheduled_at, i.done_at, i.due_on, i.duration_min, i.glide_id IS NOT NULL AS glide, i.report_id, r.number AS report_number, r.label AS report_label,
    p.type, p.category, COALESCE(NULLIF(i.address, ''), p.full_address, p.city) AS address, p.city, i.lat AS i_lat, i.lng AS i_lng, p.geo,
    i.inspector_id, COALESCE(NULLIF(u.name, ''), u.email) AS inspector, u.last_seen_at, u.avatar_at, i.contact_name, i.contact_phone,
    (SELECT s.status FROM inspection_sheets s WHERE s.inspection_id = i.id ORDER BY s.created_at DESC LIMIT 1) AS sheet_status
  FROM inspections i JOIN assets a ON a.id = i.asset_id JOIN crm_properties p ON p.id = a.property_id
  LEFT JOIN reports r ON r.id = i.report_id LEFT JOIN users u ON u.id = i.inspector_id`;

type Raw = Omit<BoardRow, "lat" | "lng" | "presence" | "seen" | "photo" | "late" | "glide"> & { i_lat: number | null; i_lng: number | null; geo: string | null; last_seen_at: string | null; avatar_at: string | null; glide: number };

function shape(r: Raw, t: string): BoardRow {
  const ll = r.i_lat != null && r.i_lng != null ? [r.i_lat, r.i_lng] : parseGeo(r.geo);
  const pr = r.inspector_id ? presenceOf(r.last_seen_at) : null;
  const open = r.status === "to_schedule" || r.status === "scheduled";
  return {
    ...r, lat: ll?.[0] ?? null, lng: ll?.[1] ?? null, presence: pr?.presence ?? null, seen: pr?.seen ?? null, photo: r.inspector_id ? photoUrl(r.inspector_id, r.avatar_at) : null,
    // Late: past its deadline, or its visit day has passed without the sheet being sent.
    late: open && ((!!r.due_on && r.due_on < t) || (r.status === "scheduled" && !!r.scheduled_at && r.scheduled_at.slice(0, 10) < t)), glide: !!r.glide,
  };
}

function where(f: BoardFilters, t: string) {
  const w: string[] = [];
  const a: (string | number)[] = [];
  switch (f.stare) {
    case "deprogramat": w.push(`${ACTIVE} AND i.status = 'to_schedule'`); break;
    case "programate": w.push(`${ACTIVE} AND i.status = 'scheduled'`); break;
    case "intarziate": w.push(`${ACTIVE} AND (i.due_on < ? OR (i.status = 'scheduled' AND substr(i.scheduled_at, 1, 10) < ?))`); a.push(t, t); break;
    case "realizate": w.push("i.status = 'done'"); break;
    case "toate": w.push("i.status <> 'cancelled'"); break;
    default: w.push(ACTIVE);
  }
  if (f.inspector) { w.push("i.inspector_id = ?"); a.push(f.inspector); }
  const day = "substr(COALESCE(i.done_at, i.scheduled_at, i.due_on), 1, 10)";
  if (f.perioada === "azi") { w.push(`${day} = ?`); a.push(t); }
  if (f.perioada === "maine") { w.push(`${day} = ?`); a.push(addDays(t, 1)); }
  if (f.perioada === "saptamana") { const m = weekStart(t); w.push(`${day} BETWEEN ? AND ?`); a.push(m, addDays(m, 6)); }
  if (f.perioada === "luna") { w.push(`substr(${day}, 1, 7) = ?`); a.push(t.slice(0, 7)); }
  if (f.perioada === "30") { w.push(`${day} >= ?`); a.push(addDays(t, -30)); }
  const q = f.q?.trim();
  if (q) {
    const like = `%${q.replace(/[%_]/g, "")}%`;
    w.push("(p.full_address LIKE ? OR p.city LIKE ? OR r.number = ? OR r.label LIKE ? OR i.contact_name LIKE ?)");
    a.push(like, like, q, like, like);
  }
  return { sql: w.length ? `WHERE ${w.join(" AND ")}` : "", args: a };
}

export async function inspectionBoard(db: D1Database, f: BoardFilters) {
  const t = today();
  const { sql, args } = where(f, t);
  const wk = /^\d{4}-\d{2}-\d{2}$/.test(f.saptamana ?? "") ? weekStart(f.saptamana!) : weekStart(t);
  const [rows, week, counts, people] = await Promise.all([
    db.prepare(`${SELECT} ${sql} ORDER BY i.status = 'done', COALESCE(i.scheduled_at, i.due_on, '9999') ASC, i.done_at DESC LIMIT 300`).bind(...args).all<Raw>(),
    // The calendar shows the chosen week, whatever the state filter (only the inspector filter applies).
    db.prepare(`${SELECT} WHERE i.status IN ('scheduled', 'done') AND substr(COALESCE(i.scheduled_at, i.done_at), 1, 10) BETWEEN ? AND ? ${f.inspector ? "AND i.inspector_id = ?" : ""}
      ORDER BY COALESCE(i.scheduled_at, i.done_at)`).bind(wk, addDays(wk, 6), ...(f.inspector ? [f.inspector] : [])).all<Raw>(),
    db.prepare(`SELECT SUM(${ACTIVE} AND i.status = 'to_schedule') AS to_schedule, SUM(${ACTIVE} AND i.status = 'scheduled') AS scheduled,
        SUM(${ACTIVE} AND i.status = 'scheduled' AND substr(i.scheduled_at, 1, 10) = ?1) AS today, SUM(${ACTIVE} AND (i.due_on < ?1 OR (i.status = 'scheduled' AND substr(i.scheduled_at, 1, 10) < ?1))) AS late,
        SUM(i.status = 'done' AND substr(i.done_at, 1, 7) = substr(?1, 1, 7)) AS done_month
      FROM inspections i LEFT JOIN reports r ON r.id = i.report_id ${f.inspector ? "WHERE i.inspector_id = ?2" : ""}`)
      .bind(t, ...(f.inspector ? [f.inspector] : []))
      .first<{ to_schedule: number | null; scheduled: number | null; today: number | null; late: number | null; done_month: number | null }>(),
    db.prepare(`SELECT u.id, COALESCE(NULLIF(u.name, ''), u.email) AS name, u.last_seen_at, u.avatar_at,
        (SELECT COUNT(*) FROM inspections i LEFT JOIN reports r ON r.id = i.report_id WHERE i.inspector_id = u.id AND ${ACTIVE}) AS active
      FROM users u WHERE u.kind = 'internal' AND u.status NOT IN ('disabled', 'deleted')
        AND (u.role IN ('evaluator', 'inspector') OR ',' || COALESCE(u.duties, '') || ',' LIKE '%,inspector,%' OR EXISTS (SELECT 1 FROM inspections i WHERE i.inspector_id = u.id AND i.glide_id IS NULL))
      ORDER BY active DESC, name`).all<{ id: string; name: string; last_seen_at: string | null; avatar_at: string | null; active: number }>(),
  ]);
  return {
    today: t, week: wk, rows: rows.results.map((r) => shape(r, t)), weekRows: week.results.map((r) => shape(r, t)),
    counts: { toSchedule: counts?.to_schedule ?? 0, scheduled: counts?.scheduled ?? 0, today: counts?.today ?? 0, late: counts?.late ?? 0, doneMonth: counts?.done_month ?? 0 },
    people: people.results.map((p) => ({ id: p.id, name: p.name, active: p.active, ...presenceOf(p.last_seen_at), photo: photoUrl(p.id, p.avatar_at) })),
  };
}
