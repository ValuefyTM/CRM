import { err, json, staffApi } from "@/lib/api";
import { audit } from "@/lib/auth";
import { apifyConfigured } from "@/lib/market/apify";
import { startRun, tick } from "@/lib/market/crawler";
import { background, marketBucket } from "@/lib/market/env";
import { marketStatus } from "@/lib/market/search";

/** The state of the market crawler: searches, last runs, queue. */
export async function GET() {
  const a = await staffApi("market");
  if ("res" in a) return a.res;
  return Response.json(await marketStatus(a.db));
}

/** „Rulează acum”: a run of every enabled search, or of `{ searches: [ids] }`; the first pass starts right away. */
export async function POST(req: Request) {
  const a = await staffApi("market:searches", true);
  if ("res" in a) return a.res;
  if (!apifyConfigured()) return err("Lipsește APIFY_TOKEN (Cloudflare → Settings → Variables and Secrets).", 503);
  const body = await json(req);
  const ids = Array.isArray(body.searches) ? body.searches.map(String) : undefined;
  const r = await startRun(a.db, "manual", ids);
  if (!r.runId) return err("Nicio căutare activă.", 400);
  await audit(a.db, `user:${a.user.id}`, "market.run", "market_runs", r.runId, `${r.searches} căutări`);
  // the first pass now (the cron continues every 5 minutes)
  await background(tick(a.db, await marketBucket(), 60_000).catch((e) => console.error("market tick", e)));
  return Response.json(r);
}
