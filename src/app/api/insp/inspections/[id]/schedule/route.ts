import { NextResponse } from "next/server";
import { err, json } from "@/lib/api";
import { inspApi, myInspection, schedule } from "@/lib/insp";

/** Schedules or reschedules the visit. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await inspApi();
  if ("res" in a) return a.res;
  const ins = await myInspection(a.db, a.user, (await params).id);
  if (!ins) return err("Inspecția nu există sau nu îți este alocată.", 404);
  const r = await schedule(a.db, a.user, ins, await json(req));
  if (!r.ok) return err(r.error);
  return NextResponse.json({ ok: true, inspection: await myInspection(a.db, a.user, ins.id) });
}
