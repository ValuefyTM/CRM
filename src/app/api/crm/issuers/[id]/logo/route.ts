import { audit } from "@/lib/auth";
import { now } from "@/lib/db";
import { bucket } from "@/lib/orders";
import { err, staffApi } from "@/lib/api";

const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/svg+xml": "svg" };

async function firm(db: D1Database, id: string) {
  return db.prepare("SELECT id, name, logo_url FROM entities WHERE id = ? AND kind = 'valuation_firm'").bind(id).first<{ id: string; name: string; logo_url: string | null }>();
}

/** New logo of an issuing firm (its picture in the reports list): multipart `file`, PNG / JPG / WebP / SVG up to 1 MB. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await staffApi("settings.E", true);
  if ("res" in a) return a.res;
  const f = await firm(a.db, (await params).id);
  if (!f) return err("Firma nu există.", 404);
  const file = (await req.formData().catch(() => null))?.get("file");
  if (!(file instanceof File) || !file.size) return err("Alege o imagine.");
  const ext = EXT[file.type];
  if (!ext) return err("Logo-ul trebuie să fie PNG, JPG, WebP sau SVG.");
  if (file.size > 1024 * 1024) return err("Logo-ul depășește 1 MB.");
  const r2 = await bucket();
  if (!r2) return err("Stocarea fișierelor nu este disponibilă momentan.", 503);
  const key = `logos/${f.id}-${Date.now().toString(36)}.${ext}`;
  // Small file: sent whole (a stream of unknown length is refused by R2 in some setups).
  await r2.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type } });
  if (f.logo_url?.startsWith("r2:logos/")) await r2.delete(f.logo_url.slice(3)).catch(() => {});
  await a.db.prepare("UPDATE entities SET logo_url = ?, updated_at = ? WHERE id = ?").bind(`r2:${key}`, now(), f.id).run();
  await audit(a.db, `user:${a.user.id}`, "issuer.logo", "entity", f.id, f.name);
  return Response.json({ ok: true, src: `/api/crm/files/${key}` });
}

/** Removes the logo (the list shows the firm's initials instead). */
export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await staffApi("settings.E", true);
  if ("res" in a) return a.res;
  const f = await firm(a.db, (await params).id);
  if (!f) return err("Firma nu există.", 404);
  if (f.logo_url?.startsWith("r2:logos/")) await (await bucket())?.delete(f.logo_url.slice(3)).catch(() => {});
  await a.db.prepare("UPDATE entities SET logo_url = NULL, updated_at = ? WHERE id = ?").bind(now(), f.id).run();
  await audit(a.db, `user:${a.user.id}`, "issuer.logo_remove", "entity", f.id, f.name);
  return Response.json({ ok: true });
}
