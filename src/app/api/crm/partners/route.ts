import { NextResponse } from "next/server";
import { audit, sendInvite } from "@/lib/auth";
import { addPartnerUser, createPartner, validatePartner, validatePerson } from "@/lib/partners";
import { err, json, staffApi } from "@/lib/api";

/** New partner, optionally with its first portal user (and invitation). */
export async function POST(req: Request) {
  const a = await staffApi();
  if ("res" in a) return a.res;
  const b = await json(req);
  const p = validatePartner(b);
  if (!p.ok) return err(p.error);
  const contact = b.contact as Record<string, unknown> | undefined;
  let person: { name: string; email: string; phone: string | null; role: "owner" | "member" } | null = null;
  if (contact && typeof contact.email === "string" && contact.email.trim()) {
    const v = validatePerson({ ...contact, role: "owner" });
    if (!v.ok) return err(v.error);
    person = v.value;
    const taken = await a.db.prepare("SELECT 1 FROM partner_users WHERE email = ?").bind(person.email).first();
    if (taken) return err("Adresa de email a persoanei de contact este folosită deja la alt colaborator.");
  }
  const id = await createPartner(a.db, p.value, a.user.id);
  await audit(a.db, `staff:${a.user.id}`, "partner.create", "partner", id, p.value.name);
  let invited = false;
  if (person) {
    const u = await addPartnerUser(a.db, id, person);
    if (u.ok) {
      await audit(a.db, `staff:${a.user.id}`, "partner_user.create", "partner_user", u.id, person.email);
      if (b.invite !== false) invited = await sendInvite(a.db, u.id, `staff:${a.user.id}`);
    }
  }
  return NextResponse.json({ ok: true, id, invited });
}
