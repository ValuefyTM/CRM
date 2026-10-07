// Server-only: the assets valued in a report. Each asset points to a property (stable across valuations: the same
// CF / cadastral number found again is linked, so its history follows it), and has its own value and inspection.
import { now, uuid } from "./db";
import { audit } from "./auth";
import { ASSET_CATEGORIES, capType, type AssetInput } from "./asset-labels";

const str = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const opt = (v: unknown, max = 200) => str(v, max) || null;
const num = (v: unknown) => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/\s/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 && n < 1e12 ? Math.round(n * 100) / 100 : null;
};

export function validateAsset(body: unknown): { ok: true; value: AssetInput } | { ok: false; error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const category = ASSET_CATEGORIES.some(([c]) => c === b.category) ? (b.category as string) : null;
  const type = str(b.type, 120).toUpperCase();
  const property = opt(b.property_id, 80);
  if (!property && !type) return { ok: false, error: "Alege tipul bunului." };
  if (!property && !str(b.city, 80) && !str(b.full_address, 300) && category !== "BUN MOBIL") return { ok: false, error: "Completează localitatea sau adresa." };
  const year = num(b.year_built);
  if (year != null && (year < 1700 || year > new Date().getFullYear() + 5)) return { ok: false, error: "Anul construcției nu pare corect." };
  return {
    ok: true,
    value: {
      property_id: property, category, type, construction: b.construction === "under_construction" ? "under_construction" : "existing",
      county: opt(b.county, 60), city: opt(b.city, 80), full_address: opt(b.full_address, 300), cf_number: opt(b.cf_number, 40), cad_building: opt(b.cad_building, 40),
      cad_land: opt(b.cad_land, 40), usable_area: num(b.usable_area), year_built: year != null ? Math.round(year) : null, description: opt(b.description, 2000),
      is_main: b.is_main === true, value: num(b.value), approach: ["market", "income", "cost"].includes(str(b.approach, 10)) ? str(b.approach, 10) : null,
      notes: opt(b.notes, 1000),
      contact_kind: ["client", "owner", "agent", "other"].includes(str(b.contact_kind, 10)) ? str(b.contact_kind, 10) : null,
      contact_name: opt(b.contact_name, 120), contact_phone: opt(b.contact_phone, 40),
    },
  };
}

export type PropertyHit = { id: string; type: string | null; category: string | null; full_address: string | null; city: string | null; cf_number: string | null;
  cad_building: string | null; usable_area: number | null; reports: number; last_report: string | null };

/** Properties already in the CRM, by CF / cadastral number or address (to link the same property again). */
export async function searchProperties(db: D1Database, q: string) {
  const s = q.trim();
  if (s.length < 3) return [];
  const like = `%${s.replace(/[%_]/g, "")}%`;
  return (await db.prepare(`SELECT p.id, p.type, p.category, p.full_address, p.city, p.cf_number, p.cad_building, p.usable_area,
      (SELECT COUNT(*) FROM assets a WHERE a.property_id = p.id) AS reports,
      (SELECT MAX(r.report_date) FROM assets a JOIN reports r ON r.id = a.report_id WHERE a.property_id = p.id) AS last_report
    FROM crm_properties p WHERE p.cf_number = ?1 OR p.cad_building = ?1 OR p.cad_land = ?1 OR p.full_address LIKE ?2 OR p.street LIKE ?2
    ORDER BY (p.cf_number = ?1 OR p.cad_building = ?1 OR p.cad_land = ?1) DESC, p.updated_at DESC LIMIT 12`).bind(s, like).all<PropertyHit>()).results;
}

const PROP_COLS = ["category", "type", "construction", "county", "city", "full_address", "cf_number", "cad_building", "cad_land", "usable_area", "year_built", "description"] as const;
const propValues = (v: AssetInput) => PROP_COLS.map((c) => v[c]);

/** A property with the same CF or building cadastral number, so a new asset does not duplicate it. */
async function sameProperty(db: D1Database, v: AssetInput) {
  if (!v.cf_number && !v.cad_building) return null;
  return db.prepare("SELECT id FROM crm_properties WHERE (? IS NOT NULL AND cf_number = ?) OR (? IS NOT NULL AND cad_building = ?) ORDER BY updated_at DESC LIMIT 1")
    .bind(v.cf_number, v.cf_number, v.cad_building, v.cad_building).first<{ id: string }>();
}

export async function addAsset(db: D1Database, actor: string, reportId: string, v: AssetInput) {
  const t = now();
  let propertyId = v.property_id ?? (await sameProperty(db, v))?.id ?? null;
  const linked = !!propertyId;
  if (propertyId) {
    const p = await db.prepare("SELECT id FROM crm_properties WHERE id = ?").bind(propertyId).first();
    if (!p) return { ok: false as const, error: "Proprietatea aleasă nu mai există." };
    if (await db.prepare("SELECT 1 AS x FROM assets WHERE report_id = ? AND property_id = ?").bind(reportId, propertyId).first())
      return { ok: false as const, error: "Proprietatea este deja în acest raport." };
  } else {
    propertyId = uuid();
    await db.prepare(`INSERT INTO crm_properties (id, ${PROP_COLS.join(", ")}, created_at, updated_at) VALUES (?, ${PROP_COLS.map(() => "?").join(", ")}, ?, ?)`)
      .bind(propertyId, ...propValues(v), t, t).run();
  }
  const first = !(await db.prepare("SELECT 1 AS x FROM assets WHERE report_id = ?").bind(reportId).first());
  const main = v.is_main || first;
  const id = uuid();
  await db.batch([
    ...(main ? [db.prepare("UPDATE assets SET is_main = 0 WHERE report_id = ?").bind(reportId)] : []),
    db.prepare("INSERT INTO assets (id, report_id, property_id, is_main, value, approach, notes, contact_kind, contact_name, contact_phone) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(id, reportId, propertyId, main ? 1 : 0, v.value, v.approach, v.notes, v.contact_kind, v.contact_name, v.contact_phone),
    db.prepare("UPDATE reports SET updated_at = ? WHERE id = ?").bind(t, reportId),
  ]);
  await audit(db, `user:${actor}`, "report.asset_add", "report", reportId, `${capType(v.type) || "bun"}${linked ? " (proprietate existentă)" : ""}`);
  return { ok: true as const, id, linked };
}

export async function updateAsset(db: D1Database, actor: string, reportId: string, assetId: string, v: AssetInput) {
  const a = await db.prepare("SELECT id, property_id FROM assets WHERE id = ? AND report_id = ?").bind(assetId, reportId).first<{ id: string; property_id: string }>();
  if (!a) return { ok: false as const, error: "Bunul nu aparține acestui raport." };
  const t = now();
  await db.batch([
    db.prepare(`UPDATE crm_properties SET ${PROP_COLS.map((c) => `${c} = ?`).join(", ")}, updated_at = ? WHERE id = ?`).bind(...propValues(v), t, a.property_id),
    ...(v.is_main ? [db.prepare("UPDATE assets SET is_main = 0 WHERE report_id = ? AND id <> ?").bind(reportId, assetId)] : []),
    db.prepare("UPDATE assets SET is_main = CASE WHEN ? THEN 1 ELSE is_main END, value = ?, approach = ?, notes = ?, contact_kind = ?, contact_name = ?, contact_phone = ? WHERE id = ?")
      .bind(v.is_main ? 1 : 0, v.value, v.approach, v.notes, v.contact_kind, v.contact_name, v.contact_phone, assetId),
    db.prepare("UPDATE reports SET updated_at = ? WHERE id = ?").bind(t, reportId),
  ]);
  await audit(db, `user:${actor}`, "report.asset_edit", "report", reportId, capType(v.type) || "bun");
  return { ok: true as const };
}

/** Takes an asset out of the report (the property stays, with its other valuations). Not once it has been inspected. */
export async function removeAsset(db: D1Database, actor: string, reportId: string, assetId: string) {
  const a = await db.prepare(`SELECT a.id, a.is_main, p.type, (SELECT COUNT(*) FROM inspections i WHERE i.asset_id = a.id AND i.status = 'done') AS done,
      (SELECT COUNT(*) FROM inspection_sheets s WHERE s.asset_id = a.id) AS sheets,
      (SELECT COUNT(*) FROM inspection_photos f JOIN inspections i ON i.id = f.inspection_id WHERE i.asset_id = a.id) AS photos
    FROM assets a JOIN crm_properties p ON p.id = a.property_id WHERE a.id = ? AND a.report_id = ?`).bind(assetId, reportId)
    .first<{ id: string; is_main: number; type: string | null; done: number; sheets: number; photos: number }>();
  if (!a) return { ok: false as const, error: "Bunul nu aparține acestui raport." };
  if (a.done || a.sheets || a.photos) return { ok: false as const, error: "Bunul are deja inspecție sau fișă de inspecție și nu mai poate fi scos din raport." };
  await db.batch([
    // Its inspection tasks (none done, no sheet, no photos) go with it.
    db.prepare("DELETE FROM inspection_schedule_log WHERE inspection_id IN (SELECT id FROM inspections WHERE asset_id = ?)").bind(assetId),
    db.prepare("DELETE FROM inspections WHERE asset_id = ?").bind(assetId),
    db.prepare("DELETE FROM assets WHERE id = ?").bind(assetId),
    // The main asset goes: the next one becomes main.
    ...(a.is_main ? [db.prepare("UPDATE assets SET is_main = 1 WHERE id = (SELECT id FROM assets WHERE report_id = ? ORDER BY created_at LIMIT 1)").bind(reportId)] : []),
    db.prepare("UPDATE reports SET updated_at = ? WHERE id = ?").bind(now(), reportId),
  ]);
  await audit(db, `user:${actor}`, "report.asset_remove", "report", reportId, capType(a.type) || "bun");
  return { ok: true as const };
}
