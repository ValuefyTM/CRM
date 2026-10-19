import { err, json, reportApi } from "@/lib/api";
import { addAsset, removeAsset, updateAsset, validateAsset } from "@/lib/assets";
import { resyncUvalo } from "@/lib/uvalo";

const report = async (db: D1Database, id: string) => db.prepare("SELECT id FROM reports WHERE id = ?").bind(id).first();

/** Adds an asset to the report: a new property, or one already in the CRM (`property_id`). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await reportApi(id, "assets", true);
  if ("res" in a) return a.res;
  if (!(await report(a.db, id))) return err("Raportul nu există.", 404);
  const v = validateAsset(await json(req));
  if (!v.ok) return err(v.error);
  const r = await addAsset(a.db, a.user.id, id, v.value);
  return r.ok ? Response.json(r) : err(r.error);
}

/** Edits an asset (`?asset=`): its property data, value, approach and whether it is the main one. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await reportApi(id, "assets", true);
  if ("res" in a) return a.res;
  const v = validateAsset(await json(req));
  if (!v.ok) return err(v.error);
  const assetId = new URL(req.url).searchParams.get("asset") ?? "";
  const r = await updateAsset(a.db, a.user.id, id, assetId, v.value);
  if (!r.ok) return err(r.error);
  // The property changed (address, cadastral numbers, areas…): the inspections already in UVALO get it too.
  const p = await a.db.prepare("SELECT property_id FROM assets WHERE id = ?").bind(assetId).first<{ property_id: string }>();
  if (p) await resyncUvalo(a.db, { propertyId: p.property_id });
  return Response.json(r);
}

/** Takes an asset out of the report (`?asset=`), while it has no inspection done. */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await reportApi(id, "assets", true);
  if ("res" in a) return a.res;
  const r = await removeAsset(a.db, a.user.id, id, new URL(req.url).searchParams.get("asset") ?? "");
  return r.ok ? Response.json(r) : err(r.error);
}
