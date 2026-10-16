import { NextResponse } from "next/server";
import { AS_COOKIE, audit, canImpersonate, currentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { err, json } from "@/lib/api";
import { getUser, isAdmin } from "@/lib/users";

const HOURS = 8;

/** The account really signed in (also while looking at the CRM as someone else). */
async function realUser() {
  const db = await getDb();
  if (!db) return { res: err("Baza de date nu este disponibilă.", 503) };
  const me = await currentUser(db, "crm");
  if (!me) return { res: err("Sesiunea a expirat. Autentifică-te din nou.", 401) };
  const real = me.impersonator ? await getUser(db, me.impersonator.id) : me;
  if (!real || !isAdmin(real)) return { res: err("Doar proprietarul și administratorii pot vedea CRM-ul ca alt utilizator.", 403) };
  return { db, real, me };
}

/** "Vezi ca…": `{ user }` — the CRM shows what that team member sees, read-only, for at most 8 hours. */
export async function POST(req: Request) {
  const a = await realUser();
  if ("res" in a) return a.res;
  const id = String((await json(req)).user ?? "");
  const res = NextResponse.json({ ok: true });
  if (!id || id === a.real.id) {
    res.cookies.delete(AS_COOKIE);
    return res;
  }
  const target = await getUser(a.db, id);
  if (!target || !canImpersonate(a.real, target)) return err(target?.role === "owner" ? "Contul proprietarului nu poate fi văzut de un administrator." : "Nu poți vedea CRM-ul ca acest utilizator.", 403);
  await audit(a.db, `user:${a.real.id}`, "user.impersonate", "user", target.id, target.name || target.email);
  res.cookies.set({ name: AS_COOKIE, value: target.id, httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: HOURS * 3600 });
  return res;
}

/** Back to one's own account. */
export async function DELETE() {
  const a = await realUser();
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(AS_COOKIE);
  if (!("res" in a) && a.me.impersonator) await audit(a.db, `user:${a.real.id}`, "user.impersonate_end", "user", a.me.id);
  return res;
}
