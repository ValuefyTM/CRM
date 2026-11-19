import { err, staffApi } from "@/lib/api";
import { isExpert } from "@/lib/expert-cases";
import { readAppointment } from "@/lib/expert-read";

/** Multipart `file` (PDF): the appointment decision read into the fields of a new case. Nothing is saved. */
export async function POST(req: Request) {
  const a = await staffApi("any", true);
  if ("res" in a) return a.res;
  if (!isExpert(a.user)) return err("Modulul este doar pentru experții judiciari.", 403);
  const f = (await req.formData().catch(() => null))?.get("file");
  if (!(f instanceof File) || !f.size) return err("Alege încheierea, ca PDF.", 400);
  if (!/\.pdf$/i.test(f.name) && f.type !== "application/pdf") return err("Citirea automată merge doar pe PDF.", 400);
  const r = await readAppointment(await f.arrayBuffer());
  return r.ok ? Response.json(r.data) : err(r.error, 502);
}
