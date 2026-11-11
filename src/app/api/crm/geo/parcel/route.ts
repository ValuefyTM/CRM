import { json, staffApi } from "@/lib/api";
import { assetPins } from "@/lib/asset-pins";
import { assetInScope } from "@/lib/asset-scope";
import { pinParcel } from "@/lib/asset-pins";
import { locatorEnabled, uvaloParcel } from "@/lib/site-analysis";

/**
 * The parcel of an asset from the geoportal plans (UVALO locator), for the big map: its contour and centre, by the
 * cadastral number. Nothing is saved (the site analysis keeps the parcel when it is run).
 */
export async function POST(req: Request) {
  const a = await staffApi("any");
  if ("res" in a) return a.res;
  const asset = String((await json(req)).asset ?? "");
  if (!(await assetInScope(a.db, a.user, asset))) return Response.json({ parcel: null });
  const { parcel, query } = await assetPins(a.db, asset);
  if (parcel) return Response.json({ parcel, centre: null });
  if (!query.nr || !locatorEnabled()) return Response.json({ parcel: null });
  const r = await uvaloParcel({ nr: query.nr, city: query.city }).catch(() => null);
  const p = r?.parcel ?? null;
  return Response.json({ parcel: pinParcel(p), centre: p?.centre ?? null, note: p ? `centrul parcelei${p.nr ? ` nr. ${p.nr}` : ""}${p.uat ? ` · UAT ${p.uat}` : ""}` : null });
}
