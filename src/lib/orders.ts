// Server-only: valuation orders and their documents.
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { now, uuid } from "./db";
import { validEmail } from "./crypto";
import { AREA_FIELDS, BANKS, DOCS, MAX_FILE_MB, PROPERTY_TYPES, PURPOSES, type PropertyType } from "./order-labels";
import type { User } from "./users";
import { fileHeaders, fileType } from "./file-response";

export * from "./order-labels";

/** Fields of an order placed in the portal (all filled in); orders from banks, collaborations or Glide may leave them empty. */
type PortalFields = {
  property_type: PropertyType; city: string; address: string; surface_area: number | null; land_area: number | null; rooms: number | null;
  purpose: string; bank: string | null; urgent: number;
  client_name: string; client_phone: string; client_email: string | null;
  contact_name: string | null; contact_phone: string | null; inspection_notes: string | null; may_contact_client: number; notes: string | null;
};
type Nullable<T> = { [K in keyof T]: T[K] | null };

export type Order = Nullable<Pick<PortalFields, "property_type" | "city" | "address" | "purpose" | "client_name" | "client_phone">> &
  Omit<PortalFields, "property_type" | "city" | "address" | "purpose" | "client_name" | "client_phone"> & {
  id: string; seq: number | null; source: "partner" | "client" | "bank" | "collab" | "site" | "direct"; lead_id: string | null; created_by: string | null; partner_id: string | null;
  status: string; docs_missing: number; viewed_at: string | null; viewed_by: string | null; created_at: string; updated_at: string;
  // bank / collaboration / Glide orders
  glide_id: string | null; contract_id: string | null; collaboration_id: string | null; client_id: string | null; bank_id: string | null;
  bank_branch: string | null; bank_ref: string | null; report_type: string | null; fee: number | null; share: number | null; fee_net: number | null;
  referral_order_id: string | null; ordered_on: string | null; intake: string | null; bank_link: string | null; processed_at: string | null;
  assets_json: string | null; reports_json: string | null; statement_id: string | null;
  // joined
  creator_name: string | null; creator_email: string | null; partner_name: string | null; doc_count: number;
  collab_firm: string | null; contract_number: string | null; contract_kind: string | null;
};

export type OrderDocument = {
  id: string; order_id: string; kind: string; filename: string; content_type: string | null; size_bytes: number; r2_key: string; uploaded_by: string; created_at: string;
  uploader_name: string | null; uploader_kind: string | null;
};

const SELECT = `SELECT o.*, u.name AS creator_name, u.email AS creator_email, p.name AS partner_name,
  (SELECT COUNT(*) FROM order_documents d WHERE d.order_id = o.id) AS doc_count,
  (SELECT e.name FROM collaborations c JOIN entities e ON e.id = c.firm_id WHERE c.id = o.collaboration_id) AS collab_firm,
  k.number AS contract_number, k.kind AS contract_kind, (SELECT x.lead_id FROM order_leads x WHERE x.order_id = o.id) AS lead_id
  FROM orders o LEFT JOIN users u ON u.id = o.created_by LEFT JOIN partners p ON p.id = o.partner_id LEFT JOIN contracts k ON k.id = o.contract_id`;

// ---------- validation ----------

export type OrderInput = PortalFields;

const str = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const num = (v: unknown) => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 && n < 1e7 ? Math.round(n * 100) / 100 : null;
};
const digits = (s: string) => s.replace(/\D/g, "").length;

/** Same rules as the wizard (design handoff § Validări). Clients order for themselves, so their contact data come from the account. */
export function validateOrder(body: unknown, user: User): { ok: true; value: OrderInput } | { ok: false; error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const type = str(b.property_type, 20) as PropertyType;
  if (!PROPERTY_TYPES.some(([k]) => k === type)) return { ok: false, error: "Alege tipul proprietății." };
  const city = str(b.city, 80);
  const address = str(b.address, 240);
  if (!city || !address) return { ok: false, error: "Completează localitatea și adresa proprietății." };
  const purpose = str(b.purpose, 60);
  if (!(PURPOSES as readonly string[]).includes(purpose)) return { ok: false, error: "Alege scopul evaluării." };
  const bank = purpose === "Credit bancar" ? str(b.bank, 60) : "";
  if (bank && !(BANKS as readonly string[]).includes(bank)) return { ok: false, error: "Alege banca din listă." };

  const self = user.kind === "client";
  const client_name = self ? user.company || user.name : str(b.client_name, 120);
  const client_phone = str(self ? b.client_phone || user.phone : b.client_phone, 40);
  const client_email = self ? user.email : str(b.client_email, 160) || null;
  if (!client_name) return { ok: false, error: "Completează numele clientului." };
  if (digits(client_phone) < 9) return { ok: false, error: "Numărul de telefon al clientului pare incomplet." };
  if (client_email && !validEmail(client_email)) return { ok: false, error: "Adresa de email a clientului nu pare validă." };

  const other = b.other_contact === true;
  const contact_name = other ? str(b.contact_name, 120) : "";
  const contact_phone = other ? str(b.contact_phone, 40) : "";
  if (other && (!contact_name || digits(contact_phone) < 9)) return { ok: false, error: "Completează numele și telefonul persoanei de contact la inspecție." };

  const area = AREA_FIELDS[type];
  return {
    ok: true,
    value: {
      property_type: type, city, address,
      surface_area: area.surface ? num(b.surface_area) : null,
      land_area: area.land ? num(b.land_area) : null,
      rooms: area.rooms ? (num(b.rooms) ? Math.round(num(b.rooms)!) : null) : null,
      purpose, bank: bank || null, urgent: b.urgent === true ? 1 : 0,
      client_name, client_phone, client_email,
      contact_name: contact_name || null, contact_phone: contact_phone || null,
      inspection_notes: str(b.inspection_notes, 2000) || null,
      may_contact_client: b.may_contact_client === false ? 0 : 1,
      notes: str(b.notes, 4000) || null,
    },
  };
}

// ---------- read / write ----------

export async function createOrder(db: D1Database, user: User, v: OrderInput) {
  const id = uuid();
  // Sequential reference (CO-1001, CO-1002…); retry if two orders race for the same number.
  for (let attempt = 0; attempt < 5; attempt++) {
    const next = ((await db.prepare("SELECT MAX(seq) AS m FROM orders").first<{ m: number | null }>())?.m ?? 1000) + 1;
    try {
      await db
        .prepare(
          `INSERT INTO orders (id, seq, source, created_by, partner_id, property_type, city, address, surface_area, land_area, rooms, purpose, bank, urgent,
            client_name, client_phone, client_email, contact_name, contact_phone, inspection_notes, may_contact_client, notes, docs_missing, client_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
        )
        .bind(
          id, next, user.kind === "partner" ? "partner" : "client", user.id, user.kind === "partner" ? user.partner_id : null,
          v.property_type, v.city, v.address, v.surface_area, v.land_area, v.rooms, v.purpose, v.bank, v.urgent,
          v.client_name, v.client_phone, v.client_email, v.contact_name, v.contact_phone, v.inspection_notes, v.may_contact_client, v.notes,
          user.kind === "client" ? user.entity_id ?? null : null,
        )
        .run();
      return { id, seq: next };
    } catch (e) {
      if (!String(e).includes("UNIQUE")) throw e;
    }
  }
  throw new Error("Nu am putut numerota comanda.");
}

export async function getOrder(db: D1Database, id: string) {
  return db.prepare(`${SELECT} WHERE o.id = ?`).bind(id).first<Order>();
}

/** Orders a portal user may see: every order of their firm (partners) or their own (clients). */
export const canSee = (user: User, o: Pick<Order, "created_by" | "partner_id">) =>
  user.kind === "partner" ? !!user.partner_id && o.partner_id === user.partner_id : o.created_by === user.id;

export async function ordersFor(db: D1Database, user: User) {
  const q = user.kind === "partner" ? `${SELECT} WHERE o.partner_id = ? ORDER BY o.created_at DESC` : `${SELECT} WHERE o.created_by = ? ORDER BY o.created_at DESC`;
  const { results } = await db.prepare(q).bind(user.kind === "partner" ? user.partner_id : user.id).all<Order>();
  return results;
}

export async function allOrders(db: D1Database) {
  const { results } = await db.prepare(`${SELECT} ORDER BY o.created_at DESC LIMIT 10000`).all<Order>();
  return results;
}

export async function orderDocuments(db: D1Database, orderId: string) {
  const { results } = await db
    .prepare(
      `SELECT d.*, u.name AS uploader_name, u.kind AS uploader_kind FROM order_documents d LEFT JOIN users u ON u.id = d.uploaded_by
       WHERE d.order_id = ? ORDER BY d.created_at`,
    )
    .bind(orderId)
    .all<OrderDocument>();
  return results;
}

/** Required documents still missing, by label. */
export function missingDocs(type: PropertyType | null, docs: Pick<OrderDocument, "kind">[]) {
  if (!type) return [];
  const have = new Set(docs.map((d) => d.kind));
  return DOCS[type].filter((d) => !d.optional && !have.has(d.key));
}

// ---------- files (R2) ----------

export async function bucket(): Promise<R2Bucket | null> {
  try {
    const { env } = await getCloudflareContext({ async: true });
    return (env as { FILES?: R2Bucket }).FILES ?? null;
  } catch {
    return null;
  }
}

const OK_EXT = /\.(pdf|jpe?g|png|heic|heif|webp|docx?)$/i;

/** Stores one uploaded file for an order and updates the "documents missing" flag. */
export async function addDocument(db: D1Database, order: { id: string; seq: number | null; property_type: PropertyType }, file: File, kind: string, userId: string) {
  const r2 = await bucket();
  if (!r2) return { ok: false as const, error: "Încărcarea documentelor nu este disponibilă momentan. Trimite-le pe email la contact@valuefy.ro." };
  if (!file.size) return { ok: false as const, error: "Fișierul este gol." };
  if (file.size > MAX_FILE_MB * 1024 * 1024) return { ok: false as const, error: `Fișierul „${file.name}” depășește ${MAX_FILE_MB} MB.` };
  // The extension decides (the type a browser claims is not trusted): it is also what the file is served as.
  if (!OK_EXT.test(file.name)) return { ok: false as const, error: `„${file.name}”: acceptăm PDF, imagini (JPG, PNG, HEIC) și Word.` };
  const validKind = kind === "other" || DOCS[order.property_type].some((d) => d.key === kind) ? kind : "other";
  const id = uuid();
  const safeName = file.name.replace(/[^\w.\-() ăâîșțĂÂÎȘȚ]/g, "_").slice(-120) || "document";
  const key = `orders/${order.id}/${id}-${safeName}`;
  await r2.put(key, file.stream(), { httpMetadata: { contentType: fileType(safeName) }, customMetadata: { order: `CO-${order.seq}`, kind: validKind } });
  await db
    .prepare("INSERT INTO order_documents (id, order_id, kind, filename, content_type, size_bytes, r2_key, uploaded_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(id, order.id, validKind, safeName, fileType(safeName), file.size, key, userId)
    .run();
  const missing = missingDocs(order.property_type, await orderDocuments(db, order.id)).length > 0;
  await db.prepare("UPDATE orders SET docs_missing = ?, updated_at = ? WHERE id = ?").bind(missing ? 1 : 0, now(), order.id).run();
  return { ok: true as const, id, docsMissing: missing };
}

/** Streams a stored document back (inline for PDFs and images, so they open in the browser). */
export async function documentResponse(doc: OrderDocument) {
  const r2 = await bucket();
  const obj = r2 ? await r2.get(doc.r2_key) : null;
  if (!obj) return new Response("Documentul nu a fost găsit.", { status: 404 });
  return new Response(obj.body, { headers: fileHeaders(doc.filename) });
}

export const fmtSize = (b: number) => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1).replace(".", ",")} MB`);

/**
 * Deletes an order that has not become work yet: no report opened from it, no accepted offer, not on a statement.
 * Its documents (and their files), offers and links go with it; bank emails and inspections only lose the link.
 */
export async function deleteOrder(db: D1Database, actor: string, id: string) {
  const o = await db.prepare(`SELECT o.id, o.seq, o.source, o.client_name, o.bank_ref, o.statement_id,
      (SELECT COUNT(*) FROM reports r WHERE r.order_id = o.id) AS reports,
      (SELECT COUNT(*) FROM offers f WHERE f.order_id = o.id AND f.status = 'accepted') AS accepted
    FROM orders o WHERE o.id = ?`).bind(id)
    .first<{ id: string; seq: number | null; source: string; client_name: string | null; bank_ref: string | null; statement_id: string | null; reports: number; accepted: number }>();
  if (!o) return { ok: false as const, error: "Comanda nu există." };
  if (o.reports) return { ok: false as const, error: "Comanda are deja raport creat. Anulează sau șterge întâi raportul (sau marchează comanda ca anulată)." };
  if (o.accepted) return { ok: false as const, error: "Clientul a acceptat oferta acestei comenzi: nu se mai poate șterge, doar anula." };
  if (o.statement_id) return { ok: false as const, error: "Comanda este pe un borderou și nu se poate șterge." };
  const files = (await db.prepare("SELECT r2_key FROM order_documents WHERE order_id = ? AND r2_key IS NOT NULL").bind(id).all<{ r2_key: string }>()).results;
  await db.batch([
    db.prepare("UPDATE bank_emails SET order_id = NULL WHERE order_id = ?").bind(id),
    db.prepare("UPDATE inspections SET order_id = NULL WHERE order_id = ?").bind(id),
    db.prepare("DELETE FROM order_leads WHERE order_id = ?").bind(id),
    db.prepare("DELETE FROM offers WHERE order_id = ?").bind(id),
    db.prepare("DELETE FROM order_documents WHERE order_id = ?").bind(id),
    db.prepare("DELETE FROM orders WHERE id = ?").bind(id),
  ]);
  const r2 = files.length ? await bucket() : null;
  if (r2) await r2.delete(files.map((f) => f.r2_key)).catch(() => {});
  const ref = o.seq ? `CO-${o.seq}` : o.bank_ref ?? id.slice(0, 8);
  await db.prepare("INSERT INTO audit_log (actor, action, entity, entity_id, details) VALUES (?, 'order.delete', 'order', ?, ?)")
    .bind(actor, id, `${ref}${o.client_name ? ` · ${o.client_name}` : ""} · ${o.source}`).run().catch(() => null);
  return { ok: true as const, source: o.source };
}
