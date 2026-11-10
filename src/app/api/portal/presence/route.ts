import { portalApi } from "@/lib/api";
import { presenceOf } from "@/lib/presence";

/** Online / away / offline of the team members a portal page shows (evaluators, inspectors): `?ids=a,b` → `{ id: [presence, seen] }`. */
export async function GET(req: Request) {
  const a = await portalApi();
  if ("res" in a) return a.res;
  const ids = [...new Set((new URL(req.url).searchParams.get("ids") ?? "").split(",").map((x) => x.trim()).filter((x) => x && x.length <= 80))].slice(0, 100);
  if (!ids.length) return Response.json({});
  const { results } = await a.db.prepare(`SELECT id, last_seen_at FROM users WHERE kind = 'internal' AND id IN (${ids.map(() => "?").join(",")})`).bind(...ids)
    .all<{ id: string; last_seen_at: string | null }>();
  const out: Record<string, [string, string]> = {};
  for (const r of results) { const p = presenceOf(r.last_seen_at); out[r.id] = [p.presence, p.seen]; }
  return Response.json(out, { headers: { "Cache-Control": "no-store" } });
}
