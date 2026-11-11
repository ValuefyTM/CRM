import { reportApi } from "@/lib/api";
import { docVersions } from "@/lib/doc-folders";

/** The earlier versions of a document (newest first). */
export async function GET(_: Request, { params }: { params: Promise<{ id: string; doc: string }> }) {
  const { id, doc } = await params;
  const a = await reportApi(id, "view");
  if ("res" in a) return a.res;
  return Response.json({ versions: await docVersions(a.db, id, doc) });
}
