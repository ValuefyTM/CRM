import { NextResponse } from "next/server";
import { audit } from "@/lib/auth";
import { now } from "@/lib/db";
import { err, json, portalApi } from "@/lib/api";

export async function PATCH(req: Request) {
  const a = await portalApi();
  if ("res" in a) return a.res;
  const b = await json(req);
  const name = typeof b.name === "string" ? b.name.trim().slice(0, 120) : "";
  const phone = typeof b.phone === "string" ? b.phone.trim().slice(0, 40) : "";
  if (name.length < 3) return err("Completează numele și prenumele.");
  if (phone.replace(/\D/g, "").length < 9) return err("Numărul de telefon pare incomplet.");
  await a.db.prepare("UPDATE users SET name = ?, phone = ?, updated_at = ? WHERE id = ?").bind(name, phone, now(), a.user.id).run();
  await audit(a.db, `user:${a.user.id}`, "user.profile", "user", a.user.id);
  return NextResponse.json({ ok: true });
}
