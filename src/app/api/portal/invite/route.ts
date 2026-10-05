import { NextResponse } from "next/server";
import { getDb, now } from "@/lib/db";
import { audit, consumeToken, createSession, findPartnerUser } from "@/lib/auth";
import { err, json } from "@/lib/api";

/** Activates an invited partner account: name, phone, terms → active + signed in. */
export async function POST(req: Request) {
  const b = await json(req);
  const token = typeof b.token === "string" ? b.token : "";
  const name = typeof b.name === "string" ? b.name.trim().slice(0, 120) : "";
  const phone = typeof b.phone === "string" ? b.phone.trim().slice(0, 40) : "";
  if (name.length < 3) return err("Completează numele și prenumele.");
  if (phone.replace(/\D/g, "").length < 9) return err("Numărul de telefon pare incomplet.");
  if (b.terms !== true) return err("Este necesar acordul cu termenii de colaborare.");
  const db = await getDb();
  if (!db) return err("Serviciul nu este disponibil momentan.", 503);
  const email = await consumeToken(db, "partner", "invite", token);
  if (!email) return err("Invitația a expirat sau a fost deja folosită. Cere o invitație nouă.", 410);
  const u = await findPartnerUser(db, email);
  if (!u || u.status === "disabled" || u.partner_status !== "active") return err("Contul nu mai este disponibil. Contactează VALUEFY.", 403);
  await db
    .prepare("UPDATE partner_users SET name = ?, phone = ?, status = 'active', activated_at = COALESCE(activated_at, ?) WHERE id = ?")
    .bind(name, phone, now(), u.id)
    .run();
  await audit(db, `partner:${u.id}`, "partner_user.activate", "partner_user", u.id);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(await createSession(db, "partner", u.id));
  return res;
}
