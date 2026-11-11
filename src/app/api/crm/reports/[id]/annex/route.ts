import { err, reportApi } from "@/lib/api";
import { annexSources } from "@/lib/annex-sources";

/** What the annex of the report is made of: `?mod=foto|acte&assets=<id>,<id>` (the photos, or the documents, of those assets). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await reportApi(id, "view");
  if ("res" in a) return a.res;
  const u = new URL(req.url);
  const mode = u.searchParams.get("mod") === "acte" ? "acte" : "foto";
  const assets = (u.searchParams.get("assets") ?? "").split(",").filter((x) => /^[\w-]{1,80}$/.test(x)).slice(0, 50);
  if (!assets.length) return err("Alege cel puțin un bun.");
  const r = await a.db.prepare("SELECT id, number, order_id FROM reports WHERE id = ?").bind(id).first<{ id: string; number: string | null; order_id: string | null }>();
  if (!r) return err("Raportul nu există.", 404);
  return Response.json(await annexSources(a.db, r, assets, mode));
}
