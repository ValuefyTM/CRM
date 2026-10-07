// Server-only: data of the inspections app (inspectii.valuefy.ro).
import { NextResponse } from "next/server";
import { getDb, now, uuid } from "./db";
import { currentUser, audit } from "./auth";
import { bucket } from "./orders";
import { err } from "./api";
import type { User } from "./users";
import {
  FEATURE_COLUMNS, FORM_VERSION, FORMS, PRESENT_ROLES, featureColumns, guessSheetType, type Answers, type SheetType,
} from "./insp-forms";

/** A signed-in inspector or evaluator. */
export async function inspApi(): Promise<{ db: D1Database; user: User } | { res: NextResponse }> {
  const db = await getDb();
  if (!db) return { res: err("Baza de date nu este disponibilă.", 503) };
  const user = await currentUser(db, "insp");
  if (!user) return { res: err("Sesiunea a expirat. Autentifică-te din nou.", 401) };
  return { db, user };
}

export type InspStatus = "to_schedule" | "scheduled" | "done" | "cancelled";

/** One inspection as the app shows it. Times of the visit are Bucharest local time "YYYY-MM-DDTHH:MM". */
export type Insp = {
  id: string; status: InspStatus; scheduled_at: string | null; done_at: string | null; duration_min: number | null;
  sheet_type: SheetType; property_label: string; address: string; city: string | null; county: string | null;
  lat: number | null; lng: number | null; cf_number: string | null; cad: string | null; usable_area: number | null; year_built: number | null;
  contact_kind: string | null; contact_name: string | null; contact_phone: string | null; notes: string | null;
  report_number: string | null; report_label: string | null; purpose: string | null; client: string | null; bank: string | null;
  reschedule_count: number; contact_notified_at: string | null; started_at: string | null;
  sheet_status: "draft" | "submitted" | null; updated_at: string | null;
  due_on: string | null; instructions: string | null; assigned_by_name: string | null;
};

type Row = Omit<Insp, "sheet_type" | "property_label" | "address" | "lat" | "lng" | "cad"> & {
  sheet_type: string | null; i_address: string | null; i_lat: number | null; i_lng: number | null;
  category: string | null; type: string | null; order_type: string | null; full_address: string | null; street_type: string | null; street: string | null;
  number: string | null; block: string | null; stair: string | null; floor: string | null; apartment: string | null; geo: string | null;
  cad_building: string | null; cad_land: string | null;
};

const SELECT = `SELECT i.id, i.status, i.scheduled_at, i.done_at, i.duration_min, i.sheet_type, i.address AS i_address, i.lat AS i_lat, i.lng AS i_lng,
    i.contact_kind, i.contact_name, i.contact_phone, i.notes, i.reschedule_count, i.contact_notified_at, i.started_at, i.updated_at,
    i.due_on, i.instructions, (SELECT COALESCE(NULLIF(x.name, ''), x.email) FROM users x WHERE x.id = i.assigned_by) AS assigned_by_name,
    p.category, p.type, p.full_address, p.street_type, p.street, p.number, p.block, p.stair, p.floor, p.apartment, p.city, p.county, p.geo,
    p.cf_number, p.cad_building, p.cad_land, p.usable_area, p.year_built,
    o.property_type AS order_type,
    r.number AS report_number, r.label AS report_label, r.purpose,
    c.name AS client, b.name AS bank,
    (SELECT s.status FROM inspection_sheets s WHERE s.inspection_id = i.id AND s.glide_id IS NULL) AS sheet_status
  FROM inspections i
  LEFT JOIN assets a ON a.id = i.asset_id
  LEFT JOIN crm_properties p ON p.id = a.property_id
  LEFT JOIN reports r ON r.id = i.report_id
  LEFT JOIN orders o ON o.id = COALESCE(i.order_id, r.order_id)
  LEFT JOIN entities c ON c.id = r.client_id
  LEFT JOIN entities b ON b.id = r.recipient_id`;

/**
 * Inspections of a user: assigned to them, or not assigned yet on a report they work on. Inspections imported from
 * Glide are history (finished reports) and never show in the app.
 */
const MINE = `i.glide_id IS NULL AND (i.inspector_id = ?1 OR (i.inspector_id IS NULL AND EXISTS (SELECT 1 FROM report_members m WHERE m.report_id = i.report_id AND m.user_id = ?1)))`;

/** Still to do (and the report is still open), or done in the last 45 days. */
const CURRENT = `((i.status IN ('to_schedule', 'scheduled') AND (r.id IS NULL OR r.status IN ('draft', 'in_progress', 'suspended')))
  OR (i.status = 'done' AND COALESCE(i.done_at, i.scheduled_at) >= strftime('%Y-%m-%d', 'now', '-45 days')))`;

const title = (s: string | null) => (s ? s.toLowerCase().replace(/(^|[\s(/-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase()) : "");

function parseGeo(g: string | null): [number, number] | null {
  const m = g?.match(/(-?\d+(?:\.\d+)?)\s*[,; ]\s*(-?\d+(?:\.\d+)?)/);
  if (!m) return null;
  const lat = Number(m[1]), lng = Number(m[2]);
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && (lat || lng) ? [lat, lng] : null;
}

function addressOf(r: Row) {
  if (r.i_address) return r.i_address;
  if (r.full_address) return r.full_address;
  const street = [r.street_type, r.street].filter(Boolean).join(" ");
  const parts = [street && `${street}${r.number ? ` nr. ${r.number}` : ""}`, r.block && `bl. ${r.block}`, r.stair && `sc. ${r.stair}`, r.floor && `et. ${r.floor}`, r.apartment && `ap. ${r.apartment}`, r.city];
  return parts.filter(Boolean).join(", ") || "Adresă necompletată";
}

function toInsp(r: Row): Insp {
  const geo = r.i_lat != null && r.i_lng != null ? [r.i_lat, r.i_lng] : parseGeo(r.geo);
  const sheet = (FORMS as Record<string, unknown>)[r.sheet_type ?? ""] ? (r.sheet_type as SheetType) : guessSheetType(r.category, r.type, r.order_type);
  return {
    id: r.id, status: r.status, scheduled_at: r.scheduled_at, done_at: r.done_at, duration_min: r.duration_min, sheet_type: sheet,
    property_label: title(r.type) || title(r.category) || "Proprietate", address: addressOf(r), city: r.city, county: r.county,
    lat: geo?.[0] ?? null, lng: geo?.[1] ?? null, cf_number: r.cf_number, cad: r.cad_building || r.cad_land, usable_area: r.usable_area, year_built: r.year_built,
    contact_kind: r.contact_kind, contact_name: r.contact_name, contact_phone: r.contact_phone, notes: r.notes,
    report_number: r.report_number, report_label: r.report_label, purpose: r.purpose, client: r.client, bank: r.bank,
    reschedule_count: r.reschedule_count ?? 0, contact_notified_at: r.contact_notified_at, started_at: r.started_at,
    sheet_status: r.sheet_status as Insp["sheet_status"], updated_at: r.updated_at,
    due_on: r.due_on, instructions: r.instructions, assigned_by_name: r.assigned_by_name,
  };
}

export async function myInspections(db: D1Database, user: User): Promise<Insp[]> {
  const { results } = await db
    .prepare(`${SELECT} WHERE ${MINE} AND ${CURRENT} ORDER BY i.scheduled_at IS NULL, i.scheduled_at, i.due_on IS NULL, i.due_on LIMIT 500`)
    .bind(user.id)
    .all<Row>();
  return results.map(toInsp);
}

export async function myInspection(db: D1Database, user: User, id: string): Promise<Insp | null> {
  const r = await db.prepare(`${SELECT} WHERE i.id = ?2 AND ${MINE}`).bind(user.id, id).first<Row>();
  return r ? toInsp(r) : null;
}

// ---------- the sheet ----------

export type Sheet = {
  id: string; status: "draft" | "submitted"; sheet_type: SheetType; answers: Answers; present_person: string | null; present_role: string | null;
  present_phone: string | null; has_signature: boolean; submitted_at: string | null; updated_at: string | null;
};
export type Photo = { id: string; category: string; caption: string | null; url: string; taken_at: string | null; width: number | null; height: number | null };

const sheetId = (inspectionId: string) => `app-${inspectionId}`;
export const fileUrl = (key: string) => `/api/insp/files/${key.split("/").map(encodeURIComponent).join("/")}`;

export async function sheetOf(db: D1Database, inspectionId: string): Promise<Sheet | null> {
  const s = await db
    .prepare("SELECT id, status, sheet_type, details, present_person, present_role, present_phone, signature_url, submitted_at, updated_at FROM inspection_sheets WHERE id = ?")
    .bind(sheetId(inspectionId))
    .first<{ id: string; status: Sheet["status"]; sheet_type: SheetType; details: string | null; present_person: string | null; present_role: string | null; present_phone: string | null; signature_url: string | null; submitted_at: string | null; updated_at: string | null }>();
  if (!s) return null;
  let answers: Answers = {};
  try { answers = (JSON.parse(s.details ?? "{}").answers ?? {}) as Answers; } catch { /* keep empty */ }
  return { ...s, answers, has_signature: !!s.signature_url };
}

export async function photosOf(db: D1Database, inspectionId: string): Promise<Photo[]> {
  const { results } = await db
    .prepare("SELECT id, category, caption, r2_key, taken_at, width, height FROM inspection_photos WHERE inspection_id = ? AND deleted_at IS NULL ORDER BY sort, created_at")
    .bind(inspectionId)
    .all<{ id: string; category: string; caption: string | null; r2_key: string; taken_at: string | null; width: number | null; height: number | null }>();
  return results.map(({ r2_key, ...p }) => ({ ...p, url: fileUrl(r2_key) }));
}

const LOCAL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

/** Bucharest local time "YYYY-MM-DDTHH:MM", the format of inspection dates. */
export function localNow(d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Bucharest", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
const str = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const numOrNull = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Schedules or reschedules a visit (Bucharest local time). */
export async function schedule(db: D1Database, user: User, ins: Insp, b: Record<string, unknown>) {
  const at = str(b.scheduled_at, 16);
  if (!LOCAL.test(at)) return { ok: false as const, error: "Alege data și ora inspecției." };
  if (ins.status === "done" || ins.sheet_status === "submitted") return { ok: false as const, error: "Inspecția este deja finalizată." };
  const duration = Math.min(480, Math.max(15, Math.round(Number(b.duration_min) || 60)));
  const re = ins.status === "scheduled" && !!ins.scheduled_at && ins.scheduled_at.slice(0, 16) !== at;
  const reason = str(b.reason, 500) || null;
  if (re && !reason) return { ok: false as const, error: "Spune pe scurt de ce se reprogramează." };
  const name = str(b.contact_name, 120) || null, phone = str(b.contact_phone, 40) || null;
  const notes = typeof b.notes === "string" ? b.notes.trim().slice(0, 2000) || null : ins.notes;
  const notified = b.contact_notified === true ? now() : b.contact_notified === false ? null : ins.contact_notified_at;
  await db.batch([
    db.prepare(
      `UPDATE inspections SET status = 'scheduled', scheduled_at = ?, duration_min = ?, contact_name = COALESCE(?, contact_name), contact_phone = COALESCE(?, contact_phone),
        notes = ?, contact_notified_at = ?, scheduled_by = ?, scheduled_via = 'app', inspector_id = COALESCE(inspector_id, ?),
        reschedule_count = reschedule_count + ?, reschedule_reason = CASE WHEN ? THEN ? ELSE reschedule_reason END, updated_at = ? WHERE id = ?`,
    ).bind(at, duration, name, phone, notes, notified, user.id, user.id, re ? 1 : 0, re ? 1 : 0, reason, now(), ins.id),
    db.prepare("INSERT INTO inspection_schedule_log (id, inspection_id, scheduled_at, previous_at, inspector_id, reason, via, by_user) VALUES (?, ?, ?, ?, ?, ?, 'app', ?)")
      .bind(uuid(), ins.id, at, ins.scheduled_at, user.id, reason, user.id),
  ]);
  await audit(db, `user:${user.id}`, re ? "inspection.reschedule" : "inspection.schedule", "inspection", ins.id, at);
  return { ok: true as const };
}

/** Saves the sheet (draft) or submits it (finishes the inspection). Submitted sheets are not changed any more. */
export async function saveSheet(db: D1Database, user: User, ins: Insp, b: Record<string, unknown>) {
  const current = await sheetOf(db, ins.id);
  if (current?.status === "submitted") return { ok: false as const, error: "Fișa a fost deja trimisă.", status: 409 };
  const type = (FORMS as Record<string, unknown>)[str(b.sheet_type, 20)] ? (str(b.sheet_type, 20) as SheetType) : ins.sheet_type;
  const answers = (b.answers && typeof b.answers === "object" ? b.answers : {}) as Answers;
  const submit = b.submit === true;
  const person = str(b.present_person, 120) || null;
  const role = PRESENT_ROLES.some(([k]) => k === b.present_role) ? (b.present_role as string) : null;
  const phone = str(b.present_phone, 40) || null;
  const lat = numOrNull(b.lat), lng = numOrNull(b.lng), acc = numOrNull(b.accuracy_m);
  const id = sheetId(ins.id);

  // Signature: PNG data URL from the phone → R2.
  let signature: string | null = null;
  const sig = typeof b.signature === "string" ? b.signature : "";
  if (sig.startsWith("data:image/png;base64,")) {
    const bytes = Uint8Array.from(atob(sig.slice(22)), (c) => c.charCodeAt(0));
    if (bytes.length > 600_000) return { ok: false as const, error: "Semnătura este prea mare.", status: 400 };
    const r2 = await bucket();
    if (!r2) return { ok: false as const, error: "Stocarea fișierelor nu este disponibilă.", status: 503 };
    const key = `inspectii/${ins.id}/semnatura.png`;
    await r2.put(key, bytes, { httpMetadata: { contentType: "image/png" } });
    signature = `r2:${key}`;
  }

  if (submit) {
    const photos = await db.prepare("SELECT category, COUNT(*) AS n FROM inspection_photos WHERE inspection_id = ? AND deleted_at IS NULL GROUP BY category").bind(ins.id).all<{ category: string; n: number }>();
    if (!photos.results.some((p) => p.category === "exterior")) return { ok: false as const, error: "Adaugă cel puțin o fotografie exterioară.", status: 400 };
    if (!person) return { ok: false as const, error: "Completează numele persoanei prezente.", status: 400 };
    if (!signature && !current?.has_signature) return { ok: false as const, error: "Lipsește semnătura persoanei prezente.", status: 400 };
  }

  const t = now();
  const details = JSON.stringify({ v: FORM_VERSION, answers });
  const location = lat != null && lng != null ? `${lat.toFixed(6)}, ${lng.toFixed(6)}` : null;
  const firstExterior = await db
    .prepare("SELECT r2_key FROM inspection_photos WHERE inspection_id = ? AND category = 'exterior' AND deleted_at IS NULL ORDER BY sort, created_at LIMIT 1")
    .bind(ins.id)
    .first<{ r2_key: string }>();
  const assetId = (await db.prepare("SELECT asset_id FROM inspections WHERE id = ?").bind(ins.id).first<{ asset_id: string | null }>())?.asset_id ?? null;
  const notes = typeof answers.notes === "string" ? answers.notes.trim().slice(0, 4000) || null : null;

  const stmts: D1PreparedStatement[] = [
    db.prepare(
      `INSERT INTO inspection_sheets (id, inspection_id, asset_id, inspector_id, sheet_type, status, form_version, details, description, present_person, present_role, present_phone,
         signature_url, signed_at, location, lat, lng, accuracy_m, photo_url, photos_count, started_at, submitted_at, done_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, CASE WHEN ?13 IS NULL THEN NULL ELSE ?14 END, ?15, ?16, ?17, ?18, ?19,
         (SELECT COUNT(*) FROM inspection_photos WHERE inspection_id = ?2 AND deleted_at IS NULL), ?14, ?20, ?20, ?14)
       ON CONFLICT(id) DO UPDATE SET sheet_type = ?5, status = ?6, form_version = ?7, details = ?8, description = ?9, present_person = ?10, present_role = ?11,
         present_phone = ?12, signature_url = COALESCE(?13, signature_url), signed_at = CASE WHEN ?13 IS NULL THEN signed_at ELSE ?14 END,
         location = COALESCE(?15, location), lat = COALESCE(?16, lat), lng = COALESCE(?17, lng), accuracy_m = COALESCE(?18, accuracy_m),
         photo_url = ?19, photos_count = (SELECT COUNT(*) FROM inspection_photos WHERE inspection_id = ?2 AND deleted_at IS NULL),
         submitted_at = ?20, done_at = COALESCE(?20, done_at), updated_at = ?14`,
    ).bind(id, ins.id, assetId, user.id, type, submit ? "submitted" : "draft", FORM_VERSION, details, notes, person, role, phone,
      signature, t, location, lat, lng, acc, firstExterior ? `r2:${firstExterior.r2_key}` : null, submit ? t : null),
    db.prepare("UPDATE inspections SET sheet_type = ?, started_at = COALESCE(started_at, ?), updated_at = ? WHERE id = ?").bind(type, t, t, ins.id),
  ];

  if (submit) {
    const cols = featureColumns(type, answers);
    const names = FEATURE_COLUMNS;
    const propertyId = assetId ? (await db.prepare("SELECT property_id FROM assets WHERE id = ?").bind(assetId).first<{ property_id: string }>())?.property_id ?? null : null;
    stmts.push(
      db.prepare(`DELETE FROM property_features WHERE sheet_id = ?`).bind(id),
      db.prepare(
        `INSERT INTO property_features (id, sheet_id, inspection_id, property_id, sheet_type, observed_at, ${names.join(", ")})
         VALUES (?, ?, ?, ?, ?, ?, ${names.map(() => "?").join(", ")})`,
      ).bind(`pf-${ins.id}`, id, ins.id, propertyId, type, t, ...names.map((n) => cols[n] ?? null)),
      db.prepare("UPDATE inspections SET status = 'done', done_at = ?, updated_at = ? WHERE id = ?").bind(localNow(), t, ins.id),
    );
  }
  await db.batch(stmts);
  if (submit) await audit(db, `user:${user.id}`, "inspection.submit", "inspection", ins.id, type);
  return { ok: true as const };
}

// ---------- photos ----------

export const PHOTO_MAX_BYTES = 8 * 1024 * 1024;

export async function addPhoto(db: D1Database, user: User, ins: Insp, form: FormData) {
  if (ins.sheet_status === "submitted") return { ok: false as const, error: "Fișa a fost deja trimisă.", status: 409 };
  const file = form.get("file");
  if (!(file instanceof File)) return { ok: false as const, error: "Lipsește fotografia.", status: 400 };
  if (file.size > PHOTO_MAX_BYTES) return { ok: false as const, error: "Fotografia este prea mare (max. 8 MB).", status: 400 };
  const type = file.type || "image/jpeg";
  if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(type)) return { ok: false as const, error: "Se acceptă doar fotografii.", status: 400 };
  const id = str(form.get("id"), 60);
  if (!/^[a-zA-Z0-9-]{8,60}$/.test(id)) return { ok: false as const, error: "Fotografie fără identificator.", status: 400 };
  const exists = await db.prepare("SELECT inspection_id FROM inspection_photos WHERE id = ?").bind(id).first<{ inspection_id: string }>();
  if (exists) return exists.inspection_id === ins.id ? { ok: true as const, id } : { ok: false as const, error: "Identificator folosit.", status: 409 };
  const r2 = await bucket();
  if (!r2) return { ok: false as const, error: "Stocarea fișierelor nu este disponibilă.", status: 503 };
  const ext = type === "image/png" ? "png" : type === "image/webp" ? "webp" : type.startsWith("image/hei") ? "heic" : "jpg";
  const key = `inspectii/${ins.id}/${id}.${ext}`;
  await r2.put(key, file.stream(), { httpMetadata: { contentType: type, cacheControl: "private, max-age=604800" } });
  const n = (v: FormDataEntryValue | null) => (v === null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);
  const cat = str(form.get("category"), 30) || "other";
  await db
    .prepare(
      `INSERT OR IGNORE INTO inspection_photos (id, inspection_id, sheet_id, category, caption, r2_key, content_type, size_bytes, width, height, taken_at, lat, lng, sort, uploaded_by)
       VALUES (?, ?, (SELECT id FROM inspection_sheets WHERE id = ?), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, ins.id, sheetId(ins.id), cat, str(form.get("caption"), 200) || null, key, type, file.size, n(form.get("width")), n(form.get("height")),
      str(form.get("taken_at"), 30) || now(), n(form.get("lat")), n(form.get("lng")), n(form.get("sort")) ?? 0, user.id)
    .run();
  return { ok: true as const, id };
}

export async function deletePhoto(db: D1Database, ins: Insp, photoId: string) {
  if (ins.sheet_status === "submitted") return { ok: false as const, error: "Fișa a fost deja trimisă.", status: 409 };
  await db.prepare("UPDATE inspection_photos SET deleted_at = ? WHERE id = ? AND inspection_id = ?").bind(now(), photoId, ins.id).run();
  return { ok: true as const };
}

/** The inspection a stored file belongs to, when the user may see it ("inspectii/<inspection id>/…"). */
export async function canSeeFile(db: D1Database, user: User, key: string) {
  const m = key.match(/^inspectii\/([^/]+)\/[^/]+$/);
  if (!m) return false;
  const r = await db.prepare(`SELECT 1 AS ok FROM inspections i WHERE i.id = ?2 AND ${MINE}`).bind(user.id, m[1]).first<{ ok: number }>();
  return !!r;
}
