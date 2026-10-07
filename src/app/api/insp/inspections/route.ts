import { NextResponse } from "next/server";
import { inspApi, myInspections } from "@/lib/insp";

/** The signed-in inspector's inspections (to schedule, scheduled, done in the last 45 days). */
export async function GET() {
  const a = await inspApi();
  if ("res" in a) return a.res;
  const inspections = await myInspections(a.db, a.user);
  return NextResponse.json(
    { inspections, me: { id: a.user.id, name: a.user.name, email: a.user.email, role: a.user.role }, at: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
