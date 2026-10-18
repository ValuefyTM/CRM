import { err, json, reportApi } from "@/lib/api";
import { later, pushInspection } from "@/lib/uvalo";
import { assignInspection, canAssign, cancelInspection, deleteInspection, mailAssigned, markInspectionDone, markNoInspection } from "@/lib/insp-assign";

/**
 * Gives the inspection of an asset to an inspector: `{ asset, inspector, sheet_type, due_on, contact_kind, contact_name, contact_phone, instructions,
 * confirm_missing }`. Without the CF extract or the floor survey it answers 409 `{ missing }` until `confirm_missing` is true.
 * `{ asset, none: "<reason>" }` marks the asset as valued without an inspection; `{ asset, none: null }` undoes it.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await reportApi(id, "view", true);
  if ("res" in a) return a.res;
  if (!(await canAssign(a.db, a.user, id))) return err("Doar evaluatorul principal al raportului poate aloca inspecția.", 403);
  const b = await json(req);
  // inspections given together with `notify: false`: one email for all of them
  if (Array.isArray(b.notify)) {
    const ids = (b.notify as unknown[]).filter((x): x is string => typeof x === "string").slice(0, 50);
    const mine = ids.length ? (await a.db.prepare(`SELECT id FROM inspections WHERE report_id = ? AND id IN (${ids.map(() => "?").join(", ")})`).bind(id, ...ids).all<{ id: string }>()).results.map((x) => x.id) : [];
    await mailAssigned(a.db, a.user, mine);
    return Response.json({ ok: true });
  }
  if (typeof b.done_at === "string") {
    const m = await markInspectionDone(a.db, a.user, id, typeof b.asset === "string" ? b.asset : "", b.done_at);
    return m.ok ? Response.json({ ok: true, advanced: m.advanced }) : err(m.error);
  }
  if ("none" in b) {
    const reason = typeof b.none === "string" ? b.none.trim().slice(0, 200) || null : null;
    const m = await markNoInspection(a.db, a.user, id, typeof b.asset === "string" ? b.asset : "", reason);
    return m.ok ? Response.json({ ok: true }) : err(m.error);
  }
  const r = await assignInspection(a.db, a.user, id, b);
  if (!r.ok) return r.missing ? Response.json({ error: r.error, missing: r.missing }, { status: 409 }) : err(r.error);
  return Response.json({ ok: true, id: r.id, missing: r.missing });
}

/** The documents the inspector may open, for all the open inspections of the report: `{ doc_refs: [ids] }`. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await reportApi(id, "view", true);
  if ("res" in a) return a.res;
  if (!(await canAssign(a.db, a.user, id))) return err("Doar evaluatorul principal al raportului poate alege actele inspectorului.", 403);
  const b = await json(req);
  const ids = Array.isArray(b.doc_refs) ? (b.doc_refs as unknown[]).filter((x): x is string => typeof x === "string").slice(0, 100) : [];
  const ok = ids.length ? (await a.db.prepare(`SELECT id FROM report_documents WHERE report_id = ? AND id IN (${ids.map(() => "?").join(", ")})`).bind(id, ...ids).all<{ id: string }>()).results.map((x) => x.id) : [];
  await a.db.prepare("UPDATE inspections SET doc_refs = ? WHERE report_id = ? AND status IN ('to_schedule', 'scheduled')").bind(JSON.stringify(ok), id).run();
  // sent to UVALO already (e.g. a new work: the inspection is given before its documents are uploaded): the documents follow
  const sent = (await a.db.prepare("SELECT id FROM inspections WHERE report_id = ? AND status IN ('to_schedule', 'scheduled') AND uvalo_id IS NOT NULL").bind(id).all<{ id: string }>()).results;
  for (const x of sent) await later(pushInspection(a.db, x.id));
  return Response.json({ ok: true });
}

/** Cancels an inspection task that is not done yet: `?inspection=<id>`; with `&purge=1&reason=` deletes it from everywhere (sheet, photos, UVALO). */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await reportApi(id, "view", true);
  if ("res" in a) return a.res;
  if (!(await canAssign(a.db, a.user, id))) return err("Doar evaluatorul principal al raportului poate anula inspecția.", 403);
  const u = new URL(req.url), ins = u.searchParams.get("inspection") ?? "";
  const r = u.searchParams.get("purge") === "1" ? await deleteInspection(a.db, a.user, id, ins, u.searchParams.get("reason") ?? "") : await cancelInspection(a.db, a.user, id, ins);
  if (!r.ok) return err(r.error);
  return Response.json({ ok: true });
}
