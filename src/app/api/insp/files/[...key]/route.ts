import { bucket } from "@/lib/orders";
import { fileHeaders } from "@/lib/file-response";
import { canSeeFile, inspApi } from "@/lib/insp";

/** Photos and signatures of the user's inspections. */
export async function GET(_: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const a = await inspApi();
  if ("res" in a) return a.res;
  const key = (await params).key.join("/");
  if (!(await canSeeFile(a.db, a.user, key))) return new Response("Nu există.", { status: 404 });
  const obj = await (await bucket())?.get(key);
  if (!obj) return new Response("Fișierul nu a fost găsit.", { status: 404 });
  return new Response(obj.body, {
    headers: fileHeaders(key, "private, max-age=604800"),
  });
}
