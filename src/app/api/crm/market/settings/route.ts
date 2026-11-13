import { json, staffApi } from "@/lib/api";
import { audit } from "@/lib/auth";
import { saveMarketSettings } from "@/lib/market/settings";

/** `{ nightly, concurrency }`: the nightly run on / off, how many Apify runs in parallel. */
export async function PUT(req: Request) {
  const a = await staffApi("market:searches", true);
  if ("res" in a) return a.res;
  const b = await json(req);
  const v = await saveMarketSettings(a.db, { nightly: b.nightly !== false, concurrency: Number(b.concurrency) }, a.user.id);
  await audit(a.db, `user:${a.user.id}`, "market.settings", "settings", "market", JSON.stringify(v));
  return Response.json(v);
}
