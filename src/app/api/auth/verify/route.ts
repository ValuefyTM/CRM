import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { createSession, verifyCode } from "@/lib/auth";
import { appParam, err, json, kindParam } from "@/lib/api";

/** Step 2 of sign-in: email + 6-digit code → session cookie. */
export async function POST(req: Request) {
  const b = await json(req);
  const kind = kindParam(b.kind);
  const email = typeof b.email === "string" ? b.email : "";
  const code = typeof b.code === "string" ? b.code : "";
  const db = await getDb();
  if (!db) return err("Serviciul nu este disponibil momentan.", 503);
  const app = appParam(b.app);
  const userId = await verifyCode(db, kind, email, code, app);
  if (!userId) return err("Codul nu este corect sau a expirat. Verifică emailul sau cere un cod nou.", 401);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(await createSession(db, kind, userId, app));
  return res;
}
