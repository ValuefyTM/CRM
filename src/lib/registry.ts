import { fileSrc } from "./files";
import { reportVisibleSql, type PropertyScope } from "./perms-db";
import { DEFAULT_CONFIG, type TeamMatrix } from "./perms";

// Server-only: the register of valued properties — every property with its latest valuation (date, value, value per
// m²), filters, statistics and the points for the map.
export type RegistryFilters = {
  q?: string; cat?: string; county?: string; city?: string; year?: string; geo?: string; sort?: string; page?: number;
  /** Comparables search: property type, usable area (m²), year built, valued in the last n months. */
  tip?: string; smin?: string; smax?: string; amin?: string; amax?: string; luni?: string;
};
/** Who looks: without "reports.all", a report opens only for its team (see perms-db). */
/** `noInspector`: the reports where the user is only inspector don't open (see inspectorHidden). `scope`: the properties
 * the user works on (Proprietăți, „Pe ce date”; see propertyScope), null for all of them. */
export type RegistryViewer = { id: string; all: boolean; team?: TeamMatrix; noInspector?: boolean; scope?: PropertyScope };

export type RegistryRow = {
  id: string; category: string | null; type: string | null; county: string | null; city: string | null; full_address: string | null; geo: string | null;
  cf_number: string | null; cad_building: string | null; usable_area: number | null; year_built: number | null; image_url: string | null;
  valuations: number | null; last_date: string | null; report_id: string | null; report_number: string | null; value: number | null; sqm: number | null;
  photo?: string | null;
  /** 0 when the user may not open the latest report (not in its team). */
  can_open?: number;
};
export type RegistryPoint = { id: string; lat: number; lng: number; cat: string; label: string; address: string; value: number | null; date: string | null };

export const REGISTRY_SORTS: Record<string, [string, string]> = {
  "": ["Evaluate recent", "p.last_date DESC NULLS LAST"],
  value: ["Valoare mare", "p.value DESC NULLS LAST"],
  sqm: ["Valoare / m² mare", "p.sqm DESC NULLS LAST"],
  area: ["Suprafață mare", "p.usable_area DESC NULLS LAST"],
  count: ["Cele mai multe evaluări", "p.valuations DESC NULLS LAST"],
};
export const REGISTRY_PAGE = 50;

/** Each property with its latest valuation: the asset's own value, else the report value when the report has only that asset. */
export const BASE = `WITH v0 AS (
    SELECT a.property_id, a.report_id, r.number,
      COALESCE(r.report_date, substr(r.created_at, 1, 10)) AS d,
      COALESCE(a.value, CASE WHEN (SELECT COUNT(*) FROM assets x WHERE x.report_id = a.report_id) = 1 THEN r.result_value END) AS val
    FROM assets a LEFT JOIN reports r ON r.id = a.report_id
  ),
  v AS (
    SELECT v0.*, ROW_NUMBER() OVER (PARTITION BY property_id ORDER BY d DESC) AS rn, COUNT(*) OVER (PARTITION BY property_id) AS n,
      -- the latest known value (a newer valuation may have none recorded)
      FIRST_VALUE(val) OVER (PARTITION BY property_id ORDER BY val IS NULL, d DESC) AS value
    FROM v0
  ),
  p AS (
    SELECT p.id, p.category, p.type, p.county, p.city, p.full_address, p.street, p.geo, p.cf_number, p.cad_building, p.cad_land, p.usable_area, p.year_built, p.image_url,
      v.n AS valuations, v.d AS last_date, v.report_id, v.number AS report_number, v.value,
      CASE WHEN v.value > 0 AND p.usable_area > 0 THEN v.value / p.usable_area END AS sqm
    FROM crm_properties p LEFT JOIN v ON v.property_id = p.id AND v.rn = 1
  )`;

const HAS_GEO = "p.geo LIKE '%_,_%'";
/** A picture of the property: its own photo (Glide), else an exterior photo from an inspection, else the inspection sheet photo. */
const PHOTO = `COALESCE(NULLIF(p.image_url, ''),
  (SELECT 'r2:' || f.r2_key FROM inspection_photos f JOIN inspections i ON i.id = f.inspection_id JOIN assets a ON a.id = i.asset_id
    WHERE a.property_id = p.id AND f.deleted_at IS NULL ORDER BY f.category = 'exterior' DESC, f.taken_at DESC LIMIT 1),
  (SELECT s.photo_url FROM inspection_sheets s JOIN assets a ON a.id = s.asset_id WHERE a.property_id = p.id AND s.photo_url IS NOT NULL AND s.photo_url <> '' LIMIT 1))`;

function where(f: RegistryFilters, viewer?: RegistryViewer) {
  const w: string[] = ["p.category IS NOT 'BUN MOBIL'"];
  const a: (string | number)[] = [];
  if (viewer?.scope) { w.push(viewer.scope.sql); a.push(...viewer.scope.binds); }
  if (f.cat) { w.push("p.category = ?"); a.push(f.cat); }
  if (f.county) { w.push("p.county = ?"); a.push(f.county); }
  if (f.city) { w.push("p.city = ?"); a.push(f.city); }
  if (f.year && /^\d{4}$/.test(f.year)) { w.push("substr(p.last_date, 1, 4) = ?"); a.push(f.year); }
  if (f.geo === "1") w.push(HAS_GEO);
  if (f.tip) { w.push("LOWER(TRIM(p.type)) = LOWER(?)"); a.push(f.tip.trim()); }
  const n = (v?: string) => (v && /^\d+(?:[.,]\d+)?$/.test(v.trim()) ? Number(v.replace(",", ".")) : null);
  if (n(f.smin) != null) { w.push("p.usable_area >= ?"); a.push(n(f.smin)!); }
  if (n(f.smax) != null) { w.push("p.usable_area <= ?"); a.push(n(f.smax)!); }
  if (n(f.amin) != null) { w.push("p.year_built >= ?"); a.push(n(f.amin)!); }
  if (n(f.amax) != null) { w.push("p.year_built <= ?"); a.push(n(f.amax)!); }
  if (n(f.luni) != null) {
    const d = new Date(); d.setMonth(d.getMonth() - n(f.luni)!);
    w.push("p.last_date >= ?"); a.push(d.toISOString().slice(0, 10));
  }
  // Several terms separated by commas, all of them to be found ("BRD, Giroc, Popescu"): each in the property itself or in
  // one of its reports — number, label, client, the report's user (the bank), issuer, purpose, the team.
  const terms = (f.q ?? "").split(",").map((t) => t.trim()).filter(Boolean).slice(0, 8);
  for (const t of terms) {
    const like = `%${t.replace(/[%_]/g, "")}%`;
    w.push(`(p.full_address LIKE ? OR p.street LIKE ? OR p.city LIKE ? OR p.county LIKE ? OR p.type LIKE ? OR p.cf_number LIKE ? OR p.cad_building = ? OR p.cad_land = ?
      OR EXISTS (SELECT 1 FROM assets ax JOIN reports rx ON rx.id = ax.report_id
        LEFT JOIN entities ec ON ec.id = rx.client_id LEFT JOIN entities eb ON eb.id = rx.recipient_id LEFT JOIN entities ei ON ei.id = rx.issuer_id
        WHERE ax.property_id = p.id AND (rx.number = ? OR rx.label LIKE ? OR ec.name LIKE ? OR ec.cui = ? OR eb.name LIKE ? OR eb.code LIKE ? OR ei.name LIKE ? OR rx.purpose LIKE ?
          OR EXISTS (SELECT 1 FROM report_members mx JOIN users ux ON ux.id = mx.user_id WHERE mx.report_id = rx.id AND COALESCE(NULLIF(ux.name, ''), ux.email) LIKE ?))))`);
    a.push(like, like, like, like, like, like, t, t, t, like, like, t, like, like, like, like, like);
  }
  return { sql: `WHERE ${w.join(" AND ")}`, args: a };
}

/** Category code as stored ("Rezidential ", "REZIDENȚIAL" → "REZIDENTIAL"). */
export const catKey = (c: string | null | undefined) => (c ?? "").trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

export function parseGeo(g: string | null): [number, number] | null {
  const m = g?.match(/(-?\d+(?:\.\d+)?)\s*[,; ]\s*(-?\d+(?:\.\d+)?)/);
  if (!m) return null;
  const lat = Number(m[1]), lng = Number(m[2]);
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && (lat || lng) ? [lat, lng] : null;
}

export async function registry(db: D1Database, f: RegistryFilters, viewer?: RegistryViewer) {
  const { sql, args } = where(f, viewer);
  const open = viewer && !viewer.all ? `CASE WHEN p.report_id IS NULL OR ${reportVisibleSql(viewer.team ?? DEFAULT_CONFIG.team, "p.report_id", viewer.noInspector)} THEN 1 ELSE 0 END` : "1";
  const openArgs = viewer && !viewer.all ? [viewer.id] : [];
  const page = Math.max(1, f.page ?? 1);
  const since = new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);
  const [rows, stats, pts] = await Promise.all([
    db.prepare(`${BASE} SELECT p.*, ${PHOTO} AS photo, ${open} AS can_open FROM p ${sql} ORDER BY ${(REGISTRY_SORTS[f.sort ?? ""] ?? REGISTRY_SORTS[""])[1]}, p.id LIMIT ${REGISTRY_PAGE} OFFSET ?`)
      .bind(...openArgs, ...args, (page - 1) * REGISTRY_PAGE).all<RegistryRow>(),
    db.prepare(`${BASE} SELECT COUNT(*) AS n, SUM(p.valuations) AS valuations, SUM(${HAS_GEO}) AS geo, SUM(p.last_date >= ?) AS recent,
        AVG(CASE WHEN p.sqm BETWEEN 50 AND 100000 THEN p.sqm END) AS sqm, AVG(CASE WHEN p.value > 0 THEN p.value END) AS value,
        AVG(CASE WHEN p.usable_area > 0 AND p.usable_area < 100000 THEN p.usable_area END) AS area
      FROM p ${sql}`).bind(since, ...args)
      .first<{ n: number; valuations: number | null; geo: number | null; recent: number | null; sqm: number | null; value: number | null; area: number | null }>(),
    db.prepare(`${BASE} SELECT p.id, p.geo, p.category, p.type, COALESCE(p.full_address, p.city) AS address, p.value, p.last_date FROM p ${sql} AND ${HAS_GEO}
      ORDER BY p.last_date DESC NULLS LAST LIMIT 6000`).bind(...args)
      .all<{ id: string; geo: string; category: string | null; type: string | null; address: string | null; value: number | null; last_date: string | null }>(),
  ]);
  const points: RegistryPoint[] = [];
  for (const p of pts.results) {
    const ll = parseGeo(p.geo);
    if (ll) points.push({ id: p.id, lat: ll[0], lng: ll[1], cat: catKey(p.category), label: p.type ?? "Proprietate", address: p.address ?? "", value: p.value, date: p.last_date });
  }
  return {
    rows: rows.results.map((r) => ({ ...r, photo: fileSrc(r.photo) })), points, page,
    stats: { n: stats?.n ?? 0, valuations: stats?.valuations ?? 0, geo: stats?.geo ?? 0, recent: stats?.recent ?? 0, sqm: stats?.sqm ?? null, value: stats?.value ?? null, area: stats?.area ?? null },
  };
}

/** Values for the filter dropdowns (cities within the chosen county). */
export async function registryFacets(db: D1Database, county?: string, cat?: string) {
  const [cats, counties, cities, years, types] = await Promise.all([
    db.prepare("SELECT category AS k, COUNT(*) AS n FROM crm_properties WHERE category IS NOT NULL AND category <> 'BUN MOBIL' GROUP BY k ORDER BY n DESC").all<{ k: string; n: number }>(),
    db.prepare("SELECT county AS k, COUNT(*) AS n FROM crm_properties WHERE county IS NOT NULL AND county <> '' GROUP BY k ORDER BY n DESC").all<{ k: string; n: number }>(),
    db.prepare(`SELECT city AS k, COUNT(*) AS n FROM crm_properties WHERE city IS NOT NULL AND city <> '' ${county ? "AND county = ?" : ""} GROUP BY k ORDER BY n DESC LIMIT 60`)
      .bind(...(county ? [county] : [])).all<{ k: string; n: number }>(),
    db.prepare(`SELECT substr(COALESCE(r.report_date, r.created_at), 1, 4) AS k, COUNT(DISTINCT a.property_id) AS n FROM assets a JOIN reports r ON r.id = a.report_id GROUP BY k HAVING k IS NOT NULL ORDER BY k DESC`)
      .all<{ k: string; n: number }>(),
    db.prepare(`SELECT TRIM(type) AS k, COUNT(*) AS n FROM crm_properties WHERE type IS NOT NULL AND TRIM(type) <> '' AND category IS NOT 'BUN MOBIL' ${cat ? "AND category = ?" : ""}
      GROUP BY LOWER(TRIM(type)) ORDER BY n DESC LIMIT 40`).bind(...(cat ? [cat] : [])).all<{ k: string; n: number }>(),
  ]);
  return { cats: cats.results, counties: counties.results, cities: cities.results, years: years.results, types: types.results };
}

/** One property with all its valuations. */
export async function registryProperty(db: D1Database, id: string) {
  const p = await db.prepare(`${BASE} SELECT p.*, x.construction, x.description, x.zone, x.cf_file, x.plan_file, x.geo_source, x.geo_note, x.geo_checked_at FROM p JOIN crm_properties x ON x.id = p.id WHERE p.id = ?`).bind(id)
    .first<RegistryRow & { construction: string | null; description: string | null; zone: string | null; cad_land: string | null; cf_file: string | null; plan_file: string | null; geo_source: string | null; geo_note: string | null; geo_checked_at: string | null }>();
  if (!p) return null;
  const valuations = (await db.prepare(`SELECT a.id, a.value, a.is_main, a.approach, r.id AS report_id, r.number, r.status, r.delivered_at, r.result_value, r.currency, r.purpose,
      COALESCE(r.report_date, substr(r.created_at, 1, 10)) AS date, c.name AS client, b.name AS bank,
      (SELECT COUNT(*) FROM assets x WHERE x.report_id = a.report_id) AS assets,
      (SELECT COALESCE(NULLIF(u.name, ''), u.email) FROM report_members m JOIN users u ON u.id = m.user_id WHERE m.report_id = r.id AND m.role = 'evaluator' LIMIT 1) AS evaluator
    FROM assets a LEFT JOIN reports r ON r.id = a.report_id LEFT JOIN entities c ON c.id = r.client_id LEFT JOIN entities b ON b.id = r.recipient_id
    WHERE a.property_id = ? ORDER BY date DESC`).bind(id)
    .all<{ id: string; value: number | null; is_main: number; approach: string | null; report_id: string | null; number: string | null; status: string | null; delivered_at: string | null; result_value: number | null;
      currency: string | null; purpose: string | null; date: string | null; client: string | null; bank: string | null; assets: number; evaluator: string | null }>()).results;
  return { property: p, valuations };
}
