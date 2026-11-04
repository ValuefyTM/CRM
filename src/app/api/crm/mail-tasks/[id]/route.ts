import { audit } from "@/lib/auth";
import { err, json, staffApi } from "@/lib/api";
import { can } from "@/lib/perms";
import { taskFor } from "@/lib/mail-rules";

/** A task from an email closed by hand: done (a plain task) or dismissed (a bank request without an order), with a note. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await staffApi("any", true);
  if ("res" in a) return a.res;
  const { id } = await params;
  const t = await a.db.prepare("SELECT id, title, status, notify_roles, notify_users FROM mail_tasks WHERE id = ?").bind(id).first<{ id: string; title: string; status: string; notify_roles: string | null; notify_users: string | null }>();
  if (!t) return err("Task-ul nu există.", 404);
  if (!can(a.user, "orders") && !taskFor(t, a.user)) return err("Nu ai acces la acest task.", 403);
  if (t.status !== "open") return err("Task-ul e deja închis.");
  const b = await json(req);
  const note = typeof b.note === "string" ? b.note.trim().slice(0, 500) : "";
  const status = b.action === "done" ? "done" : "dismissed";
  if (status === "dismissed" && !note) return err("Scrie motivul.");
  await a.db.prepare("UPDATE mail_tasks SET status = ?, done_at = ?, done_by = ?, done_note = ? WHERE id = ? AND status = 'open'").bind(status, new Date().toISOString(), a.user.id, note || null, id).run();
  await audit(a.db, `user:${a.user.id}`, `mailtask.${status}`, "mail_task", id, `${t.title}${note ? ` · ${note}` : ""}`);
  return Response.json({ ok: true });
}
