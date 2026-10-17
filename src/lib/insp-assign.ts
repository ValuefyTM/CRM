// Server-only: inspection tasks given from the CRM report page. The main evaluator of the report (or an owner /
// administrator) gives the inspection of an asset to themselves or to a colleague; the inspector schedules it in the app.
import { now, uuid } from "./db";
import { appUrl } from "./site";
import { audit } from "./auth";
import { esc, layout, sendEmail } from "./email";
import { type User } from "./users";
import { isFinished, reportAccess } from "./perms-db";
import { can } from "./perms";
import { guessSheetType, sheetTypeLabel, type SheetType } from "./insp-forms";
import { STD, templateList } from "./insp-templates-db";
import { photoUrl, presenceOf } from "./presence";
import { missingDocs, missingText, type DocType } from "./insp-docs";
import { cancelInUvalo, deleteInUvalo, inspChannel, inspectorByLegit, later, pushInspection, uvaloAppUrl } from "./uvalo";

/** Who gives the inspector of a report: whoever allocates its team (the main evaluator), or "Inspecții: alocă inspectorul". */
export async function canAssign(db: D1Database, user: User, reportId: string) {
  const r = await db.prepare("SELECT id, status, delivered_at FROM reports WHERE id = ?").bind(reportId).first<{ id: string; status: string; delivered_at: string | null }>();
  // Nothing is given on a finished report (it is reopened first).
  if (!r || isFinished(r)) return false;
  if (can(user, "inspections:assign")) return true;
  return (await reportAccess(db, user, r)).can.members;
}

/** Who can receive an inspection: every active team member (evaluators also inspect). */
export async function inspectorChoices(db: D1Database, me: string) {
  return (await db
    .prepare(`SELECT id, COALESCE(NULLIF(name, ''), email) AS name, role, coverage, last_seen_at, avatar_at FROM users
      WHERE kind = 'internal' AND status NOT IN ('disabled', 'deleted') ORDER BY id = ? DESC, name`)
    .bind(me)
    .all<{ id: string; name: string; role: string; coverage: string | null; last_seen_at: string | null; avatar_at: string | null }>()).results
    .map((u) => ({ ...u, ...presenceOf(u.last_seen_at), photo: photoUrl(u.id, u.avatar_at) }));
}

/** The task in progress for an asset (made in the CRM, not yet done or cancelled). */
export const openTask = (db: D1Database, assetId: string) =>
  db.prepare("SELECT id, inspector_id, status, scheduled_at FROM inspections WHERE asset_id = ? AND glide_id IS NULL AND status IN ('to_schedule', 'scheduled') ORDER BY created_at DESC LIMIT 1")
    .bind(assetId).first<{ id: string; inspector_id: string | null; status: string; scheduled_at: string | null }>();

const str = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const CONTACT_KINDS = ["client", "owner", "agent", "other"];

/**
 * Gives (or reallocates) the inspection of an asset. The inspector needs at least the CF extract and the floor survey:
 * without them the task is given only when `confirm_missing` is true (otherwise `missing` lists what is not uploaded).
 */
export async function assignInspection(db: D1Database, user: User, reportId: string, b: Record<string, unknown>)
  : Promise<{ ok: true; id: string; missing: DocType[]; uvalo?: string | null } | { ok: false; error: string; missing?: DocType[] }> {
  const asset = await db
    .prepare(`SELECT a.id, a.report_id, p.category, p.type, COALESCE(p.full_address, p.city) AS address, r.order_id, r.number, o.property_type AS order_type
      FROM assets a JOIN crm_properties p ON p.id = a.property_id JOIN reports r ON r.id = a.report_id LEFT JOIN orders o ON o.id = r.order_id
      WHERE a.id = ? AND a.report_id = ?`)
    .bind(str(b.asset, 80), reportId)
    .first<{ id: string; report_id: string; category: string | null; type: string | null; address: string | null; order_id: string | null; number: string | null; order_type: string | null }>();
  if (!asset) return { ok: false as const, error: "Bunul nu aparține acestui raport." };
  const inspector = await db
    .prepare(`SELECT id, email, COALESCE(NULLIF(name, ''), email) AS name, role, duties, anevar_no FROM users WHERE id = ? AND kind = 'internal' AND status NOT IN ('disabled', 'deleted')`)
    .bind(str(b.inspector, 80))
    .first<{ id: string; email: string; name: string; role: string; duties: string | null; anevar_no: string | null }>();
  if (!inspector) return { ok: false as const, error: "Alege inspectorul: tu sau un coleg din echipă." };
  // Inspections through UVALO: the inspector needs a UVALO account with the same ANEVAR card (checked before anything is saved).
  const viaUvalo = (await inspChannel(db)) === "uvalo";
  if (viaUvalo) {
    if (!inspector.anevar_no?.trim()) return { ok: false as const, error: `${inspector.name} nu are legitimația ANEVAR completată în CRM (Utilizatori); fără ea nu primește inspecția în UVALO.` };
    const found = await inspectorByLegit(inspector.anevar_no).catch((e: Error & { status?: number }) => (e.status === 404 ? null : e));
    if (found instanceof Error) return { ok: false as const, error: `UVALO: ${found.message}` };
    if (!found) return { ok: false as const, error: `${inspector.name} nu are cont UVALO activ cu legitimația ${inspector.anevar_no}. Fără cont nu poate primi inspecția (sau treci pe aplicația CRM din Setări → Fișe de inspecție).` };
  }
  // The sheet: one of the firm's (its built-in type goes in sheet_type, the sheet itself in template), else the standard one
  // (UVALO's sheet of the type; in the CRM app the VALUEFY model).
  const sheets = await templateList(db);
  const picked = sheets.find((x) => x.key === str(b.sheet_type, 40));
  const type: SheetType = picked?.base ?? guessSheetType(asset.category, asset.type, asset.order_type);
  const template = picked?.key ?? STD;
  const sheetName = picked?.name ?? `standard (${sheetTypeLabel(type).toLowerCase()})`;
  const due = str(b.due_on, 10);
  if (due && !/^\d{4}-\d{2}-\d{2}$/.test(due)) return { ok: false as const, error: "Termenul nu este o dată validă." };
  const kind = CONTACT_KINDS.includes(str(b.contact_kind, 20)) ? str(b.contact_kind, 20) : null;
  const name = str(b.contact_name, 120) || null, phone = str(b.contact_phone, 40) || null;
  const instructions = typeof b.instructions === "string" ? b.instructions.trim().slice(0, 2000) || null : null;
  // The documents the inspector may open, when chosen (ids of the report's documents); else the CF and floor survey.
  let docRefs: string | null = null;
  if (Array.isArray(b.doc_refs)) {
    const ids = (b.doc_refs as unknown[]).filter((x): x is string => typeof x === "string").slice(0, 100);
    const ok = ids.length ? (await db.prepare(`SELECT id FROM report_documents WHERE report_id = ? AND id IN (${ids.map(() => "?").join(", ")})`).bind(reportId, ...ids).all<{ id: string }>()).results.map((x) => x.id) : [];
    docRefs = JSON.stringify(ok);
  }
  const missing = docRefs ? [] : await missingDocs(db, reportId, asset.id);
  if (missing.length && b.confirm_missing !== true)
    return { ok: false as const, missing, error: `Nu sunt încărcate ${missingText(missing)}. Confirmă că aloci inspecția fără ${missing.length > 1 ? "ele" : "el"}.` };
  const t = now();

  const open = await openTask(db, asset.id);
  let id: string;
  if (open) {
    // Reallocation: a scheduled visit stays scheduled only if the inspector does not change.
    id = open.id;
    const same = open.inspector_id === inspector.id;
    await db
      .prepare(`UPDATE inspections SET inspector_id = ?, sheet_type = ?, template = ?, due_on = ?, contact_kind = ?, contact_name = ?, contact_phone = ?, instructions = ?,
        assigned_by = ?, assigned_at = ?, status = CASE WHEN ? THEN status ELSE 'to_schedule' END, scheduled_at = CASE WHEN ? THEN scheduled_at ELSE NULL END, updated_at = ?,
        doc_refs = COALESCE(?, doc_refs) WHERE id = ?`)
      .bind(inspector.id, type, template, due || null, kind, name, phone, instructions, user.id, t, same ? 1 : 0, same ? 1 : 0, t, docRefs, id)
      .run();
  } else {
    id = uuid();
    await db
      .prepare(`INSERT INTO inspections (id, asset_id, report_id, order_id, inspector_id, status, sheet_type, template, due_on, contact_kind, contact_name, contact_phone, instructions,
        assigned_by, assigned_at, updated_at, doc_refs) VALUES (?, ?, ?, ?, ?, 'to_schedule', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, asset.id, reportId, asset.order_id, inspector.id, type, template, due || null, kind, name, phone, instructions, user.id, t, t, docRefs)
      .run();
  }
  await db.batch([
    db.prepare("INSERT OR IGNORE INTO report_members (report_id, user_id, role) VALUES (?, ?, 'inspector')").bind(reportId, inspector.id),
    db.prepare("UPDATE assets SET no_inspection = NULL, no_inspection_at = NULL, no_inspection_by = NULL WHERE id = ?").bind(asset.id),
    db.prepare("UPDATE reports SET updated_at = ? WHERE id = ?").bind(t, reportId),
  ]);
  const what = `${asset.type ? asset.type.toLowerCase() : "bun"} → ${inspector.name}`;
  await audit(db, `user:${user.id}`, open ? "report.inspection_reassign" : "report.inspection_assign", "report", reportId, what);
  await audit(db, `user:${user.id}`, "inspection.assign", "inspection", id, inspector.id);
  if (missing.length) await audit(db, `user:${user.id}`, "report.inspection_without_docs", "report", reportId, `fără ${missingText(missing)}`);

  // UVALO: the inspection goes to the inspector's phone there (a send that fails stays on the inspection, with "Retrimite").
  const uvalo = viaUvalo ? await pushInspection(db, id) : null;
  if (inspector.id !== user.id) {
    const link = viaUvalo ? await uvaloAppUrl() : await appUrl("insp", "/");
    const where = asset.address ?? "proprietatea din raport";
    const dueText = due ? ` până la ${due.split("-").reverse().join(".")}` : "";
    await sendEmail({
      to: inspector.email,
      subject: `Inspecție nouă de programat: ${where}`,
      text: `${user.name || "Evaluatorul"} ți-a alocat inspecția pentru ${where}${asset.number ? ` (raport ${asset.number})` : ""}${dueText}. Fișă: ${sheetName}.${name ? ` Contact: ${name} ${phone ?? ""}.` : ""}${instructions ? `\nInstrucțiuni: ${instructions}` : ""}${missing.length ? `\nÎncă nu sunt încărcate ${missingText(missing)}.` : `\nActele pentru inspecție sunt în aplicația${viaUvalo ? " UVALO" : ""}, la inspecție.`}\nProgramează inspecția din aplicația${viaUvalo ? " UVALO" : ""}: ${link}`,
      html: layout({
        eyebrow: "Inspecții VALUEFY",
        title: "Ai o inspecție nouă de programat",
        body: `<p style="margin:0 0 10px;font-size:15px;line-height:1.65;color:#4A4A4A"><strong style="color:#111111">${esc(user.name || "Evaluatorul")}</strong> ți-a alocat inspecția pentru <strong style="color:#111111">${esc(where)}</strong>${asset.number ? ` (raport ${esc(asset.number)})` : ""}${esc(dueText)}.</p>
<p style="margin:0 0 10px;font-size:15px;line-height:1.65;color:#4A4A4A">Fișă: ${esc(sheetName)}${name ? ` · Contact: ${esc(name)} ${esc(phone ?? "")}` : ""}</p>
${instructions ? `<p style="margin:0 0 10px;font-size:15px;line-height:1.65;color:#4A4A4A;white-space:pre-wrap">${esc(instructions)}</p>` : ""}
${missing.length ? `<p style="margin:0;font-size:15px;line-height:1.65;color:#9A3412">Încă nu sunt încărcate ${esc(missingText(missing))}; le găsești în aplicație când apar.</p>` : `<p style="margin:0;font-size:15px;line-height:1.65;color:#4A4A4A">Actele pentru inspecție sunt în aplicație, la inspecție.</p>`}`,
        button: { label: viaUvalo ? "Deschide aplicația UVALO →" : "Programează din aplicație →", url: link },
        foot: viaUvalo ? "Inspecția apare în aplicația UVALO, la inspecțiile tale de programat." : "Inspecția apare în aplicația de inspecții la „De programat”.",
      }),
    });
  }
  return { ok: true as const, id, missing, uvalo: uvalo && !uvalo.ok ? uvalo.error : null };
}

/**
 * Marks an asset as valued without an inspection (`reason`), or as needing one again (`reason` empty).
 * Not while an inspection task is open for it: that one is cancelled first.
 */
export async function markNoInspection(db: D1Database, user: User, reportId: string, assetId: string, reason: string | null) {
  const a = await db.prepare("SELECT a.id, p.type FROM assets a JOIN crm_properties p ON p.id = a.property_id WHERE a.id = ? AND a.report_id = ?")
    .bind(assetId, reportId).first<{ id: string; type: string | null }>();
  if (!a) return { ok: false as const, error: "Bunul nu aparține acestui raport." };
  if (reason && (await openTask(db, a.id))) return { ok: false as const, error: "Bunul are o inspecție alocată. Anuleaz-o întâi." };
  const t = now();
  await db.batch([
    db.prepare("UPDATE assets SET no_inspection = ?, no_inspection_at = ?, no_inspection_by = ? WHERE id = ?").bind(reason, reason ? t : null, reason ? user.id : null, a.id),
    db.prepare("UPDATE reports SET updated_at = ? WHERE id = ?").bind(t, reportId),
  ]);
  await audit(db, `user:${user.id}`, reason ? "report.no_inspection" : "report.needs_inspection", "report", reportId, `${a.type ? a.type.toLowerCase() : "bun"}${reason ? `: ${reason}` : ""}`);
  return { ok: true as const };
}

/**
 * "Inspecție realizată": an inspection done without the app (date, optional hour). The open task is closed, or a done
 * one is recorded; when no inspection is left to do, the report moves on to drafting.
 */
export async function markInspectionDone(db: D1Database, user: User, reportId: string, assetId: string, doneAt: string) {
  const a = await db.prepare("SELECT a.id, p.type FROM assets a JOIN crm_properties p ON p.id = a.property_id WHERE a.id = ? AND a.report_id = ?")
    .bind(assetId, reportId).first<{ id: string; type: string | null }>();
  if (!a) return { ok: false as const, error: "Bunul nu aparține acestui raport." };
  const m = doneAt.match(/^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}))?$/);
  if (!m) return { ok: false as const, error: "Alege data inspecției." };
  if (m[1] > now().slice(0, 10)) return { ok: false as const, error: "Data inspecției nu poate fi în viitor." };
  // Bucharest time to UTC, roughly (the hour is a convenience; the date is what counts).
  const at = new Date(`${m[1]}T${m[2] ?? "12:00"}:00+03:00`).toISOString();
  const t = now();
  const open = await openTask(db, a.id);
  if (open) {
    await db.prepare("UPDATE inspections SET status = 'done', done_at = ?, updated_at = ? WHERE id = ?").bind(at, t, open.id).run();
    await later(cancelInUvalo(db, open.id, "inspecția a fost făcută fără aplicație (marcată realizată în CRM)"));
  } else {
    const order = await db.prepare("SELECT order_id FROM reports WHERE id = ?").bind(reportId).first<{ order_id: string | null }>();
    await db.prepare(`INSERT INTO inspections (id, asset_id, report_id, order_id, inspector_id, status, done_at, assigned_by, assigned_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'done', ?, ?, ?, ?)`).bind(uuid(), a.id, reportId, order?.order_id ?? null, user.id, at, user.id, t, t).run();
  }
  await db.prepare("UPDATE assets SET no_inspection = NULL, no_inspection_at = NULL, no_inspection_by = NULL WHERE id = ?").bind(a.id).run();
  await audit(db, `user:${user.id}`, "report.inspection_done", "report", reportId, `${a.type ? a.type.toLowerCase() : "bun"} · inspecție realizată ${m[1].split("-").reverse().join(".")} (marcată în CRM)`);
  return { ok: true as const, advanced: await advanceIfInspected(db, `user:${user.id}`, reportId) };
}

/**
 * Deletes an inspection from everywhere, as if it had not been made: the task, its sheet (answers, signature), its photos (also
 * from storage), the property features taken from it, its scheduling history — and the inspection in UVALO, when it was sent
 * there (if UVALO refuses, nothing is deleted). A report already in drafting goes back to the inspection stage.
 */
export async function deleteInspection(db: D1Database, user: User, reportId: string, inspectionId: string, reason: string) {
  const i = await db.prepare(`SELECT i.id, i.status, i.asset_id, p.type, COALESCE(NULLIF(u.name, ''), u.email) AS inspector FROM inspections i
      JOIN assets a ON a.id = i.asset_id JOIN crm_properties p ON p.id = a.property_id LEFT JOIN users u ON u.id = i.inspector_id WHERE i.id = ? AND i.report_id = ?`)
    .bind(inspectionId, reportId).first<{ id: string; status: string; asset_id: string; type: string | null; inspector: string | null }>();
  if (!i) return { ok: false as const, error: "Inspecția nu există." };
  const why = reason.trim().slice(0, 300);
  const u = await deleteInUvalo(db, i.id, why || `ștearsă din CRM de ${user.name || user.email}`);
  if (!u.ok) return { ok: false as const, error: `Nu s-a putut șterge din UVALO (${u.error}). Inspecția nu a fost ștearsă; încearcă din nou.` };
  const [photos, sheets] = await Promise.all([
    db.prepare("SELECT r2_key FROM inspection_photos WHERE inspection_id = ?").bind(i.id).all<{ r2_key: string }>(),
    db.prepare("SELECT id, signature_url FROM inspection_sheets WHERE inspection_id = ?").bind(i.id).all<{ id: string; signature_url: string | null }>(),
  ]);
  const sheetIds = sheets.results.map((s) => s.id);
  await db.batch([
    db.prepare("DELETE FROM property_features WHERE inspection_id = ?").bind(i.id),
    ...(sheetIds.length ? [db.prepare(`DELETE FROM property_features WHERE sheet_id IN (${sheetIds.map(() => "?").join(", ")})`).bind(...sheetIds)] : []),
    db.prepare("DELETE FROM inspection_photos WHERE inspection_id = ?").bind(i.id),
    db.prepare("DELETE FROM inspection_sheets WHERE inspection_id = ?").bind(i.id),
    db.prepare("DELETE FROM inspection_schedule_log WHERE inspection_id = ?").bind(i.id),
    db.prepare("DELETE FROM inspections WHERE id = ?").bind(i.id),
    db.prepare("UPDATE reports SET updated_at = ? WHERE id = ?").bind(now(), reportId),
  ]);
  // the files: photos and the signature (only the CRM's own storage; Glide links are left alone)
  const keys = [...photos.results.map((p) => p.r2_key), ...sheets.results.map((s) => s.signature_url).filter((x): x is string => !!x?.startsWith("r2:")).map((x) => x.slice(3))];
  if (keys.length) {
    const { bucket } = await import("./orders");
    const r2 = await bucket();
    if (r2) await r2.delete(keys).catch(() => {});
  }
  await audit(db, `user:${user.id}`, "report.inspection_delete", "report", reportId,
    `${i.type ? i.type.toLowerCase() : "bun"}${i.inspector ? ` · ${i.inspector}` : ""}${i.status === "done" ? " · cu fișa și fotografiile" : ""}${why ? ` · ${why}` : ""}`);
  // nothing done any more for an asset that needs an inspection: the report is back at the inspection stage
  const left = await db.prepare(`SELECT COUNT(*) AS n FROM assets x WHERE x.report_id = ? AND x.no_inspection IS NULL
      AND NOT EXISTS (SELECT 1 FROM inspections j WHERE j.asset_id = x.id AND j.status = 'done')`).bind(reportId).first<{ n: number }>();
  if (left?.n) {
    const r = await db.prepare("UPDATE reports SET stage = 'inspection', updated_at = ? WHERE id = ? AND stage = 'drafting'").bind(now(), reportId).run();
    if (r.meta.changes) await audit(db, `user:${user.id}`, "report.stage", "report", reportId, "Inspecție");
  }
  return { ok: true as const };
}

/** Nothing left to inspect on the report (every asset inspected or without an inspection): on to drafting. */
export async function advanceIfInspected(db: D1Database, actor: string, reportId: string) {
  const left = await db.prepare(`SELECT COUNT(*) AS n FROM assets x WHERE x.report_id = ? AND x.no_inspection IS NULL
      AND NOT EXISTS (SELECT 1 FROM inspections i WHERE i.asset_id = x.id AND i.status = 'done')`).bind(reportId).first<{ n: number }>();
  if (left?.n) return false;
  const r = await db.prepare("UPDATE reports SET stage = 'drafting', updated_at = ? WHERE id = ? AND COALESCE(stage, 'inspection') = 'inspection'").bind(now(), reportId).run();
  if (r.meta.changes) await audit(db, actor, "report.stage", "report", reportId, "Redactare");
  return !!r.meta.changes;
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
  await later(cancelInUvalo(db, i.id, `anulată din CRM de ${user.name || user.email}`));
  return { ok: true as const };
}
