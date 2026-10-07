import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { endSession } from "@/lib/auth";
import { APP } from "@/lib/site";
import { json } from "@/lib/api";

export async function POST(req: Request) {
  const a = (await json(req)).app;
  const app = a === "crm" || a === "insp" ? a : "portal";
  const db = await getDb();
  if (db) await endSession(db, app);
  const res = NextResponse.json({ ok: true });
  res.cookies.set({ name: APP[app].cookie, value: "", path: "/", maxAge: 0 });
  return res;
}
