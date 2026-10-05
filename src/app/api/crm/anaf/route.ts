import { NextResponse } from "next/server";
import { lookupCui } from "@/lib/anaf";
import { err, staffApi } from "@/lib/api";

/** Company details by CUI (ANAF public registry). */
export async function GET(req: Request) {
  const a = await staffApi();
  if ("res" in a) return a.res;
  const r = await lookupCui(new URL(req.url).searchParams.get("cui") ?? "");
  return r.ok ? NextResponse.json(r.company) : err(r.error, 404);
}
