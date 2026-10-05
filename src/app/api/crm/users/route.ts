import { NextResponse } from "next/server";
import { audit, sendInvite } from "@/lib/auth";
import { getPartner } from "@/lib/partners";
import { createUser, isAdmin, roleLabel, validateUser } from "@/lib/users";
import { err, json, staffApi } from "@/lib/api";

/** New account of any kind, by default with an invitation email. Team accounts are created by administrators only. */
export async function POST(req: Request) {
  const a = await staffApi();
  if ("res" in a) return a.res;
  const b = await json(req);
  const kind = b.kind;
  if (kind !== "internal" && kind !== "partner" && kind !== "client") return err("Tip de utilizator necunoscut.");
  if (kind === "internal" && !isAdmin(a.user)) return err("Doar administratorii pot adăuga utilizatori interni.", 403);
  const v = validateUser(kind, b);
  if (!v.ok) return err(v.error);
  if (kind === "partner" && !(await getPartner(a.db, v.value.partner_id!))) return err("Firma aleasă nu există.");
  const r = await createUser(a.db, kind, v.value, a.user.id);
  if (!r.ok) return err(r.error, 409);
  const actor = `user:${a.user.id}`;
  await audit(a.db, actor, "user.create", "user", r.id, `${v.value.email} · ${roleLabel(kind, v.value.role)}`);
  const invited = b.invite === false ? false : await sendInvite(a.db, r.id, actor);
  return NextResponse.json({ ok: true, id: r.id, invited });
}
