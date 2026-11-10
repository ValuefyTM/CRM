import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { consumeToken, createSession, currentUser, signInUserId } from "@/lib/auth";

/** One-time sign-in link from the email; `next` = the portal page to open (a notification's link). */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const base = url.pathname.startsWith("/portal/") ? "/portal" : "";
  const raw = url.searchParams.get("next") ?? "";
  const next = raw.startsWith("/") && !raw.startsWith("//") && !raw.includes("\\") ? raw : "";
  const to = new URL(`${base}${next}` || "/", url);
  const db = await getDb();
  const token = url.searchParams.get("token") ?? "";
  const t = db && token ? await consumeToken(db, "portal", "login", token) : null;
  const userId = db && t ? await signInUserId(db, t.kind, t.email) : null;
  if (!db || !t || !userId) {
    // the link was used already (a second click) or expired: signed in on this device, the page opens; else sign in
    if (db && next && (await currentUser(db, "portal"))) return NextResponse.redirect(to);
    return NextResponse.redirect(new URL(`${base}/login?link=expired${next ? `&next=${encodeURIComponent(next)}` : ""}`, url));
  }
  const res = NextResponse.redirect(next ? to : new URL(base || "/", url));
  res.cookies.set(await createSession(db, t.kind, userId));
  return res;
}
