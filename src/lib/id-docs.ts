// Server-only: the identity card kept at the client — its photos (R2) and what was read from it (CNP, address).
import { now, uuid } from "./db";
import { bucket } from "./orders";
import { validCnp } from "./id-card";

export type IdDoc = { id: string; filename: string; content_type: string | null; size_bytes: number | null; created_at: string; uploaded_by: string | null };

const str = (v: unknown, max = 120) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : "");

/** What the browser read (and the user checked): only known fields, trimmed; a CNP only when it is valid. */
export function cleanCard(v: unknown) {
  const b = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const cnp = str(b.cnp, 13).replace(/\D/g, "");
  const expires = str(b.expires, 10);
  return {
    cnp: validCnp(cnp) ? cnp : "", series: str(b.series, 4).toUpperCase(), number: str(b.number, 10).replace(/\D/g, ""), expires: /^\d{4}-\d{2}-\d{2}$/.test(expires) ? expires : "",
    street: str(b.street), addr_number: str(b.addr_number, 20), block: str(b.block, 20), stair: str(b.stair, 20), floor: str(b.floor, 20), apartment: str(b.apartment, 20),
    city: str(b.city, 80), county: str(b.county, 60), address: str(b.address, 240),
  };
}
export type CleanCard = ReturnType<typeof cleanCard>;

/** Saves the card on the client: what was read replaces what the card says (CNP, series, address), the rest stays. */
export async function saveIdCard(db: D1Database, entityId: string, c: CleanCard) {
  const hasAddr = !!(c.street || c.city);
  await db.prepare(`UPDATE entities SET cnp = COALESCE(NULLIF(?1, ''), cnp), id_series = COALESCE(NULLIF(?2, ''), id_series), id_number = COALESCE(NULLIF(?3, ''), id_number),
      id_expires = COALESCE(NULLIF(?4, ''), id_expires),
      addr_street = CASE WHEN ?14 THEN NULLIF(?5, '') ELSE addr_street END, addr_number = CASE WHEN ?14 THEN NULLIF(?6, '') ELSE addr_number END,
      addr_block = CASE WHEN ?14 THEN NULLIF(?7, '') ELSE addr_block END, addr_stair = CASE WHEN ?14 THEN NULLIF(?8, '') ELSE addr_stair END,
      addr_floor = CASE WHEN ?14 THEN NULLIF(?9, '') ELSE addr_floor END, addr_apartment = CASE WHEN ?14 THEN NULLIF(?10, '') ELSE addr_apartment END,
      city = COALESCE(NULLIF(?11, ''), city), county = COALESCE(NULLIF(?12, ''), county), billing_address = COALESCE(NULLIF(?13, ''), billing_address), updated_at = ?15
    WHERE id = ?16`)
    .bind(c.cnp, c.series, c.number, c.expires, c.street, c.addr_number, c.block, c.stair, c.floor, c.apartment, c.city, c.county, c.address, hasAddr ? 1 : 0, now(), entityId).run();
}

const IMG = /^(image\/(jpeg|png|webp)|application\/pdf)$/;
export const MAX_ID_PHOTOS = 4;

/** One photo of the card (front / back), kept at the client. */
export async function addIdPhoto(db: D1Database, entityId: string, file: File, actor: string) {
  const r2 = await bucket();
  if (!r2) return { ok: false as const, error: "Stocarea fișierelor nu este disponibilă momentan." };
  if (!IMG.test(file.type) || !file.size || file.size > 15 * 1024 * 1024) return { ok: false as const, error: "CI-ul trebuie să fie o poză (JPG, PNG, WebP) sau un PDF, de cel mult 15 MB." };
  const n = await db.prepare("SELECT COUNT(*) AS n FROM entity_documents WHERE entity_id = ? AND kind = 'id_card'").bind(entityId).first<{ n: number }>();
  // a new card replaces the oldest photos beyond the limit
  if ((n?.n ?? 0) >= MAX_ID_PHOTOS) {
    const { results } = await db.prepare("SELECT id, r2_key FROM entity_documents WHERE entity_id = ? AND kind = 'id_card' ORDER BY created_at LIMIT ?")
      .bind(entityId, (n?.n ?? 0) - MAX_ID_PHOTOS + 1).all<{ id: string; r2_key: string }>();
    for (const x of results) { await r2.delete(x.r2_key).catch(() => {}); await db.prepare("DELETE FROM entity_documents WHERE id = ?").bind(x.id).run(); }
  }
  const id = uuid();
  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : file.type === "application/pdf" ? "pdf" : "jpg";
  const name = `CI-${new Date().toISOString().slice(0, 10)}-${id.slice(0, 6)}.${ext}`;
  const key = `clients/${entityId}/id/${id}.${ext}`;
  await r2.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type }, customMetadata: { client: entityId, kind: "id_card" } });
  await db.prepare("INSERT INTO entity_documents (id, entity_id, kind, filename, r2_key, content_type, size_bytes, uploaded_by) VALUES (?, ?, 'id_card', ?, ?, ?, ?, ?)")
    .bind(id, entityId, name, key, file.type, file.size, actor).run();
  return { ok: true as const, id };
}

export async function idDocs(db: D1Database, entityId: string) {
  return (await db.prepare(`SELECT d.id, d.filename, d.content_type, d.size_bytes, d.created_at, u.name AS uploaded_by FROM entity_documents d
      LEFT JOIN users u ON u.id = d.uploaded_by WHERE d.entity_id = ? AND d.kind = 'id_card' ORDER BY d.created_at DESC`).bind(entityId).all<IdDoc>()).results;
}

export async function idDoc(db: D1Database, entityId: string, docId: string) {
  return db.prepare("SELECT * FROM entity_documents WHERE id = ? AND entity_id = ?").bind(docId, entityId).first<IdDoc & { r2_key: string }>();
}

export async function deleteIdDoc(db: D1Database, entityId: string, docId: string) {
  const d = await idDoc(db, entityId, docId);
  if (!d) return false;
  const r2 = await bucket();
  await r2?.delete(d.r2_key).catch(() => {});
  await db.prepare("DELETE FROM entity_documents WHERE id = ?").bind(docId).run();
  return true;
}
