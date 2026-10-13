import { NextResponse } from "next/server";
import { inspApi, myInspections } from "@/lib/insp";
import { currentForms } from "@/lib/insp-templates-db";

/** The signed-in inspector's inspections (to schedule, scheduled, done in the last 45 days). */
export async function GET() {
  const a = await inspApi();
  if ("res" in a) return a.res;
  const [inspections, forms] = await Promise.all([myInspections(a.db, a.user), currentForms(a.db)]);
  return NextResponse.json(
    // forms: the sheet templates of the firm, so a sheet started without signal uses the current one.
    { inspections, forms, me: { id: a.user.id, name: a.user.name, email: a.user.email, role: a.user.role }, at: new Date().toISOString() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
