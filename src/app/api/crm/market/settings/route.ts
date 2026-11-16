import { json, staffApi } from "@/lib/api";
import { audit } from "@/lib/auth";
import { dedupe } from "@/lib/market/crawler";
import { saveMarketSettings, type MarketSettings } from "@/lib/market/settings";

/** The schedule (on / off, hours, days), parallel runs, limits of a run, the e-mail summary. */
export async function PUT(req: Request) {
  const a = await staffApi("market:searches", true);
  if ("res" in a) return a.res;
  const b = await json(req);
  const v = await saveMarketSettings(a.db, { ...(b as Partial<MarketSettings>), nightly: b.nightly !== false }, a.user.id);
  // the groups of duplicates follow the rules right away
  const groups = await dedupe(a.db).catch(() => null);
  await audit(a.db, `user:${a.user.id}`, "market.settings", "settings", "market", JSON.stringify(v));
  return Response.json({ ...v, groups });
}
