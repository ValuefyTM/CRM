import { err } from "@/lib/api";
import { inspApi } from "@/lib/insp";
import { hasPushSubscription, removePushSubscription, savePushSubscription, vapidPublicKey } from "@/lib/push";

// Phone notifications of the inspections app (e.g. a sheet sent back for completions). Same keys as the CRM's.

/** The public key the phone subscribes with; `?endpoint=`: whether that phone is subscribed for this user. */
export async function GET(req: Request) {
  const a = await inspApi();
  if ("res" in a) return a.res;
  const endpoint = new URL(req.url).searchParams.get("endpoint");
  return Response.json({ key: await vapidPublicKey(a.db), subscribed: endpoint ? await hasPushSubscription(a.db, a.user.id, endpoint) : false });
}

const str = (v: unknown, max = 2000) => (typeof v === "string" && v.length <= max ? v : "");

/** Saves this phone's subscription: `{ endpoint, keys: { p256dh, auth } }` (what the browser gives). */
export async function POST(req: Request) {
  const a = await inspApi();
  if ("res" in a) return a.res;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const keys = (b.keys ?? {}) as Record<string, unknown>;
  const endpoint = str(b.endpoint), p256dh = str(keys.p256dh, 200), auth = str(keys.auth, 100);
  if (!/^https:\/\//.test(endpoint) || !p256dh || !auth) return err("Abonament invalid.");
  await savePushSubscription(a.db, a.user.id, { endpoint, p256dh, auth }, req.headers.get("user-agent"), "insp");
  return Response.json({ ok: true });
}

/** Removes this phone's subscription: `{ endpoint }`. */
export async function DELETE(req: Request) {
  const a = await inspApi();
  if ("res" in a) return a.res;
  const endpoint = str(((await req.json().catch(() => ({}))) as Record<string, unknown>).endpoint);
  if (endpoint) await removePushSubscription(a.db, a.user.id, endpoint);
  return Response.json({ ok: true });
}
