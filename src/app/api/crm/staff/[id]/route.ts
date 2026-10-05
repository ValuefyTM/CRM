import { NextResponse } from "next/server";
import { audit, endAllSessions } from "@/lib/auth";
import { err, json, staffApi } from "@/lib/api";

/** Change role or disable / enable a team member. Owners can't be changed here; you can't change yourself. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await staffApi("admin");
  if ("res" in a) return a.res;
  const { id } = await params;
  if (id === a.user.id) return err("Nu îți poți modifica propriul cont.");
  const t = await a.db.prepare("SELECT role FROM staff_users WHERE id = ?").bind(id).first<{ role: string }>();
  if (!t) return err("Persoana nu există.", 404);
  if (t.role === "owner") return err("Contul de proprietar nu poate fi modificat.", 403);
  const b = await json(req);
  if (b.action === "role") {
    const role = b.role === "admin" ? "admin" : "staff";
    await a.db.prepare("UPDATE staff_users SET role = ? WHERE id = ?").bind(role, id).run();
    await audit(a.db, `staff:${a.user.id}`, "staff.role", "staff_user", id, role);
  } else if (b.action === "disable" || b.action === "enable") {
    const status = b.action === "disable" ? "disabled" : "active";
    await a.db.prepare("UPDATE staff_users SET status = ? WHERE id = ?").bind(status, id).run();
    if (status === "disabled") await endAllSessions(a.db, "staff", id);
    await audit(a.db, `staff:${a.user.id}`, `staff.${b.action}`, "staff_user", id);
  } else return err("Acțiune necunoscută.");
  return NextResponse.json({ ok: true });
}
