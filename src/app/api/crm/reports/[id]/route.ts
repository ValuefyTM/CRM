import { audit } from "@/lib/auth";
import { now } from "@/lib/db";
import { err, json, staffApi } from "@/lib/api";
import { REPORT_STATUS } from "@/lib/reports";
import { deliverReport } from "@/lib/delivery";
import { STAGE_LABEL } from "@/lib/dossier";
import { esc, layout, sendEmail } from "@/lib/email";
import { appUrl } from "@/lib/site";

/** Report changes from its page: `{ status, suspend_reason? }`, `{ stage }`, `{ notes }` or `{ delivered: true, number, report_date, notify }`. */
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
  // Working stage: "drafting" (also without an inspection), "review" (sent to the verifier) or back to waiting for the inspection.
  if ("stage" in b) {
    const stage = b.stage === "drafting" || b.stage === "review" ? b.stage : null;
    await a.db.prepare("UPDATE reports SET stage = ?, updated_at = ? WHERE id = ?").bind(stage, now(), id).run();
    await audit(a.db, actor, "report.stage", "report", id, stage ? STAGE_LABEL[stage] : "Inspecție");
    if (stage === "review") {
      const v = await a.db.prepare(`SELECT u.email, COALESCE(NULLIF(u.name, ''), u.email) AS name, COALESCE(r.label, r.number, 'raport') AS what FROM report_members m
          JOIN users u ON u.id = m.user_id JOIN reports r ON r.id = m.report_id WHERE m.report_id = ? AND m.role = 'verifier' AND u.id <> ? LIMIT 1`)
        .bind(id, a.user.id).first<{ email: string; name: string; what: string }>();
      if (v) {
        const link = await appUrl("crm", `/rapoarte/${id}`);
        await sendEmail({
          to: v.email, subject: `Raport de verificat: ${v.what}`,
          text: `${a.user.name || "Evaluatorul"} ți-a trimis la verificare raportul ${v.what}: ${link}`,
          html: layout({
            eyebrow: "CRM VALUEFY", title: "Ai un raport de verificat",
            body: `<p style="margin:0;font-size:15px;line-height:1.65;color:#4A4A66"><strong style="color:#17173A">${esc(a.user.name || "Evaluatorul")}</strong> ți-a trimis la verificare raportul <strong style="color:#17173A">${esc(v.what)}</strong>.</p>`,
            button: { label: "Deschide raportul →", url: link }, foot: "Primești acest email pentru că ești verificatorul raportului.",
          }),
        });
      }
    }
    return Response.json({ ok: true });
  }
  if (b.delivered === true) {
    const res = await deliverReport(a.db, a.user, id, b);
    if (!res.ok) return err(res.error);
    return Response.json({ ok: true, notified: res.notified });
  }
  return err("Nimic de salvat.");
}
