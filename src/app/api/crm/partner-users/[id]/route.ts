import { NextResponse } from "next/server";
import { audit, endAllSessions, sendInvite } from "@/lib/auth";
import { err, json, staffApi } from "@/lib/api";

/** Resend the invitation, change role, disable / re-enable a portal user. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await staffApi();
  if ("res" in a) return a.res;
  const { id } = await params;
  const u = await a.db.prepare("SELECT id, status FROM partner_users WHERE id = ?").bind(id).first<{ id: string; status: string }>();
  if (!u) return err("Persoana nu există.", 404);
  const b = await json(req);
  const actor = `staff:${a.user.id}`;

  if (b.action === "invite") {
    if (u.status === "active") return err("Contul este deja activ.");
    if (u.status === "disabled") await a.db.prepare("UPDATE partner_users SET status = 'invited' WHERE id = ?").bind(id).run();
    const sent = await sendInvite(a.db, id, actor);
    return NextResponse.json({ ok: true, sent });
  }
  if (b.action === "disable") {
    await a.db.prepare("UPDATE partner_users SET status = 'disabled' WHERE id = ?").bind(id).run();
    await endAllSessions(a.db, "partner", id);
    await audit(a.db, actor, "partner_user.disable", "partner_user", id);
    return NextResponse.json({ ok: true });
  }
  if (b.action === "enable") {
    const next = (await a.db.prepare("SELECT activated_at FROM partner_users WHERE id = ?").bind(id).first<{ activated_at: string | null }>())?.activated_at ? "active" : "invited";
    await a.db.prepare("UPDATE partner_users SET status = ? WHERE id = ?").bind(next, id).run();
    await audit(a.db, actor, "partner_user.enable", "partner_user", id);
    return NextResponse.json({ ok: true, status: next });
  }
  if (b.action === "role") {
    const role = b.role === "owner" ? "owner" : "member";
    await a.db.prepare("UPDATE partner_users SET role = ? WHERE id = ?").bind(role, id).run();
    await audit(a.db, actor, "partner_user.role", "partner_user", id, role);
    return NextResponse.json({ ok: true });
  }
  return err("Acțiune necunoscută.");
}
