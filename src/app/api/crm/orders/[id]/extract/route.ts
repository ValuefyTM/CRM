import { audit } from "@/lib/auth";
import { uuid } from "@/lib/db";
import { err, staffApi } from "@/lib/api";
import { bucket, getOrder } from "@/lib/orders";
import { extractEnabled, extractFromScreens } from "@/lib/extract";

const MAX = 4, MAX_MB = 5;
const TYPES = /^image\/(png|jpeg|webp|gif)$/;

/**
 * Screenshots of the bank's app for a bank order (multipart "files", up to 4 images): kept with the order's
 * documents, then read with Claude to pre-fill the processing form.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await staffApi();
  if ("res" in a) return a.res;
  const { id } = await params;
  const o = await getOrder(a.db, id);
  if (!o) return err("Comanda nu există.", 404);
  const form = await req.formData().catch(() => null);
  const files = (form?.getAll("files") ?? []).filter((f): f is File => f instanceof File && f.size > 0).slice(0, MAX);
  if (!files.length) return err("Adaugă cel puțin o captură (PNG sau JPG).");
  for (const f of files) {
    if (!TYPES.test(f.type)) return err(`„${f.name}” nu este o imagine PNG / JPG.`);
    if (f.size > MAX_MB * 1024 * 1024) return err(`„${f.name}” depășește ${MAX_MB} MB.`);
  }
  const images = await Promise.all(files.map(async (f) => ({ data: await f.arrayBuffer(), type: f.type, name: f.name || "captura.png" })));

  // Keep the screenshots with the order (documents), whatever the reading gives.
  const r2 = await bucket();
  if (r2) {
    for (const img of images) {
      const doc = uuid();
      const name = img.name.replace(/[^\w.\-() ]/g, "_").slice(-100);
      const key = `orders/${o.id}/${doc}-${name}`;
      await r2.put(key, img.data, { httpMetadata: { contentType: img.type }, customMetadata: { kind: "bank_screen" } });
      await a.db.prepare("INSERT INTO order_documents (id, order_id, kind, filename, content_type, size_bytes, r2_key, uploaded_by) VALUES (?, ?, 'bank_screen', ?, ?, ?, ?, ?)")
        .bind(doc, o.id, name, img.type, img.data.byteLength, key, a.user.id).run();
    }
  }
  // Without the reading set up, the screenshots are only kept (the form is filled in by hand).
  if (!extractEnabled()) return Response.json({ ok: true, data: null, stored: images.length });
  const r = await extractFromScreens(images, { bank: o.bank, ref: o.bank_ref, client: o.client_name });
  await audit(a.db, `user:${a.user.id}`, "order.extract", "order", o.id, `${images.length} capturi${r.ok ? "" : " · necitite"}`);
  return r.ok ? Response.json({ ok: true, data: r.data }) : err(r.error, 422);
}
