import { NextResponse } from "next/server";
import { staffApi } from "@/lib/api";
import { deletePhoto, getPhoto } from "@/lib/listings";

type Ctx = { params: Promise<{ id: string }> };

/** A listing photo, for the CRM pages (same origin, so the share card can be drawn from it). */
export async function GET(_req: Request, { params }: Ctx) {
  const a = await staffApi("listings");
  if ("res" in a) return a.res;
  const { id } = await params;
  const photo = /^[0-9a-f-]{36}$/.test(id) ? await getPhoto(a.db, id) : null;
  if (!photo) return new Response("Not found", { status: 404 });
  const bytes = photo.data instanceof ArrayBuffer ? new Uint8Array(photo.data) : new Uint8Array(photo.data as number[]);
  return new Response(bytes, { headers: { "Content-Type": photo.content_type, "Cache-Control": "private, max-age=31536000, immutable" } });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const a = await staffApi("listings", true);
  if ("res" in a) return a.res;
  await deletePhoto(a.db, (await params).id);
  return NextResponse.json({ ok: true });
}
