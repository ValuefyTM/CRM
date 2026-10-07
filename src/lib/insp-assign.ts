// Server-only: inspection tasks given from the CRM report page. The main evaluator of the report (or an owner /
// administrator) gives the inspection of an asset to themselves or to a colleague; the inspector schedules it in the app.
import { now, uuid } from "./db";
import { appUrl, INSP_ROLES } from "./site";
import { audit } from "./auth";
import { esc, layout, sendEmail } from "./email";
import { isAdmin, type User } from "./users";
import { FORMS, guessSheetType, sheetTypeLabel, type SheetType } from "./insp-forms";

/** Main evaluator of the report, owners and administrators. */
export async function canAssign(db: D1Database, user: User, reportId: string) {
  if (isAdmin(user)) return true;
  const m = await db.prepare("SELECT 1 AS ok FROM report_members WHERE report_id = ? AND user_id = ? AND role = 'evaluator'").bind(reportId, user.id).first<{ ok: number }>();
  return !!m;
}

/** Who can receive an inspection: the one giving it, and colleagues who are inspectors or evaluators. */
export async function inspectorChoices(db: D1Database, me: string) {
  return (await db
    .prepare(`SELECT id, COALESCE(NULLIF(name, ''), email) AS name, role, coverage FROM users
      WHERE kind = 'internal' AND status <> 'disabled' AND (id = ? OR role IN (${INSP_ROLES.map(() => "?").join(", ")})) ORDER BY name`)
    .bind(me, ...INSP_ROLES)
    .all<{ id: string; name: string; role: string; coverage: string | null }>()).results;
}

/** The task in progress for an asset (made in the CRM, not yet done or cancelled). */
export const openTask = (db: D1Database, assetId: string) =>
  db.prepare("SELECT id, inspector_id, status, scheduled_at FROM inspections WHERE asset_id = ? AND glide_id IS NULL AND status IN ('to_schedule', 'scheduled') ORDER BY created_at DESC LIMIT 1")
    .bind(assetId).first<{ id: string; inspector_id: string | null; status: string; scheduled_at: string | null }>();

const str = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const CONTACT_KINDS = ["client", "owner", "agent", "other"];

export async function assignInspection(db: D1Database, user: User, reportId: string, b: Record<string, unknown>) {
  const asset = await db
    .prepare(`SELECT a.id, a.report_id, p.category, p.type, COALESCE(p.full_address, p.city) AS address, r.order_id, r.number, o.property_type AS order_type
      FROM assets a JOIN crm_properties p ON p.id = a.property_id JOIN reports r ON r.id = a.report_id LEFT JOIN orders o ON o.id = r.order_id
      WHERE a.id = ? AND a.report_id = ?`)
    .bind(str(b.asset, 80), reportId)
    .first<{ id: string; report_id: string; category: string | null; type: string | null; address: string | null; order_id: string | null; number: string | null; order_type: string | null }>();
  if (!asset) return { ok: false as const, error: "Bunul nu aparține acestui raport." };
  const inspector = await db
    .prepare(`SELECT id, email, COALESCE(NULLIF(name, ''), email) AS name, role FROM users WHERE id = ? AND kind = 'internal' AND status <> 'disabled'`)
    .bind(str(b.inspector, 80))
    .first<{ id: string; email: string; name: string; role: string }>();
  if (!inspector || (inspector.id !== user.id && !INSP_ROLES.includes(inspector.role))) return { ok: false as const, error: "Alege-te pe tine sau un coleg inspector / evaluator." };
  const type = (FORMS as Record<string, unknown>)[str(b.sheet_type, 20)] ? (str(b.sheet_type, 20) as SheetType) : guessSheetType(asset.category, asset.type, asset.order_type);
  const due = str(b.due_on, 10);
  if (due && !/^\d{4}-\d{2}-\d{2}$/.test(due)) return { ok: false as const, error: "Termenul nu este o dată validă." };
  const kind = CONTACT_KINDS.includes(str(b.contact_kind, 20)) ? str(b.contact_kind, 20) : null;
  const name = str(b.contact_name, 120) || null, phone = str(b.contact_phone, 40) || null;
  const instructions = typeof b.instructions === "string" ? b.instructions.trim().slice(0, 2000) || null : null;
  const t = now();

  const open = await openTask(db, asset.id);
  let id: string;
  if (open) {
    // Reallocation: a scheduled visit stays scheduled only if the inspector does not change.
    id = open.id;
    const same = open.inspector_id === inspector.id;
    await db
      .prepare(`UPDATE inspections SET inspector_id = ?, sheet_type = ?, due_on = ?, contact_kind = ?, contact_name = ?, contact_phone = ?, instructions = ?,
        assigned_by = ?, assigned_at = ?, status = CASE WHEN ? THEN status ELSE 'to_schedule' END, scheduled_at = CASE WHEN ? THEN scheduled_at ELSE NULL END, updated_at = ? WHERE id = ?`)
      .bind(inspector.id, type, due || null, kind, name, phone, instructions, user.id, t, same ? 1 : 0, same ? 1 : 0, t, id)
      .run();
  } else {
    id = uuid();
    await db
      .prepare(`INSERT INTO inspections (id, asset_id, report_id, order_id, inspector_id, status, sheet_type, due_on, contact_kind, contact_name, contact_phone, instructions,
        assigned_by, assigned_at, updated_at) VALUES (?, ?, ?, ?, ?, 'to_schedule', ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, asset.id, reportId, asset.order_id, inspector.id, type, due || null, kind, name, phone, instructions, user.id, t, t)
      .run();
  }
  await db.batch([
    db.prepare("INSERT OR IGNORE INTO report_members (report_id, user_id, role) VALUES (?, ?, 'inspector')").bind(reportId, inspector.id),
    db.prepare("UPDATE reports SET updated_at = ? WHERE id = ?").bind(t, reportId),
  ]);
  const what = `${asset.type ? asset.type.toLowerCase() : "bun"} → ${inspector.name}`;
  await audit(db, `user:${user.id}`, open ? "report.inspection_reassign" : "report.inspection_assign", "report", reportId, what);
  await audit(db, `user:${user.id}`, "inspection.assign", "inspection", id, inspector.id);

  if (inspector.id !== user.id) {
    const link = await appUrl("insp", "/");
    const where = asset.address ?? "proprietatea din raport";
    const dueText = due ? ` până la ${due.split("-").reverse().join(".")}` : "";
    await sendEmail({
      to: inspector.email,
      subject: `Inspecție nouă de programat: ${where}`,
      text: `${user.name || "Evaluatorul"} ți-a alocat inspecția pentru ${where}${asset.number ? ` (raport ${asset.number})` : ""}${dueText}. Fișă: ${sheetTypeLabel(type)}.${name ? ` Contact: ${name} ${phone ?? ""}.` : ""}${instructions ? `\nInstrucțiuni: ${instructions}` : ""}\nProgramează inspecția din aplicație: ${link}`,
      html: layout({
        eyebrow: "Inspecții VALUEFY",
        title: "Ai o inspecție nouă de programat",
        body: `<p style="margin:0 0 10px;font-size:15px;line-height:1.65;color:#4A4A66"><strong style="color:#17173A">${esc(user.name || "Evaluatorul")}</strong> ți-a alocat inspecția pentru <strong style="color:#17173A">${esc(where)}</strong>${asset.number ? ` (raport ${esc(asset.number)})` : ""}${esc(dueText)}.</p>
<p style="margin:0 0 10px;font-size:15px;line-height:1.65;color:#4A4A66">Fișă: ${esc(sheetTypeLabel(type))}${name ? ` · Contact: ${esc(name)} ${esc(phone ?? "")}` : ""}</p>
${instructions ? `<p style="margin:0;font-size:15px;line-height:1.65;color:#4A4A66;white-space:pre-wrap">${esc(instructions)}</p>` : ""}`,
        button: { label: "Programează din aplicație →", url: link },
        foot: "Inspecția apare în aplicația de inspecții la „De programat”.",
      }),
    });
  }
  return { ok: true as const, id };
}

/** Cancels a task that is not done yet (the inspection disappears from the inspector's app). */
export async function cancelInspection(db: D1Database, user: User, reportId: string, inspectionId: string) {
  const i = await db
    .prepare("SELECT i.id, COALESCE(NULLIF(u.name, ''), u.email) AS inspector FROM inspections i LEFT JOIN users u ON u.id = i.inspector_id WHERE i.id = ? AND i.report_id = ? AND i.glide_id IS NULL AND i.status IN ('to_schedule', 'scheduled')")
    .bind(inspectionId, reportId)
    .first<{ id: string; inspector: string | null }>();
  if (!i) return { ok: false as const, error: "Inspecția nu mai poate fi anulată (este finalizată sau nu există)." };
  const t = now();
  await db.prepare("UPDATE inspections SET status = 'cancelled', cancelled_at = ?, cancelled_by = ?, updated_at = ? WHERE id = ?").bind(t, user.id, t, i.id).run();
  await audit(db, `user:${user.id}`, "report.inspection_cancel", "report", reportId, i.inspector ?? "");
  return { ok: true as const };
}
