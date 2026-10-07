import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { consumeToken, createSession, signInUserId } from "@/lib/auth";

/** One-time sign-in link from the email. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const base = url.pathname.startsWith("/inspectii/") ? "/inspectii" : "";
  const db = await getDb();
  const token = url.searchParams.get("token") ?? "";
  const t = db && token ? await consumeToken(db, "insp", "login", token) : null;
  const userId = db && t ? await signInUserId(db, t.kind, t.email, "insp") : null;
  if (!db || !t || !userId) return NextResponse.redirect(new URL(`${base}/login?link=expired`, url));
  const res = NextResponse.redirect(new URL(base || "/", url));
  res.cookies.set(await createSession(db, t.kind, userId, "insp"));
  return res;
}
