import { staffApi } from "@/lib/api";
import { fileHeaders } from "@/lib/file-response";
import { marketBucket } from "@/lib/market/env";

/** Photos (imagini/…) and saved page sources (surse/…, json.gz) of the market listings, for the team only. */
export async function GET(_: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const a = await staffApi("market");
  if ("res" in a) return new Response("Autentifică-te din nou.", { status: 401 });
  const key = (await params).key.join("/");
  if (!key.startsWith("imagini/") && !key.startsWith("surse/")) return new Response("Nu există.", { status: 404 });
  const obj = await (await marketBucket())?.get(key);
  if (!obj) return new Response("Fișierul nu a fost găsit.", { status: 404 });
  if (key.startsWith("surse/"))
    return new Response(obj.body, { headers: { "Content-Type": "application/gzip", "Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(key.split("/").slice(1).join("_"))}` } });
  return new Response(obj.body, { headers: fileHeaders(key, "private, max-age=31536000, immutable") });
}
