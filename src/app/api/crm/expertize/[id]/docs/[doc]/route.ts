import { err, staffApi } from "@/lib/api";
import { docFile, isExpert } from "@/lib/expert-cases";
import { fileHeaders } from "@/lib/file-response";

/** A file of the case, for its expert only. `?dl=1` downloads it. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string; doc: string }> }) {
  const a = await staffApi("any");
  if ("res" in a) return a.res;
  if (!isExpert(a.user)) return err("Nu ai acces.", 403);
  const { id, doc } = await params;
  const f = await docFile(a.db, a.user.id, id, doc);
  if (!f) return err("Fișierul nu există.", 404);
  return new Response(f.body, { headers: fileHeaders(f.name, "private, no-store", new URL(req.url).searchParams.has("dl") ? f.name : undefined) });
}
