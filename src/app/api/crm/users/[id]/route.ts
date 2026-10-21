import { NextResponse } from "next/server";
import { audit, endAllSessions, sendInvite } from "@/lib/auth";
import { getPartner } from "@/lib/partners";
import { canManageUser, deleteUser, getUser, isAdmin, roleLabel, saveProfitShare, saveShares, updateUser, validateShares, validateUser } from "@/lib/users";
import { getConfig } from "@/lib/perms-db";
import { bucket } from "@/lib/orders";
import { err, json, staffApi } from "@/lib/api";
import { can, roleNames } from "@/lib/perms";
import { setAccreditations } from "@/lib/accreditations";

/** Edit an account, (re)send the invitation, disable or re-enable it. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await staffApi("any", true);
  if ("res" in a) return a.res;
  const { id } = await params;
  const u = await getUser(a.db, id);
  if (!u) return err("Utilizatorul nu există.", 404);
  const self = u.id === a.user.id;
  // Team accounts are managed by administrators (anyone may edit their own details); owners only by owners.
  if (u.kind === "internal" && !self && (!can(a.user, "users.E") || (u.role === "owner" && a.user.role !== "owner")))
    return err("Nu ai drepturi pentru acest cont.", 403);
  if (!self && !can(a.user, "users.E") && !(u.kind === "client" && can(a.user, "clients.E"))) return err("Nu ai drepturi pentru acest cont.", 403);
  const b = await json(req);
  const actor = `user:${a.user.id}`;

  if (b.action === "update") {
    const cfg = await getConfig(a.db);
    const v = validateUser(u.kind, b, u.role, a.user.role === "owner", cfg.roles.map((r) => r.id));
    if (!v.ok) return err(v.error);
    // Nobody changes their own role.
    if (self) Object.assign(v.value, { role: u.role, engagement: u.engagement });
    // Fee shares: only the owner sets them.
    const shares = u.kind === "internal" && a.user.role === "owner" && "share_evaluator" in b ? validateShares(b) : null;
    if (shares && !shares.ok) return err(shares.error);
    if (u.kind === "partner" && !(await getPartner(a.db, v.value.partner_id!))) return err("Firma aleasă nu există.");
    // A portal account's email (its sign-in) and firm (which orders it sees) are changed only by administrators:
    // otherwise any team member could take the account over.
    if (u.kind !== "internal" && !isAdmin(a.user) && (v.value.email !== u.email || (u.kind === "partner" && v.value.partner_id !== u.partner_id)))
      return err("Doar un administrator poate schimba emailul sau firma unui cont din portal.", 403);
    const r = await updateUser(a.db, u, v.value);
    if (!r.ok) return err(r.error, 409);
    if (shares?.ok) await saveShares(a.db, u.id, shares.value);
    // the share of the profit: set (and seen) only by the owner
    if (u.kind === "internal" && a.user.role === "owner" && "profit_share" in b) {
      const ps = await saveProfitShare(a.db, u.id, b.profit_share);
      if (!ps.ok) return err(ps.error);
    }
    const changed = [v.value.role !== u.role && `rol: ${roleLabel("internal", v.value.role, roleNames(cfg))}`, shares?.ok && `cote: ${shares.value.map((x) => x ?? "—").join(" / ")}`].filter(Boolean).join(" · ");
    await audit(a.db, actor, "user.update", "user", id, changed || undefined);
    return NextResponse.json({ ok: true });
  }
  // Agreeri: the framework contracts the person is accredited on (administrators of the team accounts).
  if (b.action === "accreditations") {
    if (u.kind !== "internal" || !can(a.user, "users.E")) return err("Agreerile le dă un administrator, pentru conturile echipei.", 403);
    const ids = Array.isArray(b.contracts) ? (b.contracts as unknown[]).filter((x): x is string => typeof x === "string" && /^[\w-]{1,80}$/.test(x)).slice(0, 200) : [];
    const { results } = ids.length
      ? await a.db.prepare(`SELECT id FROM contracts WHERE kind = 'framework' AND id IN (${ids.map(() => "?").join(",")})`).bind(...ids).all<{ id: string }>()
      : { results: [] as { id: string }[] };
    const r = await setAccreditations(a.db, u.id, results.map((x) => x.id), a.user.id);
    if (r.added.length || r.removed.length) await audit(a.db, actor, "user.accreditations", "user", id, `agreeri: +${r.added.length} −${r.removed.length}`);
    return NextResponse.json({ ok: true, contracts: results.map((x) => x.id) });
  }
  if (b.action === "invite") {
    if (u.status === "disabled") return err("Contul este dezactivat. Reactivează-l întâi.");
    if (u.status === "active" && u.kind !== "internal") return err("Contul este deja activ.");
    return NextResponse.json({ ok: true, sent: await sendInvite(a.db, id, actor) });
  }
  if ((b.action === "disable" || b.action === "enable") && u.kind !== "internal" && !isAdmin(a.user))
    return err("Doar un administrator poate dezactiva sau reactiva conturile din portal.", 403);
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

/** Deletes an account (for good when it has no work behind it, else hidden and its email freed). */
export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await staffApi("any", true);
  if ("res" in a) return a.res;
  const { id } = await params;
  const u = await getUser(a.db, id);
  if (!u || u.status === "deleted") return err("Utilizatorul nu există.", 404);
  if (u.id === a.user.id) return err("Nu îți poți șterge propriul cont.");
  if (!canManageUser(a.user, u) || !isAdmin(a.user)) return err("Doar un administrator poate șterge conturi.", 403);
  if (u.kind === "internal" && u.role === "owner") {
    const owners = await a.db.prepare("SELECT COUNT(*) AS n FROM users WHERE kind = 'internal' AND role = 'owner' AND status = 'active'").first<{ n: number }>();
    if ((owners?.n ?? 0) <= 1) return err("Este singurul proprietar activ: nu poate fi șters.");
  }
  if (u.avatar_at) await (await bucket())?.delete(`avatars/${u.id}.jpg`);
  const r = await deleteUser(a.db, u);
  await audit(a.db, `user:${a.user.id}`, "user.delete", "user", id, `${u.name || u.email}${r.removed ? "" : " (păstrat în istoricul lucrărilor)"}`);
  return NextResponse.json({ ok: true, removed: r.removed });
}
