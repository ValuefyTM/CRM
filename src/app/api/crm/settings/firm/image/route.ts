import { err, staffApi } from "@/lib/api";
import { saveFirmImage } from "@/lib/settings";

/** Replaces the stamp or the signature (multipart: `which`, `file`); DELETE ?which= goes back to the model's image. */
export async function POST(req: Request) {
  const a = await staffApi("admin");
  if ("res" in a) return a.res;
  const form = await req.formData().catch(() => null);
  const which = form?.get("which");
  const file = form?.get("file");
  if (which !== "stamp" && which !== "signature") return err("Alege ștampila sau semnătura.");
  if (!(file instanceof File)) return err("Alege fișierul.");
  const r = await saveFirmImage(a.db, a.user.id, which, file);
  if (!r.ok) return err(r.error);
  return Response.json({ ok: true });
}

export async function DELETE(req: Request) {
  const a = await staffApi("admin");
  if ("res" in a) return a.res;
  const which = new URL(req.url).searchParams.get("which");
  if (which !== "stamp" && which !== "signature") return err("Alege ștampila sau semnătura.");
  const r = await saveFirmImage(a.db, a.user.id, which, null);
  if (!r.ok) return err(r.error);
  return Response.json({ ok: true });
}
