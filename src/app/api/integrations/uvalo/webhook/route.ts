import { getCloudflareContext } from "@opennextjs/cloudflare";
import { onHook, verifyHook, type HookEvent } from "@/lib/uvalo";
import { dispatchPush } from "@/lib/push";

/**
 * UVALO calls this on every change of an inspection the CRM sent (signed with UVALO_WEBHOOK_SECRET). It answers at once;
 * the work (e.g. copying the finished sheet and its photos) goes on after the answer.
 */
export async function POST(req: Request) {
  const body = await req.text();
  if (!(await verifyHook(body, req.headers.get("x-uvalo-signature")))) return Response.json({ error: "Semnătură invalidă." }, { status: 401 });
  let h: HookEvent;
  try { h = JSON.parse(body) as HookEvent; } catch { return Response.json({ error: "Corp invalid." }, { status: 400 }); }
  if (!h?.ref || !h.event) return Response.json({ error: "Eveniment incomplet." }, { status: 400 });
  const { env, ctx } = await getCloudflareContext({ async: true });
  const db = (env as { DB?: D1Database }).DB;
  if (!db) return Response.json({ error: "Baza de date nu este disponibilă." }, { status: 503 });
  // then the team is told (bell, push) about what changed, e.g. a finished inspection
  ctx.waitUntil(onHook(db, h).catch(() => {}).then(() => dispatchPush(db)).catch(() => {}));
  return Response.json({ ok: true });
}
