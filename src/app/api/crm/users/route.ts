import { NextResponse } from "next/server";
import { audit, sendInvite } from "@/lib/auth";
import { getPartner } from "@/lib/partners";
import { createUser, isAdmin, roleLabel, saveShares, validateShares, validateUser } from "@/lib/users";
import { getConfig } from "@/lib/perms-db";
import { err, json, staffApi } from "@/lib/api";
import { can, roleNames } from "@/lib/perms";

/** New account of any kind, by default with an invitation email. Team accounts are created by administrators only. */
export async function POST(req: Request) {
  const a = await staffApi("any", true);
  if ("res" in a) return a.res;
  const b = await json(req);
  const kind = b.kind;
  if (kind !== "internal" && kind !== "partner" && kind !== "client") return err("Tip de utilizator necunoscut.");
  if (kind === "internal" && !isAdmin(a.user)) return err("Doar administratorii pot adăuga utilizatori interni.", 403);
  if (!can(a.user, kind === "client" ? "clients.E" : kind === "partner" ? "partners.E" : "users.A")) return err("Nu ai drepturi pentru această acțiune.", 403);
  const cfg = await getConfig(a.db);
  const v = validateUser(kind, b, undefined, a.user.role === "owner", cfg.roles.map((r) => r.id));
  if (!v.ok) return err(v.error);
  if (kind === "partner" && !(await getPartner(a.db, v.value.partner_id!))) return err("Firma aleasă nu există.");
  const shares = kind === "internal" && a.user.role === "owner" && "share_evaluator" in b ? validateShares(b) : null;
  if (shares && !shares.ok) return err(shares.error);
  const r = await createUser(a.db, kind, v.value, a.user.id);
  if (!r.ok) return err(r.error, 409);
  if (shares?.ok) await saveShares(a.db, r.id, shares.value);
  const actor = `user:${a.user.id}`;
  await audit(a.db, actor, "user.create", "user", r.id, `${v.value.email} · ${roleLabel(kind, v.value.role, roleNames(cfg))}`);
  const invited = b.invite === false ? false : await sendInvite(a.db, r.id, actor);
  return NextResponse.json({ ok: true, id: r.id, invited });
}
