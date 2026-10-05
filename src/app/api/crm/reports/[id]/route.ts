import { audit } from "@/lib/auth";
import { now } from "@/lib/db";
import { err, json, staffApi } from "@/lib/api";
import { REPORT_STATUS } from "@/lib/reports";

/** Report changes from its page: `{ status, suspend_reason? }`, `{ notes }` or `{ delivered: true }`. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await staffApi();
  if ("res" in a) return a.res;
  const { id } = await params;
  const r = await a.db.prepare("SELECT id, status FROM reports WHERE id = ?").bind(id).first<{ id: string; status: string }>();
  if (!r) return err("Raportul nu există.", 404);
  const b = await json(req);
  const actor = `user:${a.user.id}`;

  if (typeof b.status === "string") {
    if (!REPORT_STATUS[b.status]) return err("Status necunoscut.");
    const reason = typeof b.suspend_reason === "string" ? b.suspend_reason.trim().slice(0, 500) : "";
    if (b.status === "suspended" && !reason) return err("Scrie motivul suspendării.");
    await a.db.prepare("UPDATE reports SET status = ?, suspend_reason = ?, updated_at = ? WHERE id = ?")
      .bind(b.status, b.status === "suspended" ? reason : null, now(), id).run();
    await audit(a.db, actor, "report.status", "report", id, `${REPORT_STATUS[r.status]?.[0] ?? r.status} → ${REPORT_STATUS[b.status][0]}${reason && b.status === "suspended" ? ` (${reason})` : ""}`);
    return Response.json({ ok: true });
  }
  if (typeof b.notes === "string") {
    await a.db.prepare("UPDATE reports SET notes = ?, updated_at = ? WHERE id = ?").bind(b.notes.trim().slice(0, 8000) || null, now(), id).run();
    await audit(a.db, actor, "report.notes", "report", id);
    return Response.json({ ok: true });
  }
  if (b.delivered === true) {
    const final = await a.db.prepare("SELECT id FROM report_documents WHERE report_id = ? AND kind = 'final' AND status = 'uploaded' LIMIT 1").bind(id).first();
    if (!final) return err("Încarcă întâi fișierul final al raportului (PDF semnat).");
    await a.db.prepare("UPDATE reports SET delivered_at = ?, delivered_by = ?, status = 'done', updated_at = ? WHERE id = ?").bind(now(), a.user.id, now(), id).run();
    await audit(a.db, actor, "report.delivered", "report", id);
    return Response.json({ ok: true });
  }
  return err("Nimic de salvat.");
}
