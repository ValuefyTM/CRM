import { reportApi } from "@/lib/api";
import { bucket } from "@/lib/orders";
import { fileHeaders } from "@/lib/file-response";

/** Opens a report document (inline for PDFs and images), or with `?v=` one of its earlier versions. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string; doc: string }> }) {
  const { id, doc } = await params;
  const a = await reportApi(id, "view");
  if ("res" in a) return a.res;
  // `?v=<version id>`: an earlier version of it
  const v = new URL(req.url).searchParams.get("v");
  const d = v
    ? await a.db.prepare("SELECT filename, content_type, r2_key FROM report_document_versions WHERE id = ? AND doc_id = ? AND report_id = ?").bind(v, doc, id)
      .first<{ filename: string; content_type: string | null; r2_key: string | null }>()
    : await a.db.prepare("SELECT filename, content_type, r2_key FROM report_documents WHERE id = ? AND report_id = ?").bind(doc, id)
      .first<{ filename: string; content_type: string | null; r2_key: string | null }>();
  const obj = d?.r2_key ? await (await bucket())?.get(d.r2_key) : null;
  if (!d || !obj) return new Response("Documentul nu a fost găsit.", { status: 404 });
  return new Response(obj.body, { headers: fileHeaders(d.filename) });
}
