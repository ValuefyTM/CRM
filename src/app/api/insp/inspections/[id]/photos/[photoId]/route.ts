import { NextResponse } from "next/server";
import { err } from "@/lib/api";
import { deletePhoto, inspApi, myInspection } from "@/lib/insp";

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string; photoId: string }> }) {
  const a = await inspApi();
  if ("res" in a) return a.res;
  const p = await params;
  const ins = await myInspection(a.db, a.user, p.id);
  if (!ins) return err("Inspecția nu există sau nu îți este alocată.", 404);
  const r = await deletePhoto(a.db, ins, p.photoId);
  if (!r.ok) return err(r.error, r.status);
  return NextResponse.json({ ok: true });
}
