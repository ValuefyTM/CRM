import { audit } from "@/lib/auth";
import { now } from "@/lib/db";
import { err, json, staffApi } from "@/lib/api";
import { ROLE_LABEL } from "@/lib/reports";

/** Adds a team member to the report: `{ user, role }`. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await staffApi();
  if ("res" in a) return a.res;
  const { id } = await params;
  const b = await json(req);
  const role = typeof b.role === "string" && ROLE_LABEL[b.role] ? b.role : null;
  if (!role) return err("Alege rolul.");
  const u = await a.db.prepare("SELECT id, COALESCE(NULLIF(name, ''), email) AS name FROM users WHERE id = ? AND kind = 'internal'").bind(String(b.user ?? "")).first<{ id: string; name: string }>();
  if (!u) return err("Alege persoana.");
  if (!(await a.db.prepare("SELECT id FROM reports WHERE id = ?").bind(id).first())) return err("Raportul nu există.", 404);
  await a.db.prepare("INSERT OR IGNORE INTO report_members (report_id, user_id, role) VALUES (?, ?, ?)").bind(id, u.id, role).run();
  await a.db.prepare("UPDATE reports SET updated_at = ? WHERE id = ?").bind(now(), id).run();
  await audit(a.db, `user:${a.user.id}`, "report.member", "report", id, `${u.name} (${ROLE_LABEL[role].toLowerCase()})`);
  return Response.json({ ok: true });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await staffApi();
  if ("res" in a) return a.res;
  const { id } = await params;
  const q = new URL(req.url).searchParams;
  const user = q.get("user") ?? "", role = q.get("role") ?? "";
  const u = await a.db.prepare("SELECT COALESCE(NULLIF(name, ''), email) AS name FROM users WHERE id = ?").bind(user).first<{ name: string }>();
  await a.db.prepare("DELETE FROM report_members WHERE report_id = ? AND user_id = ? AND role = ?").bind(id, user, role).run();
  await audit(a.db, `user:${a.user.id}`, "report.member_remove", "report", id, `${u?.name ?? ""} (${(ROLE_LABEL[role] ?? role).toLowerCase()})`);
  return Response.json({ ok: true });
}
