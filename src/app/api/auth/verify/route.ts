import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { createSession, verifyCode } from "@/lib/auth";
import { appParam, err, json, kindParam } from "@/lib/api";
import { basePath } from "@/lib/site";
import { findUser } from "@/lib/users";

/** Step 2 of sign-in: email + 6-digit code → session cookie. */
export async function POST(req: Request) {
  const b = await json(req);
  const kind = kindParam(b.kind);
  const email = typeof b.email === "string" ? b.email : "";
  const code = typeof b.code === "string" ? b.code : "";
  const db = await getDb();
  if (!db) return err("Serviciul nu este disponibil momentan.", 503);
  let app = appParam(b.app);
  // An inspector signing in from the CRM's page (the one app on the phone): the session is for the inspections app.
  let to: string | undefined;
  if (!app && kind === "internal" && (await findUser(db, kind, email))?.role === "inspector") { app = "insp"; to = (await basePath("insp")) || "/"; }
  const userId = await verifyCode(db, kind, email, code, app);
  if (!userId) return err("Codul nu este corect sau a expirat. Verifică emailul sau cere un cod nou.", 401);
  const res = NextResponse.json({ ok: true, to });
  res.cookies.set(await createSession(db, kind, userId, app));
  return res;
}
