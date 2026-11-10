import { portalApi } from "@/lib/api";
import { bucket } from "@/lib/orders";

/** A profile photo for the portal: the team's members (evaluators, inspectors, operators) and one's own. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await portalApi();
  if ("res" in a) return a.res;
  const id = (await params).id;
  const u = id === a.user.id ? { kind: a.user.kind } : await a.db.prepare("SELECT kind FROM users WHERE id = ? AND status <> 'deleted'").bind(id).first<{ kind: string }>();
  if (!u || (u.kind !== "internal" && id !== a.user.id)) return new Response("Nu există.", { status: 404 });
  const obj = await (await bucket())?.get(`avatars/${id}.jpg`);
  if (!obj) return new Response("Nu există.", { status: 404 });
  return new Response(obj.body, { headers: { "Content-Type": obj.httpMetadata?.contentType ?? "image/jpeg", "Cache-Control": "private, max-age=31536000, immutable" } });
}
