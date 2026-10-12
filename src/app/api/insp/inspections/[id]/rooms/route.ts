import { NextResponse } from "next/server";
import { inspApi, myInspection } from "@/lib/insp";
import { assetDocs } from "@/lib/insp-docs";
import { roomsFromSurvey } from "@/lib/insp-rooms";

/** Reads the room list from the inspection's floor survey (releveu) with AI; the phone merges it into the sheet. */
export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await inspApi();
  if ("res" in a) return a.res;
  const ins = await myInspection(a.db, a.user, (await params).id);
  if (!ins) return NextResponse.json({ error: "Inspecția nu există." }, { status: 404 });
  if (!ins.report_id || !ins.asset_id) return NextResponse.json({ error: "Inspecția nu are releveu." }, { status: 400 });
  const r = await roomsFromSurvey(await assetDocs(a.db, ins.report_id, [ins.asset_id]));
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 422 });
  await a.db.prepare("INSERT INTO audit_log (actor, action, entity, entity_id, details) VALUES (?, 'inspection.rooms_ai', 'inspection', ?, ?)")
    .bind(`user:${a.user.id}`, ins.id, `${r.data.rooms.length} încăperi`).run().catch(() => {});
  return NextResponse.json(r.data);
}
