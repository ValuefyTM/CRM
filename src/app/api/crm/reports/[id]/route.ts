import { audit } from "@/lib/auth";
import { now } from "@/lib/db";
import { err, json, reportApi } from "@/lib/api";
import { REPORT_STATUS } from "@/lib/reports";
import { deliverReport } from "@/lib/delivery";
import { STAGE_LABEL } from "@/lib/dossier";
import { esc, layout, sendEmail } from "@/lib/email";
import { appUrl } from "@/lib/site";
import { addMessage } from "@/lib/messages";
import { isFinished } from "@/lib/perms-db";
import type { TeamRight } from "@/lib/perms";
import { pushLater } from "@/lib/push";
import { checkFirmNumber, isOwnIssuer } from "@/lib/report-numbers";

/** Report changes from its page: `{ status, suspend_reason? }`, `{ stage }`, `{ notes }` or `{ delivered: true, number, report_date, notify }`. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await reportApi(id, "view", true);
  if ("res" in a) return a.res;
  const r = await a.db.prepare("SELECT id, status, delivered_at FROM reports WHERE id = ?").bind(id).first<{ id: string; status: string; delivered_at: string | null }>();
  if (!r) return err("Raportul nu există.", 404);
  const b = await json(req);
  const actor = `user:${a.user.id}`;
  // What each change needs (Setări → Permisiuni, echipa raportului).
  const need: [boolean, TeamRight, string][] = [
    [typeof b.status === "string", "status", "Statusul îl schimbă evaluatorul principal."],
    [typeof b.collected === "boolean", "status", "Încasarea o marchează evaluatorul principal."],
    [typeof b.notes === "string", "edit", "Nu poți edita acest raport."],
    ["stage" in b && b.stage !== "verified" && b.stage !== "back", "status", "Etapa o schimbă evaluatorul principal."],
    [b.stage === "verified" || b.stage === "back", "verify", "Verificarea o finalizează verificatorul."],
    [b.delivered === true, "deliver", "Raportul îl predă evaluatorul principal."],
    [typeof b.number === "string" && b.delivered !== true, "edit", "Nu poți modifica numărul acestui raport."],
  ];
  for (const [when, right, msg] of need) if (when && !a.access.can[right]) return err(msg, 403);

  // The number of a report issued on a collaborating firm (that firm's numbering; VALUEFY's series is automatic).
  // It may be corrected also once the report is finished.
  if (typeof b.number === "string" && b.delivered !== true) {
    const x = await a.db.prepare("SELECT r.number, r.issuer_id, i.name AS issuer FROM reports r LEFT JOIN entities i ON i.id = r.issuer_id WHERE r.id = ?").bind(id)
      .first<{ number: string | null; issuer_id: string | null; issuer: string | null }>();
    if (isOwnIssuer(x?.issuer)) return err("Rapoartele VALUEFY se numerotează automat: numărul nu se modifică.", 409);
    const number = b.number.trim().slice(0, 30);
    if (!number) return err("Scrie numărul raportului.");
    const dup = await checkFirmNumber(a.db, id, x!.issuer_id, number);
    if (dup) return err(dup);
    await a.db.prepare("UPDATE reports SET number = ?, updated_at = ? WHERE id = ?").bind(number, now(), id).run();
    await audit(a.db, actor, "report.number", "report", id, `${x!.number ?? "fără număr"} → ${number}`);
    return Response.json({ ok: true });
  }

  const closed = isFinished(r);
  if (closed && typeof b.status !== "string" && typeof b.collected !== "boolean") return err("Raportul este finalizat și nu se mai modifică. Redeschide-l din „Schimbă status”.", 409);
  if (typeof b.status === "string") {
    if (!REPORT_STATUS[b.status]) return err("Status necunoscut.");
    // Reopening a finished report: back to "În lucru" with the reason; it is delivered again when it is ready.
    if (closed) {
      if (b.status !== "in_progress") return err("Un raport finalizat poate fi doar redeschis (În lucru).");
      const why = String(b.reason ?? "").trim().slice(0, 500);
      if (!why) return err("Scrie motivul redeschiderii.");
      await a.db.prepare("UPDATE reports SET status = 'in_progress', suspend_reason = NULL, delivered_at = NULL, stage = 'drafting', updated_at = ? WHERE id = ?").bind(now(), id).run();
      await audit(a.db, actor, "report.status", "report", id, `${REPORT_STATUS[r.status]?.[0] ?? r.status} → ${REPORT_STATUS.in_progress[0]} (redeschis: ${why})`);
      await addMessage(a.db, "report", id, a.user, `Raport redeschis: ${why}`);
      return Response.json({ ok: true });
    }
    // Suspending or cancelling needs the reason: kept on the report (suspend_reason) and posted in the team's messages.
    const raw = typeof b.reason === "string" ? b.reason : typeof b.suspend_reason === "string" ? b.suspend_reason : "";
    const reason = raw.trim().slice(0, 500);
    const why = b.status === "suspended" || b.status === "cancelled";
    if (why && !reason) return err(b.status === "suspended" ? "Scrie motivul suspendării." : "Scrie motivul anulării.");
    await a.db.prepare("UPDATE reports SET status = ?, suspend_reason = ?, updated_at = ? WHERE id = ?")
      .bind(b.status, why ? reason : null, now(), id).run();
    await audit(a.db, actor, "report.status", "report", id, `${REPORT_STATUS[r.status]?.[0] ?? r.status} → ${REPORT_STATUS[b.status][0]}${why ? ` (${reason})` : ""}`);
    if (why) await addMessage(a.db, "report", id, a.user, `${b.status === "suspended" ? (r.status === "suspended" ? "Motivul suspendării" : "Raport suspendat") : (r.status === "cancelled" ? "Motivul anulării" : "Raport anulat")}: ${reason}`);
    return Response.json({ ok: true });
  }
  // Payment collected (marked by hand, for reports not paid through an invoice of the CRM).
  if (typeof b.collected === "boolean") {
    await a.db.prepare("UPDATE reports SET collected = ?, collected_at = ?, updated_at = ? WHERE id = ?").bind(b.collected ? 1 : 0, b.collected ? now() : null, now(), id).run();
    await audit(a.db, actor, "report.collected", "report", id, b.collected ? "Marcat încasat" : "Marcat neîncasat");
    return Response.json({ ok: true });
  }
  if (typeof b.notes === "string") {
    await a.db.prepare("UPDATE reports SET notes = ?, updated_at = ? WHERE id = ?").bind(b.notes.trim().slice(0, 8000) || null, now(), id).run();
    await audit(a.db, actor, "report.notes", "report", id);
    return Response.json({ ok: true });
  }
  // The verifier: "verified" finishes the review, "back" returns the report to the main evaluator with a comment.
  if (b.stage === "verified" || b.stage === "back") {
    const comment = typeof b.comment === "string" ? b.comment.trim().slice(0, 4000) : "";
    if (b.stage === "back" && !comment) return err("Scrie ce trebuie corectat.");
    const back = b.stage === "back";
    await a.db.prepare(`UPDATE reports SET stage = ?, verified_at = ?, verified_by = ?, updated_at = ? WHERE id = ?`)
      .bind(back ? "drafting" : "review", back ? null : now(), back ? null : a.user.id, now(), id).run();
    await audit(a.db, actor, back ? "report.review_back" : "report.verified", "report", id, comment || undefined);
    pushLater(a.db);
    if (comment) await addMessage(a.db, "report", id, a.user, `${back ? "Întors la evaluator" : "Verificare finalizată"}: ${comment}`);
    const lead = await a.db.prepare(`SELECT u.email, COALESCE(r.label, r.number, 'raport') AS what FROM report_members m JOIN users u ON u.id = m.user_id
        JOIN reports r ON r.id = m.report_id WHERE m.report_id = ? AND m.role = 'evaluator' AND u.id <> ? LIMIT 1`).bind(id, a.user.id).first<{ email: string; what: string }>();
    if (lead) {
      const link = await appUrl("crm", `/rapoarte/${id}`);
      const who = a.user.name || "Verificatorul";
      await sendEmail({
        to: lead.email, subject: back ? `Raport întors de la verificare: ${lead.what}` : `Verificare finalizată: ${lead.what}`,
        text: `${who} ${back ? `ți-a întors raportul ${lead.what}: ${comment}` : `a finalizat verificarea raportului ${lead.what}. Îl poți preda.`} ${link}`,
        html: layout({
          eyebrow: "CRM VALUEFY", title: back ? "Raportul s-a întors de la verificare" : "Verificarea e gata",
          body: `<p style="margin:0;font-size:15px;line-height:1.65;color:#4A4A4A"><strong style="color:#111111">${esc(who)}</strong> ${back ? "ți-a întors raportul" : "a finalizat verificarea raportului"} <strong style="color:#111111">${esc(lead.what)}</strong>.</p>${comment ? `<p style="margin:12px 0 0;font-size:15px;line-height:1.65;color:#4A4A4A">${esc(comment)}</p>` : ""}`,
          button: { label: "Deschide raportul →", url: link }, foot: "Primești acest email pentru că ești evaluatorul principal al raportului.",
        }),
      });
    }
    return Response.json({ ok: true });
  }
  // Working stage: "drafting" (also without an inspection), "review" (sent to the verifier) or back to waiting for the inspection.
  if ("stage" in b) {
    const stage = b.stage === "drafting" || b.stage === "review" ? b.stage : null;
    // Sent (again) to the verifier: a new review.
    await a.db.prepare("UPDATE reports SET stage = ?, verified_at = NULL, verified_by = NULL, updated_at = ? WHERE id = ?").bind(stage, now(), id).run();
    await audit(a.db, actor, "report.stage", "report", id, stage ? STAGE_LABEL[stage] : "Inspecție");
    pushLater(a.db);
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
            body: `<p style="margin:0;font-size:15px;line-height:1.65;color:#4A4A4A"><strong style="color:#111111">${esc(a.user.name || "Evaluatorul")}</strong> ți-a trimis la verificare raportul <strong style="color:#111111">${esc(v.what)}</strong>.</p>`,
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
