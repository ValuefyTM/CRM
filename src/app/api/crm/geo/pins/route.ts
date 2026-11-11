import { err, staffApi } from "@/lib/api";
import { assetPins } from "@/lib/asset-pins";
import { assetInScope } from "@/lib/asset-scope";

/** The points of an asset for the big map („Vezi pe hartă” in the report's list of assets). */
export async function GET(req: Request) {
  const a = await staffApi("any");
  if ("res" in a) return a.res;
  const asset = new URL(req.url).searchParams.get("asset") ?? "";
  if (!(await assetInScope(a.db, a.user, asset))) return err("Nu există.", 404);
  return Response.json(await assetPins(a.db, asset));
}
