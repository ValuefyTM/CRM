import { NextResponse } from "next/server";
import { audit, endAllSessions, sendInvite } from "@/lib/auth";
import { getPartner } from "@/lib/partners";
import { getUser, isAdmin, updateUser, validateUser } from "@/lib/users";
import { err, json, staffApi } from "@/lib/api";

/** Edit an account, (re)send the invitation, disable or re-enable it. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await staffApi();
  if ("res" in a) return a.res;
  const { id } = await params;
  const u = await getUser(a.db, id);
  if (!u) return err("Utilizatorul nu există.", 404);
  const self = u.id === a.user.id;
  // Team accounts are managed by administrators (anyone may edit their own details); owners only by owners.
  if (u.kind === "internal" && !self && (!isAdmin(a.user) || (u.role === "owner" && a.user.role !== "owner")))
    return err("Nu ai drepturi pentru acest cont.", 403);
  const b = await json(req);
  const actor = `user:${a.user.id}`;

  if (b.action === "update") {
    const v = validateUser(u.kind, b, u.role, a.user.role === "owner");
    if (!v.ok) return err(v.error);
    // Nobody changes their own role; administrators may still tick their own duties (e.g. an owner who also inspects).
    if (self) Object.assign(v.value, { role: u.role, engagement: u.engagement, ...(isAdmin(a.user) ? {} : { duties: u.duties }) });
    if (u.kind === "partner" && !(await getPartner(a.db, v.value.partner_id!))) return err("Firma aleasă nu există.");
    const r = await updateUser(a.db, u, v.value);
    if (!r.ok) return err(r.error, 409);
    const changed = [v.value.role !== u.role && `rol: ${v.value.role}`, (v.value.duties ?? "") !== (u.duties ?? "") && `atribuții: ${v.value.duties ?? "—"}`].filter(Boolean).join(" · ");
    await audit(a.db, actor, "user.update", "user", id, changed || undefined);
    return NextResponse.json({ ok: true });
  }
  if (b.action === "invite") {
    if (u.status === "disabled") return err("Contul este dezactivat. Reactivează-l întâi.");
    if (u.status === "active" && u.kind !== "internal") return err("Contul este deja activ.");
    return NextResponse.json({ ok: true, sent: await sendInvite(a.db, id, actor) });
  }
  if (b.action === "disable") {
    if (self) return err("Nu îți poți dezactiva propriul cont.");
    if (u.role === "owner" && u.kind === "internal") return err("Contul de proprietar nu poate fi dezactivat.", 403);
    await a.db.prepare("UPDATE users SET status = 'disabled', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?").bind(id).run();
    await endAllSessions(a.db, id);
    await audit(a.db, actor, "user.disable", "user", id);
    return NextResponse.json({ ok: true, status: "disabled" });
  }
  if (b.action === "enable") {
    const status = u.activated_at ? "active" : "invited";
    await a.db.prepare("UPDATE users SET status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?").bind(status, id).run();
    await audit(a.db, actor, "user.enable", "user", id);
    return NextResponse.json({ ok: true, status });
  }
  return err("Acțiune necunoscută.");
}
