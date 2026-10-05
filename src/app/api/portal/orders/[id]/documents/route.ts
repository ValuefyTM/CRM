import { NextResponse } from "next/server";
import { audit } from "@/lib/auth";
import { addDocument, canSee, getOrder } from "@/lib/orders";
import { err, portalApi } from "@/lib/api";

/** Upload one document to an order (multipart: file + kind). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await portalApi();
  if ("res" in a) return a.res;
  const { id } = await params;
  const o = await getOrder(a.db, id);
  if (!o || !canSee(a.user, o)) return err("Comanda nu există.", 404);
  if (!o.property_type) return err("Comanda nu acceptă documente din portal.");
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return err("Alege un fișier.");
  const r = await addDocument(a.db, { id: o.id, seq: o.seq, property_type: o.property_type }, file, String(form?.get("kind") ?? "other"), a.user.id);
  if (!r.ok) return err(r.error);
  await audit(a.db, `user:${a.user.id}`, "order.document", "order", o.id, file.name);
  return NextResponse.json({ ok: true, id: r.id, docsMissing: r.docsMissing });
}
