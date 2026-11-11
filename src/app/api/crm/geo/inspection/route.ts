import { json, staffApi } from "@/lib/api";
import { assetPins } from "@/lib/asset-pins";
import { uvaloLocations } from "@/lib/uvalo";
import { assetInScope } from "@/lib/asset-scope";

/** The inspection pin of an asset, after reading again from UVALO the place of its inspections made there (asset's map). */
export async function POST(req: Request) {
  const a = await staffApi("any");
  if ("res" in a) return a.res;
  const asset = String((await json(req)).asset ?? "").slice(0, 80);
  if (!(await assetInScope(a.db, a.user, asset))) return Response.json({ pin: null });
  await uvaloLocations(a.db, asset).catch((e) => console.error("uvalo location", e));
  const { pins } = await assetPins(a.db, asset);
  return Response.json({ pin: pins.find((p) => p.kind === "inspectie" && p.lat != null) ?? null });
}
