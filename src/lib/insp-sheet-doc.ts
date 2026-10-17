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
  property: { type: string | null; address: string | null; cf: string | null; cad: string | null; usable_area: number | null };
  inspection: { id: string; done_at: string | null; inspector: string | null; inspector_anevar: string | null };
  sheet: { type: SheetType; status: string; present: string | null; role: string | null; phone: string | null; location: string | null; submitted_at: string | null; signature: string | null };
  sections: { title: string; rows: SheetRow[] }[];
  rooms: Room[];
  notes: string | null;
  photos: { src: string; label: string }[];
};

const UTIL_LABEL: Record<string, string> = { water: "Apă", sewer: "Canalizare", gas: "Gaz", power: "Curent electric" };

/** One answer as text ("" when not answered), with the "Altele" text of the question. */
function answerText(f: Field, answers: Answers): string {
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

export async function inspectionSheetDoc(db: D1Database, reportId: string, assetId: string): Promise<SheetDoc | null> {
  const row = await db.prepare(
    `SELECT r.id AS report_id, r.number, r.label, r.purpose, b.name AS bank, c.name AS client,
        p.type, p.full_address, p.city, p.cf_number, p.cad_building, p.cad_land, p.usable_area,
        i.id AS inspection_id, i.done_at, COALESCE(NULLIF(u.name, ''), u.email) AS inspector, u.anevar_no,
        s.sheet_type, s.status, s.details, s.description, s.present_person, s.present_role, s.present_phone, s.location, s.submitted_at, s.signature_url
      FROM assets a JOIN reports r ON r.id = a.report_id JOIN crm_properties p ON p.id = a.property_id
      LEFT JOIN entities b ON b.id = r.recipient_id LEFT JOIN entities c ON c.id = r.client_id
      LEFT JOIN inspections i ON i.asset_id = a.id AND i.status <> 'cancelled'
      LEFT JOIN inspection_sheets s ON s.inspection_id = i.id
      LEFT JOIN users u ON u.id = COALESCE(s.inspector_id, i.inspector_id)
      WHERE a.id = ? AND a.report_id = ? ORDER BY s.updated_at DESC LIMIT 1`,
  ).bind(assetId, reportId).first<Record<string, string | number | null>>();
  if (!row?.inspection_id || !row.sheet_type) return null;

  const type = (FORMS as Record<string, unknown>)[row.sheet_type as string] ? (row.sheet_type as SheetType) : "apartament";
  let answers: Answers = {}, form: Section[] | null = null;
  try { const d = JSON.parse((row.details as string) ?? "{}") as { answers?: Answers; form?: unknown }; answers = d.answers ?? {}; form = cleanForm(d.form); } catch { /* old Glide sheet */ }
  // The form the sheet was filled in with; older sheets: the current template (same keys).
  const fields = form ?? (await currentForms(db))[type] ?? FORMS[type];

  const sections = fields.map((s) => ({
    title: s.title,
    rows: s.fields.filter((f) => f.k !== "notes" && f.pdf !== false)
      .map((f) => ({ label: f.kind === "util" ? UTIL_LABEL[f.k] ?? f.label : f.label, value: answerText(f, answers) })).filter((r) => r.value),
  })).filter((s) => s.rows.length);

  const { results } = await db.prepare("SELECT category, caption, r2_key FROM inspection_photos WHERE inspection_id = ? AND deleted_at IS NULL ORDER BY sort, created_at")
    .bind(row.inspection_id).all<{ category: string; caption: string | null; r2_key: string }>();
  const catLabel = (k: string) => PHOTO_CATEGORIES.find((c) => c.k === k)?.label ?? "Fotografie";

  return {
    report: { id: row.report_id as string, number: row.number as string | null, label: row.label as string | null, bank: row.bank as string | null, client: row.client as string | null, purpose: row.purpose as string | null },
    property: { type: (row.type as string | null) ?? sheetTypeLabel(type), address: [row.full_address, row.city].filter(Boolean).join(", ") || null, cf: row.cf_number as string | null,
      cad: (row.cad_building ?? row.cad_land) as string | null, usable_area: row.usable_area as number | null },
    inspection: { id: row.inspection_id as string, done_at: row.done_at as string | null, inspector: row.inspector as string | null, inspector_anevar: row.anevar_no as string | null },
    sheet: {
      type, status: row.status as string, present: row.present_person as string | null, role: PRESENT_ROLES.find(([k]) => k === row.present_role)?.[1] ?? null,
      phone: row.present_phone as string | null, location: row.location as string | null, submitted_at: row.submitted_at as string | null, signature: fileSrc(row.signature_url as string | null),
    },
    sections,
    rooms: roomsOf(answers),
    notes: (typeof answers.notes === "string" && answers.notes.trim()) || (row.description as string | null),
    photos: results.map((p) => ({ src: fileSrc(`r2:${p.r2_key}`)!, label: p.caption || catLabel(p.category) })),
  };
}

