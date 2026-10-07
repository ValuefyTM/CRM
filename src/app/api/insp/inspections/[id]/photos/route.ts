import { NextResponse } from "next/server";
import { err } from "@/lib/api";
import { addPhoto, inspApi, myInspection } from "@/lib/insp";

/** Uploads one photo (multipart: file, id generated on the phone, category, caption, taken_at, lat, lng, width, height). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await inspApi();
  if ("res" in a) return a.res;
  const ins = await myInspection(a.db, a.user, (await params).id);
  if (!ins) return err("Inspecția nu există sau nu îți este alocată.", 404);
  const form = await req.formData().catch(() => null);
  if (!form) return err("Cererea nu conține fotografia.");
  const r = await addPhoto(a.db, a.user, ins, form);
  if (!r.ok) return err(r.error, r.status);
  return NextResponse.json({ ok: true, id: r.id });
}
