import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { consumeToken, createSession, userIdFor } from "@/lib/auth";

/** One-time sign-in link from the email. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const base = url.pathname.startsWith("/crm/") ? "/crm" : "";
  const db = await getDb();
  const token = url.searchParams.get("token") ?? "";
  const email = db && token ? await consumeToken(db, "staff", "login", token) : null;
  const userId = db && email ? await userIdFor(db, "staff", email) : null;
  if (!db || !userId) return NextResponse.redirect(new URL(`${base}/login?link=expired`, url));
  const res = NextResponse.redirect(new URL(base || "/", url));
  res.cookies.set(await createSession(db, "staff", userId));
  return res;
}
