import { audit } from "@/lib/auth";
import { err, json, staffApi } from "@/lib/api";
import { bucket } from "@/lib/orders";
import { runRules } from "@/lib/mail-rules";
import { pushLater } from "@/lib/push";

/** An attachment of an email received (team members who see Emailuri primite). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await staffApi("orders");
  if ("res" in a) return a.res;
  const { id } = await params;
  const file = new URL(req.url).searchParams.get("file") ?? "";
  const f = await a.db.prepare("SELECT filename, content_type, r2_key FROM mail_attachments WHERE id = ? AND email_id = ?").bind(file, id).first<{ filename: string; content_type: string | null; r2_key: string }>();
  const r2 = await bucket();
  const obj = f && r2 ? await r2.get(f.r2_key) : null;
  if (!f || !obj) return err("Fișierul nu există.", 404);
  return new Response(obj.body, { headers: { "Content-Type": f.content_type ?? "application/octet-stream", "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(f.filename)}`, "Cache-Control": "private, max-age=300" } });
}

/** The rules run again on an email (after a rule was added or changed), or the email ignored. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await staffApi("orders", true);
  if ("res" in a) return a.res;
  const { id } = await params;
  const e = await a.db.prepare("SELECT id, received_at, mail_from, mail_to, subject, body, status FROM bank_emails WHERE id = ?").bind(id)
    .first<{ id: string; received_at: string; mail_from: string | null; mail_to: string | null; subject: string | null; body: string | null; status: string }>();
  if (!e) return err("Emailul nu există.", 404);
  const b = await json(req);
  if (b.action === "ignore") {
    await a.db.prepare("UPDATE bank_emails SET status = 'ignored' WHERE id = ?").bind(id).run();
    await audit(a.db, `user:${a.user.id}`, "inbox.ignore", "email", id, e.subject ?? "");
    return Response.json({ ok: true, status: "ignored" });
  }
  if (b.action !== "rerun") return err("Acțiune necunoscută.");
  if (e.status === "task") return err("Emailul are deja un task. Închide-l întâi, dacă vrei să aplici altă regulă.");
  const r = await runRules(a.db, id, { from: e.mail_from, to: e.mail_to, subject: e.subject, text: e.body }, new Date().toISOString());
  if (r.status === "unmatched") await a.db.prepare("UPDATE bank_emails SET status = 'unmatched', rule_id = NULL WHERE id = ?").bind(id).run();
  if (r.status === "task") pushLater(a.db);
  return Response.json({ ok: true, status: r.status, task: r.taskId });
}
