import { NextResponse } from "next/server";
import { doneInspections, inspApi } from "@/lib/insp";

/** The inspector's statement: inspections done this month, last month or all. */
export async function GET(req: Request) {
  const a = await inspApi();
  if ("res" in a) return a.res;
  const r = new URL(req.url).searchParams.get("luna");
  const range = r === "trecuta" || r === "toate" ? r : "luna";
  return NextResponse.json({ rows: await doneInspections(a.db, a.user, range) }, { headers: { "Cache-Control": "no-store" } });
}
