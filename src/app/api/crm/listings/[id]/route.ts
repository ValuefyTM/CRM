import { NextResponse } from "next/server";
import { err, json, staffApi } from "@/lib/api";
import { deleteListing, getById, setPublished, updateListing, validateInput } from "@/lib/listings";
import { withAutoEnglish } from "@/lib/translate-listing";

type Ctx = { params: Promise<{ id: string }> };

export async function PUT(req: Request, { params }: Ctx) {
  const a = await staffApi("listings", true);
  if ("res" in a) return a.res;
  const { id } = await params;
  if (!(await getById(a.db, id))) return err("Anunțul nu există.", 404);
  const v = validateInput(await json(req));
  if (!v.ok) return err(v.error);
  const value = await withAutoEnglish(v.value);
  const slug = await updateListing(a.db, id, value);
  return NextResponse.json({ ok: true, slug, en: { title: value.title_en ?? "", description: value.description_en ?? "", features: value.features_en ?? [] } });
}

/** Quick publish / unpublish from the list. */
export async function PATCH(req: Request, { params }: Ctx) {
  const a = await staffApi("listings", true);
  if ("res" in a) return a.res;
  const b = await json(req);
  await setPublished(a.db, (await params).id, b.published === true);
  return NextResponse.json({ ok: true });
}

/** Deleting a listing and its photos: owner or administrator only. */
export async function DELETE(_req: Request, { params }: Ctx) {
  const a = await staffApi("delete", true);
  if ("res" in a) return a.res;
  await deleteListing(a.db, (await params).id);
  return NextResponse.json({ ok: true });
}
