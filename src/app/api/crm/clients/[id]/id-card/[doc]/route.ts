import { audit } from "@/lib/auth";
import { err, staffApi } from "@/lib/api";
import { bucket } from "@/lib/orders";
import { inScope } from "@/lib/scope";
import { fileHeaders } from "@/lib/file-response";
import { deleteIdDoc, idDoc } from "@/lib/id-docs";

/** One photo of the identity card. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string; doc: string }> }) {
  const a = await staffApi("clients");
  if ("res" in a) return a.res;
  const { id, doc } = await params;
  if (!(await inScope(a.db, a.user, "clients", id))) return new Response("Nu există.", { status: 404 });
  const d = await idDoc(a.db, id, doc);
  const obj = d ? await (await bucket())?.get(d.r2_key) : null;
  if (!d || !obj) return new Response("Poza nu a fost găsită.", { status: 404 });
  return new Response(obj.body, { headers: fileHeaders(d.filename) });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string; doc: string }> }) {
  const a = await staffApi("clients.E", true);
  if ("res" in a) return a.res;
  const { id, doc } = await params;
  if (!(await inScope(a.db, a.user, "clients", id))) return err("Nu există.", 404);
  if (!(await deleteIdDoc(a.db, id, doc))) return err("Poza nu există.", 404);
  await audit(a.db, `user:${a.user.id}`, "client.id_card_delete", "client", id);
  return Response.json({ ok: true });
}
