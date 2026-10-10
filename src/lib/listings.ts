// Server-only: the website's real-estate listings (valuefy.ro/imobiliare), stored in the shared D1 database.
// Moved here from the website's admin panel; the website only reads them (and serves the photos and share images).
import { photoUrl, slugify, type Listing } from "./listing-format";

type Row = {
  id: string; slug: string; title: string; type: string; city: string; zone: string; price: number;
  surface: number | null; land: number | null; rooms: number | null; baths: number | null; floor: string | null; year: number | null;
  status: string | null; features: string; description: string; report_date: string | null; published: number; updated_at: string;
  photo_ids: string | null; social_v: string | null; social_v_en: string | null;
  title_en: string | null; description_en: string | null; features_en: string | null;
};

const paragraphs = (text: string) => text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
const jsonList = (json: string | null) => {
  try {
    const v = JSON.parse(json ?? "[]") as unknown;
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
};

/** English texts, only the ones that are filled in (undefined when none are). */
function englishOf(r: Row): Listing["en"] {
  const title = r.title_en?.trim() || undefined;
  const description = r.description_en ? paragraphs(r.description_en) : [];
  const features = jsonList(r.features_en);
  if (!title && !description.length && !features.length) return undefined;
  return { title, description: description.length ? description : undefined, features: features.length ? features : undefined };
}

const SELECT = `SELECT l.*, (SELECT group_concat(id, ',') FROM (SELECT id FROM listing_photos p WHERE p.listing_id = l.id ORDER BY position, created_at)) AS photo_ids,
  (SELECT updated_at FROM listing_social s WHERE s.listing_id = l.id) AS social_v,
  (SELECT updated_at_en FROM listing_social s WHERE s.listing_id = l.id AND s.data_en IS NOT NULL) AS social_v_en FROM listings l`;

function toListing(r: Row): Listing {
  const photoIds = r.photo_ids ? r.photo_ids.split(",") : [];
  const features = jsonList(r.features);
  return {
    id: r.id, slug: r.slug, title: r.title, type: r.type, city: r.city, zone: r.zone, price: r.price,
    surface: r.surface ?? undefined, land: r.land ?? undefined, rooms: r.rooms ?? undefined, baths: r.baths ?? undefined,
    floor: r.floor ?? undefined, year: r.year ?? undefined, status: r.status ?? undefined, features,
    description: paragraphs(r.description),
    report: r.report_date ? { date: r.report_date } : undefined,
    published: r.published === 1, photoIds, photos: photoIds.map(photoUrl), updatedAt: r.updated_at,
    hasSocial: !!(r.social_v && r.social_v_en),
    en: englishOf(r),
  };
}

export async function listAll(db: D1Database): Promise<Listing[]> {
  const { results } = await db.prepare(`${SELECT} ORDER BY l.created_at DESC`).all<Row>();
  return results.map(toListing);
}

export async function getById(db: D1Database, id: string): Promise<Listing | null> {
  const r = await db.prepare(`${SELECT} WHERE l.id = ?`).bind(id).first<Row>();
  return r ? toListing(r) : null;
}

/** Fields accepted from the admin form. */
export type ListingInput = {
  title: string; type: string; city: string; zone?: string; price: number;
  surface?: number | null; land?: number | null; rooms?: number | null; baths?: number | null; floor?: string | null; year?: number | null;
  status?: string | null; features?: string[]; description?: string; report_date?: string | null; published?: boolean;
  /** English versions (empty = shown in Romanian on the English site). */
  title_en?: string; description_en?: string; features_en?: string[];
};

const clean = (v: unknown) => (v === "" || v === undefined ? null : v);

export function validateInput(body: unknown): { ok: true; value: ListingInput } | { ok: false; error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const str = (k: string, max = 300) => (typeof b[k] === "string" ? (b[k] as string).trim().slice(0, max) : "");
  const num = (k: string) => {
    const v = b[k];
    if (v === null || v === undefined || v === "") return null;
    const n = Number(String(v).replace(",", "."));
    return Number.isFinite(n) && n >= 0 ? n : NaN;
  };
  const title = str("title", 160), type = str("type", 40), city = str("city", 80);
  const price = num("price");
  if (!title) return { ok: false, error: "Titlul este obligatoriu." };
  if (!type) return { ok: false, error: "Alege tipul proprietății." };
  if (!city) return { ok: false, error: "Localitatea este obligatorie." };
  if (price === null || Number.isNaN(price) || price <= 0) return { ok: false, error: "Prețul trebuie să fie un număr mai mare ca 0." };
  const nums: Record<string, number | null> = {};
  for (const k of ["surface", "land", "rooms", "baths", "year"]) {
    const n = num(k);
    if (Number.isNaN(n)) return { ok: false, error: `Câmpul „${k}” trebuie să fie un număr.` };
    nums[k] = n;
  }
  const report = str("report_date", 7);
  if (report && !/^\d{4}-\d{2}$/.test(report)) return { ok: false, error: "Data raportului trebuie să fie de forma AAAA-LL." };
  const list = (k: string) => (Array.isArray(b[k]) ? (b[k] as unknown[]).map((x) => String(x).trim().slice(0, 80)).filter(Boolean).slice(0, 30) : []);
  const features = list("features");
  return {
    ok: true,
    value: {
      title, type, city, zone: str("zone", 120), price: Math.round(price),
      surface: nums.surface, land: nums.land, rooms: nums.rooms === null ? null : Math.round(nums.rooms), baths: nums.baths === null ? null : Math.round(nums.baths),
      year: nums.year === null ? null : Math.round(nums.year), floor: clean(str("floor", 40)) as string | null, status: clean(str("status", 20)) as string | null,
      features, description: str("description", 8000), report_date: report || null, published: b.published === true,
      title_en: str("title_en", 160), description_en: str("description_en", 8000), features_en: list("features_en"),
    },
  };
}

async function uniqueSlug(db: D1Database, title: string, city: string, exceptId?: string) {
  const base = slugify(`${title} ${city}`) || "proprietate";
  let slug = base;
  for (let i = 2; i < 50; i++) {
    const hit = await db.prepare("SELECT id FROM listings WHERE slug = ?").bind(slug).first<{ id: string }>();
    if (!hit || hit.id === exceptId) return slug;
    slug = `${base}-${i}`;
  }
  return `${base}-${crypto.randomUUID().slice(0, 6)}`;
}

const cols = (v: ListingInput) => [
  v.title, v.type, v.city, v.zone ?? "", v.price, v.surface ?? null, v.land ?? null, v.rooms ?? null, v.baths ?? null,
  v.floor ?? null, v.year ?? null, v.status ?? null, JSON.stringify(v.features ?? []), v.description ?? "", v.report_date ?? null, v.published ? 1 : 0,
  v.title_en || null, v.description_en || null, v.features_en?.length ? JSON.stringify(v.features_en) : null,
];

export async function createListing(db: D1Database, v: ListingInput): Promise<string> {
  const id = crypto.randomUUID();
  const slug = await uniqueSlug(db, v.title, v.city);
  await db
    .prepare(
      `INSERT INTO listings (id, slug, title, type, city, zone, price, surface, land, rooms, baths, floor, year, status, features, description, report_date, published,
       title_en, description_en, features_en)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, slug, ...cols(v))
    .run();
  return id;
}

export async function updateListing(db: D1Database, id: string, v: ListingInput): Promise<string> {
  const slug = await uniqueSlug(db, v.title, v.city, id);
  await db
    .prepare(
      `UPDATE listings SET slug = ?, title = ?, type = ?, city = ?, zone = ?, price = ?, surface = ?, land = ?, rooms = ?, baths = ?, floor = ?,
       year = ?, status = ?, features = ?, description = ?, report_date = ?, published = ?,
       title_en = ?, description_en = ?, features_en = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`,
    )
    .bind(slug, ...cols(v), id)
    .run();
  return slug;
}

export async function setPublished(db: D1Database, id: string, published: boolean) {
  await db.prepare("UPDATE listings SET published = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?").bind(published ? 1 : 0, id).run();
}

export async function deleteListing(db: D1Database, id: string) {
  await db.batch([
    db.prepare("DELETE FROM listing_photos WHERE listing_id = ?").bind(id),
    db.prepare("DELETE FROM listing_social WHERE listing_id = ?").bind(id),
    db.prepare("UPDATE listing_inquiries SET listing_id = NULL WHERE listing_id = ?").bind(id),
    db.prepare("DELETE FROM listings WHERE id = ?").bind(id),
  ]);
}

// ---------- photos ----------
export const MAX_PHOTO_BYTES = 1_800_000; // D1 value limit is 2 MB
export const PHOTO_TYPES = ["image/jpeg", "image/webp", "image/png"];

export async function addPhoto(db: D1Database, listingId: string, bytes: ArrayBuffer, contentType: string): Promise<string> {
  const id = crypto.randomUUID();
  const pos = await db.prepare("SELECT COALESCE(MAX(position), -1) + 1 AS p FROM listing_photos WHERE listing_id = ?").bind(listingId).first<{ p: number }>();
  await db
    .prepare("INSERT INTO listing_photos (id, listing_id, position, content_type, size_bytes, data) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(id, listingId, pos?.p ?? 0, contentType, bytes.byteLength, bytes)
    .run();
  return id;
}

export async function getPhoto(db: D1Database, id: string) {
  return db.prepare("SELECT content_type, data FROM listing_photos WHERE id = ?").bind(id).first<{ content_type: string; data: ArrayBuffer | number[] }>();
}

export async function deletePhoto(db: D1Database, id: string) {
  await db.prepare("DELETE FROM listing_photos WHERE id = ?").bind(id).run();
}

export async function reorderPhotos(db: D1Database, listingId: string, ids: string[]) {
  if (!ids.length) return;
  await db.batch(ids.map((pid, i) => db.prepare("UPDATE listing_photos SET position = ? WHERE id = ? AND listing_id = ?").bind(i, pid, listingId)));
}

// ---------- inquiries ----------
export type Inquiry = {
  id: number; listing_id: string | null; listing_title: string; kind: string; name: string; email: string | null; phone: string | null;
  reason: string | null; message: string | null; status: string; email_sent: number; created_at: string;
};

export async function listInquiries(db: D1Database, limit = 200): Promise<Inquiry[]> {
  const { results } = await db.prepare("SELECT * FROM listing_inquiries ORDER BY created_at DESC LIMIT ?").bind(limit).all<Inquiry>();
  return results;
}

/** Inquiries nobody has handled yet (badge in the menu). */
export async function countNewInquiries(db: D1Database): Promise<number> {
  const r = await db.prepare("SELECT COUNT(*) AS n FROM listing_inquiries WHERE status = 'NEW'").first<{ n: number }>().catch(() => null);
  return r?.n ?? 0;
}

export const INQUIRY_STATUSES = ["NEW", "SENT", "DONE"];

export async function setInquiryStatus(db: D1Database, id: number, status: string) {
  await db.prepare("UPDATE listing_inquiries SET status = ? WHERE id = ?").bind(status, id).run();
}

// ---------- share image ----------

export const MAX_SOCIAL_BYTES = 900_000;

export async function setSocialImage(db: D1Database, listingId: string, data: ArrayBuffer, contentType: string, lang: "ro" | "en" = "ro") {
  if (lang === "en") {
    // The English card is stored next to the Romanian one; create the row if needed.
    await db
      .prepare(
        `INSERT INTO listing_social (listing_id, content_type, data, updated_at, content_type_en, data_en, updated_at_en)
         VALUES (?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
         ON CONFLICT(listing_id) DO UPDATE SET content_type_en = excluded.content_type_en, data_en = excluded.data_en, updated_at_en = excluded.updated_at_en`,
      )
      .bind(listingId, contentType, data, contentType, data)
      .run();
    return;
  }
  await db
    .prepare(
      `INSERT INTO listing_social (listing_id, content_type, data, updated_at) VALUES (?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
       ON CONFLICT(listing_id) DO UPDATE SET content_type = excluded.content_type, data = excluded.data, updated_at = excluded.updated_at`,
    )
    .bind(listingId, contentType, data)
    .run();
}

// ---------- preview of drafts on the website ----------

const PREVIEW_DAYS = 7;

/** A link that shows the listing on valuefy.ro even when it is not published (valid 7 days, for whoever has it). */
export async function previewToken(db: D1Database, userId: string): Promise<string> {
  const token = Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(16).padStart(2, "0")).join("");
  const expires = new Date(Date.now() + PREVIEW_DAYS * 86400_000).toISOString();
  await db.batch([
    db.prepare("DELETE FROM listing_previews WHERE expires_at < ?").bind(new Date().toISOString()),
    db.prepare("INSERT INTO listing_previews (token, user_id, expires_at) VALUES (?, ?, ?)").bind(token, userId, expires),
  ]);
  return token;
}
