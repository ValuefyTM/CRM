// Server-only: valuation notes (Notă de evaluare) and their initial report. A note values again a property already
// valued in a report (usually a building under construction, as the works go on): it is linked to that report
// (reports.parent_report_id) and uses the very same property — no new property for a note.
import { now } from "./db";
import { audit } from "./auth";
import type { AssetForm } from "./asset-labels";

export const isNote = (reportType: string | null | undefined) => /^not[ăa] de evaluare/i.test(reportType ?? "");

export type ParentChoice = {
  id: string; number: string | null; label: string | null; date: string | null; fee: number | null; status: string; bank: string | null;
  property_id: string | null; under_construction: boolean; notes: number;
  /** the property's data, ready for the asset form */
  asset: AssetForm | null;
};

type PropRow = {
  property_id: string; category: string | null; type: string | null; construction: string | null; county: string | null; city: string | null; full_address: string | null;
  cf_number: string | null; cad_building: string | null; cad_land: string | null; usable_area: number | null; land_area: number | null; rooms: number | null; floor: string | null;
  height_regime: string | null; year_built: number | null; description: string | null; geo: string | null;
};
const s = (v: unknown) => (v == null ? "" : String(v));
const formOf = (p: PropRow): AssetForm => ({
  category: p.category ?? "REZIDENTIAL", type: p.type ?? "", construction: p.construction ?? "existing", county: s(p.county), city: s(p.city), full_address: s(p.full_address),
  cf_number: s(p.cf_number), cad_building: s(p.cad_building), cad_land: s(p.cad_land), usable_area: s(p.usable_area), year_built: s(p.year_built), description: s(p.description),
  is_main: true, value: "", approach: "", notes: "", contact_kind: "client", contact_name: "", contact_phone: "", land_area: s(p.land_area), rooms: s(p.rooms), floor: s(p.floor),
  height_regime: s(p.height_regime), vehicle_make: "", vehicle_model: "", reg_number: "", vin: "", mileage: "", ...(p.geo ? { geo: p.geo } : {}),
});

/**
 * The client's reports a new note can belong to: reports (not notes, not cancelled), the ones with a building under
 * construction first, then the latest. Each with its property, ready to fill the note's asset.
 */
export async function parentChoices(db: D1Database, clientId: string, exclude?: string): Promise<ParentChoice[]> {
  const { results } = await db.prepare(`SELECT r.id, r.number, r.label, COALESCE(r.report_date, substr(r.created_at, 1, 10)) AS date, r.fee, r.status, COALESCE(b.code, b.name) AS bank,
      (SELECT COUNT(*) FROM reports x WHERE x.parent_report_id = r.id) AS notes,
      p.id AS property_id, p.category, p.type, p.construction, p.county, p.city, p.full_address, p.cf_number, p.cad_building, p.cad_land, p.usable_area, p.land_area, p.rooms,
      p.floor, p.height_regime, p.year_built, p.description, p.geo
    FROM reports r LEFT JOIN entities b ON b.id = r.recipient_id
      LEFT JOIN crm_properties p ON p.id = (SELECT a.property_id FROM assets a JOIN crm_properties pp ON pp.id = a.property_id WHERE a.report_id = r.id
        ORDER BY pp.construction = 'under_construction' DESC, a.is_main DESC LIMIT 1)
    WHERE r.client_id = ?1 AND r.status <> 'cancelled' AND COALESCE(r.report_type, 'Raport de evaluare') NOT LIKE 'Not%' AND r.id <> ?2
    ORDER BY p.construction = 'under_construction' DESC, date DESC LIMIT 30`)
    .bind(clientId, exclude ?? "").all<Omit<ParentChoice, "asset" | "under_construction"> & PropRow>();
  return results.map((r) => ({
    id: r.id, number: r.number, label: r.label, date: r.date, fee: r.fee, status: r.status, bank: r.bank, notes: r.notes, property_id: r.property_id,
    under_construction: r.construction === "under_construction", asset: r.property_id ? formOf(r) : null,
  }));
}

/**
 * Links a note to its initial report (or unlinks it, `parentId` null). Linked, the note's single asset moves onto the
 * initial report's property (the same CF / cadastral number first, else its main one); the property the note had
 * alone is removed, after passing on its map point and photo.
 */
export async function linkNote(db: D1Database, actor: string, noteId: string, parentId: string | null) {
  const note = await db.prepare("SELECT id, report_type, client_id FROM reports WHERE id = ?").bind(noteId).first<{ id: string; report_type: string | null; client_id: string | null }>();
  if (!note) return { ok: false as const, error: "Raportul nu există." };
  if (parentId) {
    if (parentId === noteId) return { ok: false as const, error: "Un raport nu poate fi propriul raport inițial." };
    const p = await db.prepare("SELECT id, number, report_type, parent_report_id FROM reports WHERE id = ?").bind(parentId).first<{ id: string; number: string | null; report_type: string | null; parent_report_id: string | null }>();
    if (!p) return { ok: false as const, error: "Raportul inițial nu există." };
    if (isNote(p.report_type)) return { ok: false as const, error: "Alege raportul inițial, nu o altă notă." };
  }
  await db.prepare("UPDATE reports SET parent_report_id = ?, updated_at = ? WHERE id = ?").bind(parentId, now(), noteId).run();
  if (parentId) await shareProperty(db, noteId, parentId);
  const num = parentId ? (await db.prepare("SELECT number FROM reports WHERE id = ?").bind(parentId).first<{ number: string | null }>())?.number : null;
  await audit(db, `user:${actor}`, "report.parent", "report", noteId, parentId ? `notă la raportul inițial ${num ? `nr. ${num}` : ""}`.trim() : "fără raport inițial");
  return { ok: true as const };
}

/** The note's asset on the initial report's property (when the note has a single asset and its own property). */
async function shareProperty(db: D1Database, noteId: string, parentId: string) {
  const assets = (await db.prepare("SELECT id, property_id FROM assets WHERE report_id = ?").bind(noteId).all<{ id: string; property_id: string }>()).results;
  if (assets.length !== 1) return;
  const a = assets[0];
  const target = await db.prepare(`SELECT a2.property_id AS id FROM assets a2 JOIN crm_properties p2 ON p2.id = a2.property_id LEFT JOIN crm_properties pn ON pn.id = ?1
      WHERE a2.report_id = ?2
      ORDER BY p2.id = pn.id DESC, (NULLIF(TRIM(pn.cf_number), '') IS NOT NULL AND p2.cf_number = pn.cf_number) DESC,
        (NULLIF(TRIM(pn.cad_building), '') IS NOT NULL AND p2.cad_building = pn.cad_building) DESC,
        (NULLIF(TRIM(pn.cad_land), '') IS NOT NULL AND p2.cad_land = pn.cad_land) DESC, a2.is_main DESC LIMIT 1`)
    .bind(a.property_id, parentId).first<{ id: string }>();
  if (!target || target.id === a.property_id) return;
  const old = a.property_id, t = now();
  await db.batch([
    db.prepare(`UPDATE crm_properties SET geo = COALESCE(NULLIF(geo, ''), (SELECT NULLIF(o.geo, '') FROM crm_properties o WHERE o.id = ?1)),
        image_url = COALESCE(NULLIF(image_url, ''), (SELECT NULLIF(o.image_url, '') FROM crm_properties o WHERE o.id = ?1)), updated_at = ?3 WHERE id = ?2`).bind(old, target.id, t),
    db.prepare("UPDATE assets SET property_id = ? WHERE id = ?").bind(target.id, a.id),
  ]);
  const used = await db.prepare("SELECT 1 AS x FROM assets WHERE property_id = ? LIMIT 1").bind(old).first();
  if (!used) {
    await db.prepare("UPDATE property_features SET property_id = ? WHERE property_id = ?").bind(target.id, old).run();
    await db.prepare("DELETE FROM crm_properties WHERE id = ?").bind(old).run().catch(() => null);
  }
}

export type NoteRow = { id: string; number: string | null; label: string | null; date: string | null; fee: number | null; status: string; delivered_at: string | null };

/** The notes made on an initial report, oldest first. */
export async function notesOf(db: D1Database, reportId: string) {
  return (await db.prepare(`SELECT id, number, label, COALESCE(report_date, substr(created_at, 1, 10)) AS date, fee, status, delivered_at
      FROM reports WHERE parent_report_id = ? ORDER BY date, created_at`).bind(reportId).all<NoteRow>()).results;
}
