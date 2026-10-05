import { NextResponse } from "next/server";
import { audit } from "@/lib/auth";
import { uuid } from "@/lib/db";
import { normEmail, validEmail } from "@/lib/crypto";
import { err, json, staffApi } from "@/lib/api";

/** Add a VALUEFY team member (admins and owners only). They sign in with an email code. */
export async function POST(req: Request) {
  const a = await staffApi("admin");
  if ("res" in a) return a.res;
  const b = await json(req);
  const email = typeof b.email === "string" ? b.email : "";
  if (!validEmail(email)) return err("Adresa de email nu pare validă.");
  const role = b.role === "admin" ? "admin" : "staff";
  const name = typeof b.name === "string" ? b.name.trim().slice(0, 120) : "";
  const exists = await a.db.prepare("SELECT 1 FROM staff_users WHERE email = ?").bind(normEmail(email)).first();
  if (exists) return err("Persoana are deja cont în CRM.", 409);
  const id = uuid();
  await a.db.prepare("INSERT INTO staff_users (id, email, name, role) VALUES (?, ?, ?, ?)").bind(id, normEmail(email), name, role).run();
  await audit(a.db, `staff:${a.user.id}`, "staff.create", "staff_user", id, `${normEmail(email)} (${role})`);
  return NextResponse.json({ ok: true, id });
}
