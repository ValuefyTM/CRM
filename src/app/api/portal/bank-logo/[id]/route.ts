import { portalApi } from "@/lib/api";
import { bucket } from "@/lib/orders";

/** A bank's logo for the portal's order form (the CRM's file address is for the team only). */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await portalApi();
  if ("res" in a) return a.res;
  const e = await a.db.prepare("SELECT logo_url FROM entities WHERE id = ? AND kind IN ('bank', 'ifn')").bind((await params).id).first<{ logo_url: string | null }>();
  const v = e?.logo_url;
  if (!v || v.startsWith("lost:")) return new Response("Nu există.", { status: 404 });
  if (/^https?:\/\//.test(v)) return Response.redirect(v, 302);
  const obj = v.startsWith("r2:") ? await (await bucket())?.get(v.slice(3)) : null;
  if (!obj) return new Response("Nu există.", { status: 404 });
  return new Response(obj.body, { headers: { "Content-Type": obj.httpMetadata?.contentType ?? "image/png", "Cache-Control": "private, max-age=86400" } });
}
