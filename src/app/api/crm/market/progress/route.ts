import { staffApi } from "@/lib/api";
import { runProgress, tick } from "@/lib/market/crawler";
import { marketBucket } from "@/lib/market/env";
import { can } from "@/lib/perms";

/** The progress of the current (or last) run, for the control panel. */
export async function GET() {
  const a = await staffApi("market");
  if ("res" in a) return a.res;
  return Response.json(await runProgress(a.db));
}

/** While the control panel is open, it moves the queue on itself (a short pass, ~20 s) instead of waiting for the cron. */
export async function POST() {
  const a = await staffApi("market", true);
  if ("res" in a) return a.res;
  if (!can(a.user, "market:searches")) return Response.json(await runProgress(a.db));
  const r = await tick(a.db, await marketBucket(), 22_000).catch((e) => ({ error: String(e) }));
  return Response.json({ ...(await runProgress(a.db)), pass: r });
}
