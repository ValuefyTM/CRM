import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { endSession } from "@/lib/auth";
import { APP } from "@/lib/site";
import { json } from "@/lib/api";

export async function POST(req: Request) {
  const audience = (await json(req)).audience === "staff" ? "staff" : "partner";
  const db = await getDb();
  if (db) await endSession(db, audience);
  const res = NextResponse.json({ ok: true });
  res.cookies.set({ name: APP[audience].cookie, value: "", path: "/", maxAge: 0 });
  return res;
}
