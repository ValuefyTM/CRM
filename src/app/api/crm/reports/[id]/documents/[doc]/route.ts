import { staffApi } from "@/lib/api";
import { bucket } from "@/lib/orders";
import { fileHeaders } from "@/lib/file-response";

/** Opens a report document (inline for PDFs and images). */
export async function GET(_: Request, { params }: { params: Promise<{ id: string; doc: string }> }) {
  const a = await staffApi();
  if ("res" in a) return a.res;
  const { id, doc } = await params;
  const d = await a.db.prepare("SELECT filename, content_type, r2_key FROM report_documents WHERE id = ? AND report_id = ?").bind(doc, id)
    .first<{ filename: string; content_type: string | null; r2_key: string | null }>();
  const obj = d?.r2_key ? await (await bucket())?.get(d.r2_key) : null;
  if (!d || !obj) return new Response("Documentul nu a fost găsit.", { status: 404 });
  return new Response(obj.body, { headers: fileHeaders(d.filename) });
}
