// Server-only: the inspection sheet of one asset as a printable document (annex to the valuation report, as the banks
// ask for it): property and report details, the answers of the form, the rooms of the floor survey, the findings,
// the photos (rooms labelled with their survey position) and the signature of the person present.
import { FORMS, PHOTO_CATEGORIES, PRESENT_ROLES, otherKey, roomsOf, sheetTypeLabel, type Answers, type Field, type Room, type Section, type SheetType, type UtilAnswer } from "./insp-forms";
import { cleanForm } from "./insp-templates";
import { currentForms } from "./insp-templates-db";
import { fileSrc } from "./files";

export type SheetRow = { label: string; value: string };
export type SheetDoc = {
  report: { id: string; number: string | null; label: string | null; bank: string | null; client: string | null; purpose: string | null };
  property: { type: string | null; address: string | null; cf: string | null; cad: string | null; usable_area: number | null; land_area: number | null; city: string | null; county: string | null; lat: number | null; lng: number | null };
  inspection: { id: string; done_at: string | null; inspector: string | null; inspector_anevar: string | null };
  sheet: { type: SheetType; status: string; present: string | null; role: string | null; phone: string | null; location: string | null; submitted_at: string | null; signature: string | null;
    /** the sheet number when it was made in UVALO (FI-2026-0001), and where it was made */
    no: string | null; source: "uvalo" | "app" };
  sections: { title: string; rows: SheetRow[] }[];
  rooms: Room[];
  notes: string | null;
  /** group = the category (or the room in UVALO), the caption the room; profile photo first */
  photos: { src: string; label: string; group: string; taken_at: string | null }[];
};

/** A photo's group: the one chosen by hand, else the room taken in UVALO, else the category of the CRM app. */
export const photoGroup = (p: { category: string; caption: string | null; album: string | null }, uvalo: boolean) =>
  p.album || (uvalo && p.caption) || (PHOTO_CATEGORIES.find((c) => c.k === p.category)?.label ?? "Alte fotografii");

const UTIL_LABEL: Record<string, string> = { water: "Apă", sewer: "Canalizare", gas: "Gaz", power: "Curent electric" };

/** One answer as text ("" when not answered), with the "Altele" text of the question. */
export function answerText(f: Field, answers: Answers): string {
  if (f.kind === "comp") {
    const v = typeof answers[f.k] === "string" ? (answers[f.k] as string).trim() : "";
    if (!v) return "";
    const subs = (f.sub[v] ?? []).map((s) => {
      const x = answers[`${f.k}.${s.k}`];
      const t = Array.isArray(x) ? x.filter((y): y is string => typeof y === "string").join(", ") : typeof x === "string" ? x.trim() : "";
      return t ? `${s.label}: ${t}${s.kind === "num" && s.unit ? ` ${s.unit}` : ""}` : "";
    }).filter(Boolean);
    return [v, ...subs].join(" · ");
  }
  const base = baseText(f, answers[f.k]);
  const alt = f.other && typeof answers[otherKey(f.k)] === "string" ? (answers[otherKey(f.k)] as string).trim() : "";
  return [base, alt].filter(Boolean).join(", ");
}

function baseText(f: Field, a: Answers[string]): string {
  if (f.kind === "photo") return a ? "Fotografie atașată (anexa foto)" : "";
  if (f.kind === "util") {
    const u = (a && typeof a === "object" && !Array.isArray(a) ? a : {}) as UtilAnswer;
    if (u.on === "da") return f.k === "sewer" ? "Branșat" : `Branșat${u.meter === "da" ? ", contor montat" : u.meter === "nu" ? ", fără contor" : ""}`;
    if (u.on === "nu") return `Nebranșat${u.dist ? `, rețeaua la ${u.dist} m` : ""}`;
    return "";
  }
  if (Array.isArray(a)) return a.filter((x): x is string => typeof x === "string").join(", ");
  if (typeof a !== "string" || !a.trim()) return "";
  return f.kind === "num" && f.unit ? `${a.trim()} ${f.unit}` : a.trim();
}

/** The sheet of the asset (its latest one, or the one of `inspectionId`). */
export async function inspectionSheetDoc(db: D1Database, reportId: string, assetId: string, inspectionId?: string): Promise<SheetDoc | null> {
  const row = await db.prepare(
    `SELECT r.id AS report_id, r.number, r.label, r.purpose, b.name AS bank, c.name AS client,
        p.type, p.full_address, p.city, p.county, p.geo, p.cf_number, p.cad_building, p.cad_land, p.usable_area, p.land_area,
        i.id AS inspection_id, i.done_at, i.template, COALESCE(NULLIF(u.name, ''), u.email) AS inspector, u.anevar_no,
        s.sheet_type, s.status, s.details, s.description, s.present_person, s.present_role, s.present_phone, s.location, s.submitted_at, s.signature_url, s.photo_url
      FROM assets a JOIN reports r ON r.id = a.report_id JOIN crm_properties p ON p.id = a.property_id
      LEFT JOIN entities b ON b.id = r.recipient_id LEFT JOIN entities c ON c.id = r.client_id
      LEFT JOIN inspections i ON i.asset_id = a.id AND i.status <> 'cancelled'
      LEFT JOIN inspection_sheets s ON s.inspection_id = i.id
      LEFT JOIN users u ON u.id = COALESCE(s.inspector_id, i.inspector_id)
      WHERE a.id = ? AND a.report_id = ? AND (?3 = '' OR i.id = ?3) ORDER BY s.updated_at DESC LIMIT 1`,
  ).bind(assetId, reportId, inspectionId ?? "").first<Record<string, string | number | null>>();
  if (!row?.inspection_id || !row.sheet_type) return null;

  const type = (FORMS as Record<string, unknown>)[row.sheet_type as string] ? (row.sheet_type as SheetType) : "apartament";
  let answers: Answers = {}, form: Section[] | null = null, uvalo: { sheet_no?: string | null } | null = null;
  try { const d = JSON.parse((row.details as string) ?? "{}") as { answers?: Answers; form?: unknown; uvalo?: { sheet_no?: string | null } }; answers = d.answers ?? {}; form = cleanForm(d.form); uvalo = d.uvalo ?? null; } catch { /* old Glide sheet */ }
  let geo: { lat?: number; lng?: number } = {};
  try { geo = row.geo ? JSON.parse(row.geo as string) : {}; } catch { /* no pin */ }
  // The form the sheet was filled in with; older sheets: the current template (same keys).
  const forms = await currentForms(db);
  const fields = form ?? (row.template && row.template !== "std" ? forms[row.template as string] : null) ?? (row.template === "std" ? FORMS[type] : forms[type]) ?? FORMS[type];

  const sections = fields.map((s) => ({
    title: s.title,
    rows: s.fields.filter((f) => f.k !== "notes" && f.pdf !== false)
      .map((f) => ({ label: f.kind === "util" ? UTIL_LABEL[f.k] ?? f.label : f.label, value: answerText(f, answers) })).filter((r) => r.value),
  })).filter((s) => s.rows.length);

  // the profile photo first (chosen on the asset page), then by the order given there
  const { results } = await db.prepare(`SELECT category, caption, album, r2_key, taken_at FROM inspection_photos WHERE inspection_id = ? AND deleted_at IS NULL
      ORDER BY 'r2:' || r2_key = ? DESC, sort, created_at`)
    .bind(row.inspection_id, row.photo_url ?? "").all<{ category: string; caption: string | null; album: string | null; r2_key: string; taken_at: string | null }>();
  const catLabel = (k: string) => PHOTO_CATEGORIES.find((c) => c.k === k)?.label ?? "Fotografie";

  return {
    report: { id: row.report_id as string, number: row.number as string | null, label: row.label as string | null, bank: row.bank as string | null, client: row.client as string | null, purpose: row.purpose as string | null },
    property: { type: (row.type as string | null) ?? sheetTypeLabel(type), address: (row.full_address && row.city && String(row.full_address).toLowerCase().includes(String(row.city).toLowerCase()) ? String(row.full_address) : [row.full_address, row.city].filter(Boolean).join(", ")) || null, cf: row.cf_number as string | null,
      cad: (row.cad_building ?? row.cad_land) as string | null, usable_area: row.usable_area as number | null, land_area: row.land_area as number | null,
      city: row.city as string | null, county: row.county as string | null, lat: typeof geo.lat === "number" ? geo.lat : null, lng: typeof geo.lng === "number" ? geo.lng : null },
    inspection: { id: row.inspection_id as string, done_at: row.done_at as string | null, inspector: row.inspector as string | null, inspector_anevar: row.anevar_no as string | null },
    sheet: {
      type, status: row.status as string, present: row.present_person as string | null, role: PRESENT_ROLES.find(([k]) => k === row.present_role)?.[1] ?? null,
      phone: row.present_phone as string | null, location: row.location as string | null, submitted_at: row.submitted_at as string | null, signature: fileSrc(row.signature_url as string | null),
      no: uvalo?.sheet_no ?? null, source: uvalo ? "uvalo" : "app",
    },
    sections,
    rooms: roomsOf(answers),
    notes: (typeof answers.notes === "string" && answers.notes.trim()) || (row.description as string | null),
    // from UVALO the caption is the room / category chosen on the phone: it groups the photos, as there
    photos: results.map((p) => ({ src: fileSrc(`r2:${p.r2_key}`)!, label: p.caption || catLabel(p.category), group: photoGroup(p, !!uvalo), taken_at: p.taken_at })),
  };
}

