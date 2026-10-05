import { NextResponse } from "next/server";
import { audit, sendInvite } from "@/lib/auth";
import { createPartner, validatePartner } from "@/lib/partners";
import { createUser, validateUser, type UserInput } from "@/lib/users";
import { err, json, staffApi } from "@/lib/api";

/** New partner firm, optionally with its first portal user (and invitation). */
export async function POST(req: Request) {
  const a = await staffApi();
  if ("res" in a) return a.res;
  const b = await json(req);
  const p = validatePartner(b);
  if (!p.ok) return err(p.error);
  const contact = b.contact as Record<string, unknown> | undefined;
  let person: UserInput | null = null;
  if (contact && typeof contact.email === "string" && contact.email.trim()) {
    const v = validateUser("partner", { ...contact, role: "owner", partner_id: "new" });
    if (!v.ok) return err(v.error.replace("Adresa de email", "Adresa de email a persoanei de contact"));
    person = v.value;
    const taken = await a.db.prepare("SELECT 1 FROM users WHERE kind = 'partner' AND email = ?").bind(person.email).first();
    if (taken) return err("Adresa de email a persoanei de contact este folosită deja de un colaborator.");
  }
  const id = await createPartner(a.db, p.value, a.user.id);
  const actor = `user:${a.user.id}`;
  await audit(a.db, actor, "partner.create", "partner", id, p.value.name);
  let invited = false;
  if (person) {
    const u = await createUser(a.db, "partner", { ...person, partner_id: id }, a.user.id);
    if (u.ok) {
      await audit(a.db, actor, "user.create", "user", u.id, `${person.email} · Administrator cont`);
      if (b.invite !== false) invited = await sendInvite(a.db, u.id, actor);
    }
  }
  return NextResponse.json({ ok: true, id, invited });
}
