import { staffApi } from "@/lib/api";
import { presenceOf } from "@/lib/presence";

/** Heartbeat of an open CRM tab: signing the request in is what records the user as online. */
export async function POST() {
  const a = await staffApi();
  if ("res" in a) return a.res;
  return new Response(null, { status: 204 });
}

/** Online / away / offline of the people whose avatars a page shows: `?ids=a,b,c` → `{ id: [presence, seen] }`. */
export async function GET(req: Request) {
  const a = await staffApi();
  if ("res" in a) return a.res;
  const ids = [...new Set((new URL(req.url).searchParams.get("ids") ?? "").split(",").map((x) => x.trim()).filter((x) => x && x.length <= 80))].slice(0, 300);
  if (!ids.length) return Response.json({});
  const out: Record<string, [string, string]> = {};
  for (let i = 0; i < ids.length; i += 90) {
    const part = ids.slice(i, i + 90);
    const { results } = await a.db.prepare(`SELECT id, last_seen_at FROM users WHERE id IN (${part.map(() => "?").join(",")})`).bind(...part).all<{ id: string; last_seen_at: string | null }>();
    for (const r of results) { const p = presenceOf(r.last_seen_at); out[r.id] = [p.presence, p.seen]; }
  }
  return Response.json(out, { headers: { "Cache-Control": "no-store" } });
}
