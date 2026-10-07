import { bucket } from "@/lib/orders";
import { inspApi, myInspection } from "@/lib/insp";
import { assetDocs } from "@/lib/insp-docs";

/** One CF extract / floor survey of an inspection given to the user (files still in Glide are passed through). */
export async function GET(_: Request, { params }: { params: Promise<{ id: string; ref: string }> }) {
  const a = await inspApi();
  if ("res" in a) return a.res;
  const { id, ref } = await params;
  const ins = await myInspection(a.db, a.user, id);
  if (!ins?.report_id || !ins.asset_id) return new Response("Nu există.", { status: 404 });
  const assets = [ins.asset_id];
  if (ins.hosted.length) {
    const h = await a.db.prepare(`SELECT asset_id FROM inspections WHERE id IN (${ins.hosted.map(() => "?").join(", ")})`).bind(...ins.hosted.map((x) => x.id)).all<{ asset_id: string | null }>();
    assets.push(...h.results.map((x) => x.asset_id).filter((x): x is string => !!x));
  }
  const doc = (await assetDocs(a.db, ins.report_id, assets)).find((d) => d.ref === decodeURIComponent(ref));
  if (!doc) return new Response("Nu există.", { status: 404 });
  const headers = (type: string | null) => ({
    "Content-Type": type || "application/octet-stream", "Cache-Control": "private, max-age=604800", "X-Content-Type-Options": "nosniff",
    "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(doc.name)}`,
  });
  if (doc.key) {
    const obj = await (await bucket())?.get(doc.key);
    if (!obj) return new Response("Fișierul nu a fost găsit.", { status: 404 });
    return new Response(obj.body, { headers: headers(obj.httpMetadata?.contentType ?? doc.content_type) });
  }
  const res = doc.url ? await fetch(doc.url).catch(() => null) : null;
  if (!res?.ok || !res.body) return new Response("Fișierul nu a putut fi adus.", { status: 502 });
  return new Response(res.body, { headers: headers((res.headers.get("content-type") ?? doc.content_type ?? "").split(";")[0] || null) });
}
