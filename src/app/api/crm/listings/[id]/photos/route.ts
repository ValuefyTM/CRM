import { NextResponse } from "next/server";
import { err, json, staffApi } from "@/lib/api";
import { MAX_PHOTO_BYTES, PHOTO_TYPES, addPhoto, getById, reorderPhotos } from "@/lib/listings";

type Ctx = { params: Promise<{ id: string }> };

/** Photos already resized in the browser (max 1600 px JPEG), so each fits in a database row. */
export async function POST(req: Request, { params }: Ctx) {
  const a = await staffApi();
  if ("res" in a) return a.res;
  const { id } = await params;
  if (!(await getById(a.db, id))) return err("Anunțul nu există.", 404);
  const form = await req.formData().catch(() => null);
  const files = (form?.getAll("photos") ?? []).filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) return err("Nicio fotografie primită.");
  const ids: string[] = [];
  const skipped: string[] = [];
  for (const f of files) {
    if (!PHOTO_TYPES.includes(f.type) || f.size > MAX_PHOTO_BYTES) { skipped.push(f.name); continue; }
    ids.push(await addPhoto(a.db, id, await f.arrayBuffer(), f.type));
  }
  return NextResponse.json({ ok: true, ids, skipped });
}

/** New order of the photos (the first one is the cover). */
export async function PUT(req: Request, { params }: Ctx) {
  const a = await staffApi();
  if ("res" in a) return a.res;
  const { order } = await json(req);
  if (!Array.isArray(order)) return err("Ordine invalidă.");
  await reorderPhotos(a.db, (await params).id, order.map(String).slice(0, 100));
  return NextResponse.json({ ok: true });
}
