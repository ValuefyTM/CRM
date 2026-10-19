// Server-only: inspections done in UVALO (app.uvalo.ro, the integration API /api/v1) instead of the CRM's own app.
// The firm's sheets (Setări → Fișe de inspecție) are sent as UVALO sheets with the same question keys, so the answers
// come back in the CRM's own format: an inspection sheet like the app's, with photos, signature and the property features.
//
// Worker config: secret UVALO_API_KEY (the key from UVALO → Firma mea → Integrare), secret UVALO_WEBHOOK_SECRET (the
// webhook secret shown there) and optionally var UVALO_API_URL (default https://app.uvalo.ro). The webhook in UVALO:
// <CRM>/api/integrations/uvalo/webhook. The channel (UVALO or the CRM app) is chosen in Setări → Fișe de inspecție.
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { now, parseJson } from "./db";
import { audit } from "./auth";
import { bucket } from "./orders";
import { baseOfKey, currentForms, movableOnly, templateList, tplKey } from "./insp-templates-db";
import { docsForInspection } from "./insp-docs";
import { FEATURE_COLUMNS, FORM_VERSION, ROOMS_KEY, featureColumns, type Answers, type Field, type Room, type Section, type SheetType } from "./insp-forms";
import { sheetId } from "./insp";
import { advanceIfInspected } from "./insp-assign";
import { assetProfile, FIELD_LABELS, type ProfileField } from "./asset-labels";

/** A worker variable or secret (the Cloudflare env; process.env as a fallback). */
async function env(name: string) {
  try { const v = ((await getCloudflareContext({ async: true })).env as unknown as Record<string, unknown>)[name]; if (typeof v === "string" && v) return v; } catch {}
  return process.env[name] || "";
}
const API = async () => ((await env("UVALO_API_URL")) || "https://app.uvalo.ro").replace(/\/$/, "");
export const uvaloConfigured = async () => !!(await env("UVALO_API_KEY"));
export const webhookSecretSet = async () => !!(await env("UVALO_WEBHOOK_SECRET"));
export const uvaloAppUrl = async () => (await env("UVALO_APP_URL")) || "https://inspectii.uvalo.ro";

/** Where inspections go: "uvalo" (when the key is set) or "app" (the CRM's own app, the fallback). */
export async function inspChannel(db: D1Database): Promise<"uvalo" | "app"> {
  if (!(await uvaloConfigured())) return "app";
  const r = await db.prepare("SELECT value FROM settings WHERE key = 'insp_channel'").first<{ value: string }>().catch(() => null);
  return r?.value === "uvalo" ? "uvalo" : "app";
}
export async function setInspChannel(db: D1Database, actor: string, ch: string) {
  const v = ch === "uvalo" ? "uvalo" : "app";
  if (v === "uvalo" && !(await uvaloConfigured())) return { ok: false as const, error: "Lipsește cheia UVALO (secretul UVALO_API_KEY din Cloudflare)." };
  await db.prepare("INSERT INTO settings (key, value, updated_at, updated_by) VALUES ('insp_channel', ?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by")
    .bind(v, now(), actor).run();
  await audit(db, `user:${actor}`, "settings.insp_channel", "settings", "insp_channel", v === "uvalo" ? "Inspecții prin UVALO" : "Inspecții prin aplicația CRM");
  return { ok: true as const };
}

export class UvaloError extends Error { constructor(message: string, public status = 0) { super(message); } }

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const key = await env("UVALO_API_KEY");
  if (!key) throw new UvaloError("Lipsește cheia UVALO.");
  const r = await fetch(`${await API()}/api/v1${path}`, { ...init, signal: AbortSignal.timeout(20000), headers: { Authorization: `Bearer ${key}`, ...(init.body && !(init.body instanceof FormData) ? { "Content-Type": "application/json" } : {}), ...init.headers } })
    .catch((e) => { throw new UvaloError(`UVALO nu răspunde (${(e as Error).message}).`); });
  const d = (await r.json().catch(() => ({}))) as T & { error?: string };
  if (!r.ok) throw new UvaloError(d?.error || `UVALO a răspuns ${r.status}.`, r.status);
  return d;
}
const fileOf = async (id: string) => {
  const r = await fetch(`${await API()}/api/v1/files/${id}`, { headers: { Authorization: `Bearer ${await env("UVALO_API_KEY")}` }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new UvaloError(`Fișierul ${id} nu s-a putut lua din UVALO (${r.status}).`, r.status);
  return { bytes: await r.arrayBuffer(), type: r.headers.get("content-type") ?? "application/octet-stream" };
};

export const ping = () => call<{ ok: boolean; org: { id: string; name: string } | null; key: string }>("");
export const inspectorByLegit = (legit: string) => call<{ inspector: { id: string; name: string; legit: string; phone: boolean } }>(`/inspectors?legit=${encodeURIComponent(legit)}`).then((d) => d.inspector);

/* ---------- sheets: the CRM's form as a UVALO sheet (same keys) ---------- */

/** UVALO's property type of a movable good (its own standard sheet and photo groups). */
const MOVABLE = "Bun mobil (autovehicul, utilaj)";
const PROP: Record<SheetType, string> = { apartament: "Apartament", casa: "Casă", teren: "Teren", comercial: "Spațiu comercial / Hală", accesoriu: "Accesoriu (parcare, garaj, boxă)" };
type UQ = { id: string; t: string; kind: "one" | "many" | "text" | "number" | "comp"; options?: string[]; def?: string; unit?: string; req?: boolean; pdf?: boolean; photo?: boolean;
  sub?: Record<string, { id: string; t: string; kind: "one" | "many" | "text" | "number"; options?: string[]; unit?: string }[]> };

function toUvaloQ(f: Field): UQ | null {
  const meta = { ...(f.req ? { req: true } : {}), ...(f.pdf === false ? { pdf: false } : {}), ...(f.photo ? { photo: true } : {}) };
  switch (f.kind) {
    case "one": case "many": {
      const options = [...f.opts, ...(f.other && !f.opts.includes("Altele") ? ["Altele"] : [])];
      return { id: f.k, t: f.label, kind: f.kind, options, ...(f.defaults?.[0] && f.kind === "one" ? { def: f.defaults[0] } : {}), ...meta };
    }
    case "num": case "int": return { id: f.k, t: f.label, kind: "number", ...(f.unit ? { unit: f.unit } : {}), ...meta };
    case "text": return { id: f.k, t: f.label, kind: "text", ...meta };
    // a utility connection: connected (meter mounted?) or not (distance to the network), as UVALO's composite question
    case "util": return { id: f.k, t: f.label, kind: "comp", options: ["Branșat", "Nebranșat"], ...meta, sub: {
      ...(f.meterLabel ? { Branșat: [{ id: "meter", t: f.meterLabel, kind: "one" as const, options: ["Da", "Nu"] }] } : {}),
      Nebranșat: [{ id: "dist", t: "Distanța până la rețea", kind: "number" as const, unit: "ml" }] } };
    case "comp": return { id: f.k, t: f.label, kind: "comp", options: f.opts, ...(f.defaults?.[0] ? { def: f.defaults[0] } : {}), ...meta,
      sub: Object.fromEntries(Object.entries(f.sub).map(([o, l]) => [o, l.map((s) => ({ id: s.k, t: s.label, kind: s.kind === "num" ? "number" as const : s.kind,
        ...(s.opts ? { options: s.opts } : {}), ...(s.unit ? { unit: s.unit } : {}) }))])) };
    default: return null; // photo questions: the photos are taken by category in UVALO
  }
}
export const toUvaloTemplate = (form: Section[], o: { rooms: boolean; photos: string[] }) => ({
  ...(o.rooms ? { rooms: true } : {}), ...(o.photos.length ? { photos: o.photos } : {}),
  groups: form.map((s) => ({ id: s.id, name: s.title, qs: s.fields.map(toUvaloQ).filter((q): q is UQ => !!q) })).filter((g) => g.qs.length),
});
export const tplRef = (key: string) => `crm-${key}`;

/** Sends the firm's sheets to UVALO (all, or one): they appear there as the firm's sheets, changed only from the CRM. */
export async function syncTemplates(db: D1Database, only?: string) {
  const [forms, list] = await Promise.all([currentForms(db), templateList(db)]);
  const out: { type: string; ok: boolean; error?: string }[] = [];
  for (const x of list) {
    if (only && x.key !== only) continue;
    try {
      await call(`/templates/${tplRef(x.key)}`, { method: "PUT", body: JSON.stringify({ name: `Fișa firmei · ${x.name}`, prop_type: movableOnly(x.assets) ? MOVABLE : PROP[x.base], template: toUvaloTemplate(forms[x.key], x), enforced: true }) });
      out.push({ type: x.key, ok: true });
    } catch (e) { out.push({ type: x.key, ok: false, error: (e as Error).message }); }
  }
  // when each sheet was last sent (settings `uvalo_templates`: {type: {at, error?}}), for Setări → Fișe de inspecție
  const state = await templateSync(db);
  for (const o of out) state[o.type] = { at: now(), ...(o.error ? { error: o.error } : {}) };
  await db.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('uvalo_templates', ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
    .bind(JSON.stringify(state), now()).run();
  return out;
}
/** A sheet deleted in the CRM: its copy in UVALO goes too (UVALO's own standard sheets stay). */
export async function dropTemplateInUvalo(key: string) {
  try { await call(`/templates/${tplRef(key)}`, { method: "DELETE" }); } catch { /* not there */ }
}

export async function templateSync(db: D1Database): Promise<Record<string, { at: string; error?: string }>> {
  const r = await db.prepare("SELECT value FROM settings WHERE key = 'uvalo_templates'").first<{ value: string }>().catch(() => null);
  return parseJson(r?.value, {});
}

/* ---------- inspections ---------- */

type Row = {
  id: string; report_id: string | null; asset_id: string; status: string; sheet_type: string | null; template: string | null; due_on: string | null; instructions: string | null;
  contact_kind: string | null; contact_name: string | null; contact_phone: string | null; inspector_id: string | null; uvalo_id: string | null; uvalo_docs: string | null;
  legit: string | null; inspector: string | null; full_address: string | null; city: string | null; county: string | null; cad_building: string | null; cad_land: string | null;
  cf_number: string | null; usable_area: number | null; land_area: number | null; geo: string | null; type: string | null; category: string | null;
  rooms: number | null; floor: string | null; height_regime: string | null; year_built: number | null; construction: string | null;
  vehicle_make: string | null; vehicle_model: string | null; reg_number: string | null; vin: string | null; mileage: number | null;
  /** the report's client and its user (the bank / recipient), shown to the valuer */
  client: string | null; report_user: string | null;
};

/** The question ids (CRM sheets and UVALO's standard ones) that ask what an asset field holds: UVALO pre-fills them. */
const FACT_KEYS: Partial<Record<ProfileField, string[]>> = {
  usable_area: ["usable_area"], land_area: ["land_area"], rooms: ["rooms"], floor: ["floor"], height_regime: ["height_regime"],
  year_built: ["year_built", "year"], vehicle_make: ["make", "vehicle_make"], vehicle_model: ["model", "vehicle_model"],
  reg_number: ["plate", "reg_number"], vin: ["vin"], mileage: ["mileage"],
};

/** What the CRM knows about the asset, for UVALO: the details of its type (an apartment its rooms and floor, a car its make, model, VIN…). */
function factsOf(r: Row) {
  const p = assetProfile(r.category, r.type);
  // plain numbers (no thousands dots): UVALO reads the digits into number questions
  const num = (n: number | null) => (n != null ? String(n).replace(".", ",") : null);
  const val: Partial<Record<ProfileField, string | null>> = {
    usable_area: num(r.usable_area), land_area: num(r.land_area), rooms: num(r.rooms), floor: r.floor, height_regime: r.height_regime,
    year_built: r.year_built != null ? String(r.year_built) : null, vehicle_make: r.vehicle_make, vehicle_model: r.vehicle_model,
    reg_number: r.reg_number, vin: r.vin, mileage: num(r.mileage), construction: r.construction === "under_construction" ? "În construcție" : null,
  };
  const unit: Partial<Record<ProfileField, string>> = { usable_area: " mp", land_area: " mp", mileage: " km" };
  const facts = p.fields.filter((k) => val[k] && !["cf_number", "cad_building", "cad_land"].includes(k))
    .map((k) => ({ label: (p.labels[k] ?? FIELD_LABELS[k]).replace(/ \((mp|km)\)$/, ""), value: `${val[k]}${unit[k] && !/[a-z]$/i.test(val[k]!) ? unit[k] : ""}`, keys: FACT_KEYS[k] ?? [] }));
  return [...(r.type ? [{ label: "Tip bun", value: r.type.charAt(0) + r.type.slice(1).toLowerCase(), keys: [] as string[] }] : []), ...facts];
}
const CONTACT_ROLE: Record<string, string> = { client: "Client", owner: "Proprietar", agent: "Agent imobiliar", other: "Altă persoană" };

const rowOf = (db: D1Database, id: string) => db.prepare(`SELECT i.id, i.report_id, i.asset_id, i.status, i.sheet_type, i.template, i.due_on, i.instructions, i.contact_kind, i.contact_name, i.contact_phone,
    i.inspector_id, i.uvalo_id, i.uvalo_docs, u.anevar_no AS legit, COALESCE(NULLIF(u.name, ''), u.email) AS inspector,
    p.full_address, p.city, p.county, p.cad_building, p.cad_land, p.cf_number, p.usable_area, p.land_area, p.geo, p.type, p.category,
    p.rooms, p.floor, p.height_regime, p.year_built, p.construction, p.vehicle_make, p.vehicle_model, p.reg_number, p.vin, p.mileage,
    c.name AS client, b.name AS report_user
  FROM inspections i JOIN assets a ON a.id = i.asset_id JOIN crm_properties p ON p.id = a.property_id LEFT JOIN users u ON u.id = i.inspector_id
    LEFT JOIN reports r ON r.id = i.report_id LEFT JOIN entities c ON c.id = r.client_id LEFT JOIN entities b ON b.id = r.recipient_id WHERE i.id = ?`).bind(id).first<Row>();

const fail = async (db: D1Database, id: string, e: unknown) => {
  const msg = (e as Error).message ?? String(e);
  await db.prepare("UPDATE inspections SET uvalo_error = ?, updated_at = ? WHERE id = ?").bind(msg.slice(0, 300), now(), id).run();
  return { ok: false as const, error: msg };
};

/**
 * Sends (or updates: same ref = this id) the inspection to UVALO: the inspector by the ANEVAR card, the property, the contact,
 * the instructions and the deadline, the firm's sheet of its type, then the documents chosen for the inspector (once each).
 */
export async function pushInspection(db: D1Database, id: string) {
  const r = await rowOf(db, id);
  if (!r) return { ok: false as const, error: "Inspecția nu există." };
  if (!r.legit?.trim()) return fail(db, id, new UvaloError(`${r.inspector ?? "Inspectorul"} nu are legitimația ANEVAR completată în CRM (Utilizatori).`));
  const sheets = await templateList(db);
  // the firm's sheet (sent first); none (the standard sheet, or one deleted since): UVALO's own sheet of the type
  const wanted = tplKey(r), key = sheets.some((x) => x.key === wanted) ? wanted : null;
  const type = key ? baseOfKey(sheets, key) : baseOfKey(sheets, r.sheet_type);
  const geo = r.geo ? parseJson<{ lat?: number; lng?: number }>(r.geo, {}) : {};
  try {
    if (key) await syncTemplates(db, key);
    const d = await call<{ id: string; code: string }>("/inspections", { method: "POST", body: JSON.stringify({
      ref: r.id, legit: r.legit, address: r.full_address || [r.city, r.county].filter(Boolean).join(", ") || "Adresă necompletată",
      cad_nr: r.cad_building || r.cad_land || null, cf_nr: r.cf_number, county: r.county, uat: r.city, lat: geo.lat ?? null, lng: geo.lng ?? null,
      prop_type: (r.category ?? "").toUpperCase() === "BUN MOBIL" ? MOVABLE : PROP[type], area_util: r.usable_area, area_land: r.land_area, contact_name: r.contact_name, contact_phone: r.contact_phone,
      contact_role: r.contact_kind ? CONTACT_ROLE[r.contact_kind] ?? null : null, facts: factsOf(r), client: r.client, report_user: r.report_user, instructions: r.instructions, due_on: r.due_on, ...(key ? { template_ref: tplRef(key) } : {}),
    }) });
    // the documents the inspector may open, each sent once
    const sent = new Set(parseJson<string[]>(r.uvalo_docs, []));
    const docs = r.report_id ? await docsForInspection(db, id, r.report_id, [r.asset_id]) : [];
    const r2 = await bucket();
    for (const doc of docs) {
      if (sent.has(doc.ref) || !doc.key || !r2) continue;
      const obj = await r2.get(doc.key);
      if (!obj) continue;
      const form = new FormData();
      form.set("file", new File([await obj.arrayBuffer()], doc.name, { type: doc.content_type ?? obj.httpMetadata?.contentType ?? "application/pdf" }));
      form.set("kind", doc.type === "cf" ? "cf" : doc.type === "rlv" ? "releveu" : "doc");
      form.set("name", doc.name);
      await call(`/inspections/${encodeURIComponent(r.id)}/files`, { method: "POST", body: form }).then(() => sent.add(doc.ref)).catch(() => {});
    }
    await db.prepare("UPDATE inspections SET uvalo_id = ?, uvalo_code = ?, uvalo_status = COALESCE(uvalo_status, 'prog'), uvalo_error = NULL, uvalo_docs = ?, uvalo_synced_at = ? WHERE id = ?")
      .bind(d.id, d.code, JSON.stringify([...sent]), now(), id).run();
    return { ok: true as const, code: d.code };
  } catch (e) { return fail(db, id, e); }
}

/**
 * Sends again to UVALO the open inspections already there (not finished): of a report, or of every asset of a property
 * (its address, cadastral numbers, areas changed in the CRM), so the inspector sees the change and the documents
 * uploaded or ticked since. Runs after the answer.
 */
export async function resyncUvalo(db: D1Database, by: { reportId?: string; propertyId?: string; all?: true }, notice?: "docs") {
  const where = by.all ? "1 = ?" : by.reportId ? "i.report_id = ?" : "a.property_id = ?";
  const { results } = await db.prepare(`SELECT i.id FROM inspections i JOIN assets a ON a.id = i.asset_id
      WHERE ${where} AND i.status IN ('to_schedule', 'scheduled') AND i.glide_id IS NULL AND i.uvalo_id IS NOT NULL
        AND COALESCE(i.uvalo_status, '') NOT IN ('deleted', 'gata', 'pred')`).bind(by.all ? 1 : by.reportId ?? by.propertyId).all<{ id: string }>().catch(() => ({ results: [] as { id: string }[] }));
  // `notice`: after the update, the valuer is told on the phone (the list of documents they now have).
  for (const x of results) await later(pushInspection(db, x.id).then((r) => (r.ok && notice ? notifyDocs(db, x.id) : null)));
  return results.length;
}

/** A phone notification in UVALO to the valuer: the documents of the inspection were updated (with their names). */
async function notifyDocs(db: D1Database, id: string) {
  const r = await db.prepare("SELECT report_id, asset_id FROM inspections WHERE id = ?").bind(id).first<{ report_id: string | null; asset_id: string }>();
  const docs = r?.report_id ? await docsForInspection(db, id, r.report_id, [r.asset_id]) : [];
  const names = docs.map((d) => d.name.replace(/\.(pdf|jpe?g|png|webp|heic)$/i, ""));
  const text = names.length ? `Ai acum ${names.length === 1 ? "actul" : `${names.length} acte`}: ${names.join(", ")}`.slice(0, 290) : "Nu mai ai acte atașate la inspecție.";
  try { await call(`/inspections/${encodeURIComponent(id)}/notify`, { method: "POST", body: JSON.stringify({ title: "docs", text }) }); }
  catch (e) { await fail(db, id, e); }
}

/** Taken back in the CRM (cancelled, done without the app): it leaves the inspector's phone in UVALO. */
export async function cancelInUvalo(db: D1Database, id: string, reason: string) {
  const r = await db.prepare("SELECT uvalo_id, uvalo_status FROM inspections WHERE id = ?").bind(id).first<{ uvalo_id: string | null; uvalo_status: string | null }>();
  if (!r?.uvalo_id || r.uvalo_status === "deleted" || r.uvalo_status === "gata" || r.uvalo_status === "pred") return;
  try {
    await call(`/inspections/${encodeURIComponent(id)}?reason=${encodeURIComponent(reason)}`, { method: "DELETE" });
    await db.prepare("UPDATE inspections SET uvalo_status = 'deleted', uvalo_synced_at = ? WHERE id = ?").bind(now(), id).run();
  } catch (e) { if (!(e instanceof UvaloError && e.status === 404)) await fail(db, id, e); }
}

/** Deleted in the CRM with its sheet: it goes from UVALO too, finished or not (the API's force=1). */
export async function deleteInUvalo(db: D1Database, id: string, reason: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const r = await db.prepare("SELECT uvalo_id, uvalo_status FROM inspections WHERE id = ?").bind(id).first<{ uvalo_id: string | null; uvalo_status: string | null }>();
  if (!r?.uvalo_id || r.uvalo_status === "deleted") return { ok: true };
  try {
    await call(`/inspections/${encodeURIComponent(id)}?force=1&reason=${encodeURIComponent(reason)}`, { method: "DELETE" });
    return { ok: true };
  } catch (e) {
    if (e instanceof UvaloError && e.status === 404) return { ok: true };
    return { ok: false, error: (e as Error).message };
  }
}

/** Runs after the answer is sent (the request is not kept waiting for UVALO); failures stay on the inspection. */
export async function later(p: Promise<unknown>) {
  const q = p.catch(() => {});
  try { (await getCloudflareContext({ async: true })).ctx.waitUntil(q); } catch { await q; }
}

/* ---------- the finished sheet back in the CRM ---------- */

type UFile = { id: string; kind: string; name: string | null; room: string | null; taken_at: string | null; lat: number | null; lng: number | null; type: string | null };
type UInsp = {
  id: string; code: string; status: string; scheduled_at: string | null; started_at: string | null; finished_at: string | null;
  sheet: { no: string | null; template: { name?: string; version?: number }; answers: Record<string, string | string[]>; rooms: { n: string; a: number | null; floor?: string; walls?: string; ceiling?: string; state?: string }[];
    findings: { diff?: string; defects?: string; notes?: string }; signed_name: string | null; signed_at: string | null; cover_file_id: string | null };
  contact: { name: string | null; phone: string | null; role: string | null }; files: UFile[];
};

const category = (room: string | null) => {
  const r = (room ?? "").toLowerCase();
  return /exterior|faț|fat|clădir|cladir|teren|vedere/.test(r) ? "exterior" : /bucăt|bucat/.test(r) ? "kitchen" : /baie|sanitar|wc/.test(r) ? "bathroom"
    : /instala|central|termic/.test(r) ? "installations" : /contor|apometr/.test(r) ? "meters" : /defect|degrad|fisur|igrasie/.test(r) ? "defects"
    : /vecin|împrejur|imprejur|strad|acces|zon/.test(r) ? "surroundings" : /act|document/.test(r) ? "documents" : r ? "interior" : "other";
};
const ext = (type: string) => (/png/.test(type) ? "png" : /webp/.test(type) ? "webp" : /pdf/.test(type) ? "pdf" : "jpg");

/** UVALO's answers in the CRM's format: utilities as {on, meter, dist}, the rooms as the floor-survey list, the findings as notes. */
function toCrmAnswers(form: Section[], u: UInsp): Answers {
  const a = u.sheet.answers ?? {};
  const out: Answers = {};
  for (const f of form.flatMap((s) => s.fields)) {
    if (f.kind === "util") {
      const v = a[f.k];
      if (!v) continue;
      const on = v === "Branșat" ? "da" : "nu";
      out[f.k] = { on, ...(a[`${f.k}.meter`] ? { meter: a[`${f.k}.meter`] === "Da" ? "da" : "nu" } : {}), ...(a[`${f.k}.dist`] ? { dist: String(a[`${f.k}.dist`]) } : {}) } as Answers[string];
      continue;
    }
    if (a[f.k] !== undefined && a[f.k] !== "") out[f.k] = a[f.k];
    // a composite question's follow-ups: answers["<question>.<follow-up>"], the same in both
    if (f.kind === "comp") for (const [k, v] of Object.entries(a)) if (k.startsWith(`${f.k}.`) && v !== "") out[k] = v;
  }
  const rooms: Room[] = (u.sheet.rooms ?? []).map((x, i) => ({ id: `u${i + 1}`, pos: String(i + 1), name: x.n, level: "", area: x.a != null ? String(x.a).replace(".", ",") : "",
    ...(x.floor ? { floor: [x.floor] } : {}), ...(x.walls ? { walls: [x.walls] } : {}), ...(x.ceiling ? { ceiling: x.ceiling } : {}), ...(x.state ? { condition: x.state } : {}) }));
  if (rooms.length) out[ROOMS_KEY] = rooms;
  const f = u.sheet.findings ?? {};
  const notes = [typeof out.notes === "string" ? out.notes : "", f.diff && `Diferențe față de acte: ${f.diff}`, f.defects && `Defecte: ${f.defects}`, f.notes].filter(Boolean).join("\n");
  if (notes) out.notes = notes;
  return out;
}

/**
 * Brings the finished UVALO sheet into the CRM: the answers (as an inspection sheet of the CRM, with the form it was made on),
 * the photos and the signature (copied to the CRM's storage), the property features; the inspection is done, and the report
 * goes to drafting when nothing is left to inspect. Safe to run again (photos already copied are skipped).
 */
export async function importSheet(db: D1Database, id: string, u?: UInsp) {
  const ins = await db.prepare(`SELECT i.id, i.report_id, i.asset_id, i.inspector_id, i.sheet_type, i.template, a.property_id FROM inspections i JOIN assets a ON a.id = i.asset_id WHERE i.id = ?`)
    .bind(id).first<{ id: string; report_id: string | null; asset_id: string; inspector_id: string | null; sheet_type: string | null; template: string | null; property_id: string }>();
  if (!ins) return { ok: false as const, error: "Inspecția nu există în CRM." };
  try {
    const x = u ?? (await call<{ inspection: UInsp }>(`/inspections/${encodeURIComponent(id)}`)).inspection;
    if (x.status !== "gata" && x.status !== "pred") return { ok: false as const, error: "Fișa nu e finalizată în UVALO." };
    const key = tplKey(ins), type = baseOfKey(await templateList(db, true), key ?? ins.sheet_type);
    const forms = await currentForms(db);
    const form = (key ? forms[key] : null) ?? forms[type];
    const answers = toCrmAnswers(form, x);
    const r2 = await bucket();
    if (!r2) throw new UvaloError("Stocarea fișierelor nu este disponibilă.");
    const sid = sheetId(id), t = now();
    // photos and signature, copied once (the photo id = UVALO's file id)
    let signature: string | null = null;
    const have = new Set((await db.prepare("SELECT id FROM inspection_photos WHERE inspection_id = ?").bind(id).all<{ id: string }>()).results.map((p) => p.id));
    let sort = 0;
    for (const f of x.files) {
      if (f.kind === "signature") {
        const b = await fileOf(f.id);
        const key = `inspectii/${id}/semnatura.${ext(b.type)}`;
        await r2.put(key, b.bytes, { httpMetadata: { contentType: b.type } });
        signature = `r2:${key}`;
        continue;
      }
      if (f.kind !== "photo") continue;
      sort++;
      const pid = `uv-${f.id}`;
      if (have.has(pid)) continue;
      const b = await fileOf(f.id);
      const key = `inspectii/${id}/${pid}.${ext(b.type)}`;
      await r2.put(key, b.bytes, { httpMetadata: { contentType: b.type, cacheControl: "private, max-age=604800" } });
      await db.prepare(`INSERT OR IGNORE INTO inspection_photos (id, inspection_id, sheet_id, category, caption, r2_key, content_type, size_bytes, taken_at, lat, lng, sort, uploaded_by)
        VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(pid, id, f.id === x.sheet.cover_file_id ? "exterior" : category(f.room), f.room, key, b.type, b.bytes.byteLength,
        f.taken_at ?? t, f.lat, f.lng, f.id === x.sheet.cover_file_id ? -1 : sort, ins.inspector_id).run();
    }
    const cover = await db.prepare("SELECT r2_key FROM inspection_photos WHERE inspection_id = ? AND deleted_at IS NULL ORDER BY category = 'exterior' DESC, sort, created_at LIMIT 1").bind(id).first<{ r2_key: string }>();
    const doneAt = x.finished_at ?? t;
    const details = JSON.stringify({ v: FORM_VERSION, answers, form, source: "uvalo", uvalo: { id: x.id, code: x.code, sheet_no: x.sheet.no, template: x.sheet.template?.name ?? null } });
    const cols = featureColumns(type, answers, form);
    await db.batch([
      db.prepare(`INSERT INTO inspection_sheets (id, inspection_id, asset_id, inspector_id, sheet_type, status, form_version, details, description, present_person, present_role, present_phone,
          signature_url, signed_at, photo_url, photos_count, started_at, submitted_at, done_at, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5, 'submitted', ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, (SELECT COUNT(*) FROM inspection_photos WHERE inspection_id = ?2 AND deleted_at IS NULL), ?15, ?16, ?16, ?17)
        ON CONFLICT(id) DO UPDATE SET sheet_type = ?5, status = 'submitted', form_version = ?6, details = ?7, description = ?8, present_person = ?9, present_role = ?10, present_phone = ?11,
          signature_url = COALESCE(?12, signature_url), signed_at = ?13, photo_url = ?14, photos_count = (SELECT COUNT(*) FROM inspection_photos WHERE inspection_id = ?2 AND deleted_at IS NULL),
          submitted_at = ?16, done_at = ?16, updated_at = ?17`)
        .bind(sid, id, ins.asset_id, ins.inspector_id, type, FORM_VERSION, details, typeof answers.notes === "string" ? answers.notes.slice(0, 4000) : null,
          x.sheet.signed_name, null, null, signature, x.sheet.signed_at, cover ? `r2:${cover.r2_key}` : null, x.started_at ?? doneAt, doneAt, t),
      db.prepare("UPDATE inspection_photos SET sheet_id = ? WHERE inspection_id = ? AND sheet_id IS NULL").bind(sid, id),
      db.prepare("DELETE FROM property_features WHERE sheet_id = ?").bind(sid),
      db.prepare(`INSERT INTO property_features (id, sheet_id, inspection_id, property_id, sheet_type, observed_at, ${FEATURE_COLUMNS.join(", ")})
        VALUES (?, ?, ?, ?, ?, ?, ${FEATURE_COLUMNS.map(() => "?").join(", ")})`).bind(`pf-${id}`, sid, id, ins.property_id, type, doneAt, ...FEATURE_COLUMNS.map((n) => cols[n] ?? null)),
      db.prepare(`UPDATE inspections SET status = 'done', done_at = ?, started_at = COALESCE(started_at, ?), uvalo_status = ?, uvalo_error = NULL, uvalo_synced_at = ?, updated_at = ? WHERE id = ?`)
        .bind(doneAt, x.started_at, x.status, t, t, id),
    ]);
    await audit(db, "system:uvalo", "inspection.submit", "inspection", id, `${type} · din UVALO${x.sheet.no ? ` (${x.sheet.no})` : ""}`);
    if (ins.report_id) {
      await audit(db, "system:uvalo", "report.inspection_done", "report", ins.report_id, `inspecție finalizată în UVALO${x.sheet.no ? ` · fișa ${x.sheet.no}` : ""}`);
      await advanceIfInspected(db, "system:uvalo", ins.report_id);
    }
    return { ok: true as const };
  } catch (e) { return fail(db, id, e); }
}

/* ---------- webhook ---------- */

const hex = (b: ArrayBuffer) => Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, "0")).join("");

/** `X-Uvalo-Signature: t=<unix>,v1=<hex HMAC-SHA256(secret, "<t>.<body>")>`, not older than 10 minutes. */
export async function verifyHook(body: string, header: string | null) {
  const secret = await env("UVALO_WEBHOOK_SECRET");
  if (!secret || !header) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.trim().split("=") as [string, string]));
  const ts = Number(parts.t);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 600 || !parts.v1) return false;
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const want = hex(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(`${ts}.${body}`)));
  if (want.length !== parts.v1.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ parts.v1.charCodeAt(i);
  return diff === 0;
}

export type HookEvent = { event: string; id: string; ref: string; status: string; scheduled_at: string | null; started_at: string | null; finished_at: string | null; sheet_no: string | null; text?: string };

/** What UVALO says happened on an inspection the CRM sent: the CRM inspection follows (scheduled, started, finished → sheet). */
export async function onHook(db: D1Database, h: HookEvent) {
  const ins = await db.prepare("SELECT id, report_id, status FROM inspections WHERE id = ? AND uvalo_id IS NOT NULL").bind(h.ref).first<{ id: string; report_id: string | null; status: string }>();
  if (!ins) return { ok: false as const, error: "Inspecție necunoscută." };
  const t = now();
  if (h.event === "inspection.finished" || h.status === "gata" || h.status === "pred") return importSheet(db, ins.id);
  if (ins.status === "done" || ins.status === "cancelled") {
    await db.prepare("UPDATE inspections SET uvalo_status = CASE WHEN uvalo_status = 'deleted' THEN uvalo_status ELSE ? END, uvalo_synced_at = ? WHERE id = ?").bind(h.status, t, ins.id).run();
    return { ok: true as const };
  }
  if (h.status === "deleted") {
    // taken back in UVALO (not from the CRM): the CRM task goes back to "to allocate"
    await db.prepare("UPDATE inspections SET status = 'cancelled', cancelled_at = ?, uvalo_status = 'deleted', uvalo_synced_at = ?, updated_at = ? WHERE id = ?").bind(t, t, t, ins.id).run();
    if (ins.report_id) await audit(db, "system:uvalo", "report.inspection_cancel", "report", ins.report_id, `ștearsă în UVALO${h.text ? ` · ${h.text}` : ""}`);
    return { ok: true as const };
  }
  const scheduled = h.status === "plan" || h.status === "lucru";
  await db.prepare(`UPDATE inspections SET status = ?, scheduled_at = CASE WHEN ? IS NOT NULL THEN ? ELSE scheduled_at END, scheduled_via = CASE WHEN ? IS NOT NULL THEN 'uvalo' ELSE scheduled_via END,
      started_at = COALESCE(?, started_at), uvalo_status = ?, uvalo_synced_at = ?, updated_at = ? WHERE id = ?`)
    .bind(scheduled ? "scheduled" : "to_schedule", h.scheduled_at, h.scheduled_at, h.scheduled_at, h.status === "lucru" ? h.started_at ?? t : null, h.status, t, t, ins.id).run();
  if (h.event === "inspection.scheduled" && ins.report_id && h.scheduled_at) await audit(db, "system:uvalo", "report.inspection_schedule", "report", ins.report_id, `programată în UVALO: ${h.scheduled_at.replace("T", " ")}`);
  return { ok: true as const };
}

/**
 * A resend of every open inspection asked once (by a migration, after a change of what is sent): done at the CRM's
 * first activity. The flag is removed first, so only one request does it.
 */
export async function resendPending(db: D1Database) {
  const r = await db.prepare("DELETE FROM settings WHERE key = 'uvalo_resend_pending'").run().catch(() => null);
  if (!r?.meta.changes) return 0;
  return resyncUvalo(db, { all: true });
}
