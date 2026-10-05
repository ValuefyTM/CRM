import { NextResponse } from "next/server";
import { audit } from "@/lib/auth";
import { err, json, partnerApi } from "@/lib/api";

export async function PATCH(req: Request) {
  const a = await partnerApi();
  if ("res" in a) return a.res;
  const b = await json(req);
  const name = typeof b.name === "string" ? b.name.trim().slice(0, 120) : "";
  const phone = typeof b.phone === "string" ? b.phone.trim().slice(0, 40) : "";
  if (name.length < 3) return err("Completează numele și prenumele.");
  if (phone.replace(/\D/g, "").length < 9) return err("Numărul de telefon pare incomplet.");
  await a.db.prepare("UPDATE partner_users SET name = ?, phone = ? WHERE id = ?").bind(name, phone, a.user.id).run();
  await audit(a.db, `partner:${a.user.id}`, "partner_user.profile", "partner_user", a.user.id);
  return NextResponse.json({ ok: true });
}
