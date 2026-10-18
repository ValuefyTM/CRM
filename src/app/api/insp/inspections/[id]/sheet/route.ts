import { NextResponse } from "next/server";
import { err, json } from "@/lib/api";
import { inspApi, myInspection, saveSheet, sheetOf } from "@/lib/insp";
import { pushLater } from "@/lib/push";

/** Saves the sheet as a draft, or submits it with `submit: true` (finishes the inspection). */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await inspApi();
  if ("res" in a) return a.res;
  const ins = await myInspection(a.db, a.user, (await params).id);
  if (!ins) return err("Inspecția nu există sau nu îți este alocată.", 404);
  const b = await json(req);
  const r = await saveSheet(a.db, a.user, ins, b);
  if (!r.ok) return err(r.error, r.status);
  // a finished inspection: the team and the owners are told (bell, push)
  if (b.submit === true) pushLater(a.db);
  return NextResponse.json({ ok: true, sheet: await sheetOf(a.db, ins.id), inspection: await myInspection(a.db, a.user, ins.id) });
}
