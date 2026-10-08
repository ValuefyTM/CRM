import { getDb } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { bucket } from "@/lib/orders";
import { fileHeaders } from "@/lib/file-response";

/** Files moved from Glide (photos, logos) and inspection photos / signatures, for the team only. */
export async function GET(_: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const db = await getDb();
  if (!db || !(await currentUser(db, "crm"))) return new Response("Autentifică-te din nou.", { status: 401 });
  const key = (await params).key.join("/");
  if (!key.startsWith("glide/") && !key.startsWith("inspectii/")) return new Response("Nu există.", { status: 404 });
  const obj = await (await bucket())?.get(key);
  if (!obj) return new Response("Fișierul nu a fost găsit.", { status: 404 });
  return new Response(obj.body, {
    headers: fileHeaders(key, "private, max-age=86400"),
  });
}
