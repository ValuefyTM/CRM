import { err, staffApi } from "@/lib/api";
import { addDoc, isExpert } from "@/lib/expert-cases";

/** Upload into a folder of the case: multipart `folder`, `file` (one or more). A same-named file becomes the new version. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await staffApi("any", true);
  if ("res" in a) return a.res;
  if (!isExpert(a.user)) return err("Modulul este doar pentru experții judiciari.", 403);
  const form = await req.formData().catch(() => null);
  const folder = String(form?.get("folder") ?? "");
  const files = (form?.getAll("file") ?? []).filter((f): f is File => f instanceof File);
  if (!files.length) return err("Niciun fișier.", 400);
  const { id } = await params;
  const done: string[] = [], errors: string[] = [];
  for (const f of files.slice(0, 30)) {
    const r = await addDoc(a.db, a.user.id, id, folder, f);
    if (r.ok) done.push(f.name); else errors.push(r.error);
  }
  return done.length ? Response.json({ ok: true, done: done.length, errors }) : err(errors[0] ?? "Nu am putut încărca.", 400);
}
