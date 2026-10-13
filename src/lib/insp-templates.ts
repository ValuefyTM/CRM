// Inspection sheet templates: the built-in forms (insp-forms.ts) as the firm adapts them in the CRM (Setări → Fișe
// de inspecție): groups renamed, reordered or hidden, questions hidden, edited or added. Shared by the CRM editor,
// the API and the inspections app. No server code here.
//
// A sheet keeps the form it was started with (a snapshot in its answers JSON), so a change applies to new sheets.
import { FORMS, SHEET_TYPES, type Field, type Section, type SheetType } from "./insp-forms";

/** How a question is answered. "yn" is a one-option question with Da / Nu; "long" is a text over several lines. */
export type QKind = "one" | "many" | "yn" | "num" | "int" | "text" | "long" | "util" | "photo";
export const QKINDS: [QKind, string][] = [
  ["one", "O variantă"], ["many", "Mai multe"], ["yn", "Da / Nu"], ["num", "Număr"], ["text", "Text"], ["long", "Text lung"], ["photo", "Fotografie"],
];
export const qKindLabel = (k: QKind) => (k === "int" ? "Număr întreg" : k === "util" ? "Branșament" : QKINDS.find(([x]) => x === k)?.[1] ?? k);

export type TplQuestion = {
  k: string; label: string; kind: QKind; opts?: string[]; defaults?: string[]; unit?: string;
  req?: boolean; pdf?: boolean; other?: boolean; hidden?: boolean; custom?: boolean;
};
export type TplGroup = { id: string; title: string; hidden?: boolean; custom?: boolean; questions: TplQuestion[] };
export type Template = TplGroup[];

const DA_NU = ["Da", "Nu"];
const isYn = (f: Field) => f.kind === "one" && f.opts.length === 2 && f.opts[0] === "Da" && f.opts[1] === "Nu";

const toQuestion = (f: Field): TplQuestion => ({
  k: f.k, label: f.label,
  kind: isYn(f) ? "yn" : f.kind === "text" ? (f.long ? "long" : "text") : f.kind,
  ...(f.kind === "one" || f.kind === "many" ? { opts: [...f.opts] } : {}),
  ...("unit" in f && f.unit ? { unit: f.unit } : {}),
});

/** The built-in form as a template ("Modelul VALUEFY"). */
export const baseTemplate = (t: SheetType): Template =>
  FORMS[t].map((s) => ({ id: s.id, title: s.title, questions: s.fields.map(toQuestion) }));

/**
 * The firm's template checked against the built-in form: built-in questions keep their kind (the CRM columns depend
 * on it), questions the code added since are put back in their group, removed ones are dropped.
 */
export function mergeTemplate(t: SheetType, saved: Template | null | undefined): Template {
  const base = baseTemplate(t);
  if (!saved?.length) return base;
  const baseQ = new Map(base.flatMap((g) => g.questions.map((q) => [q.k, { q, group: g.id }] as const)));
  const seen = new Set<string>();
  const groups: Template = saved.map((g) => ({
    ...g,
    questions: g.questions.flatMap((q) => {
      if (seen.has(q.k)) return [];
      const b = baseQ.get(q.k);
      if (!b && !q.custom) return [];
      seen.add(q.k);
      if (!b) return [q];
      // Built-in: label, options, flags may change; kind and unit stay.
      const kind = b.q.kind === "one" && q.kind === "yn" ? "yn" : b.q.kind;
      return [{ ...q, kind, unit: b.q.unit, custom: false, opts: b.q.opts ? (q.opts?.length ? q.opts : b.q.opts) : undefined }];
    }),
  }));
  for (const bg of base) {
    const missing = bg.questions.filter((q) => !seen.has(q.k));
    if (!missing.length) continue;
    const g = groups.find((x) => x.id === bg.id);
    if (g) g.questions.push(...missing);
    else groups.push({ ...bg, questions: missing });
  }
  return groups;
}

/** A template question as the field the app renders. */
export function toField(q: TplQuestion, base?: Field): Field {
  const meta = {
    ...(q.req ? { req: true } : {}), ...(q.other ? { other: true } : {}), ...(q.pdf === false ? { pdf: false } : {}),
    ...(q.defaults?.length ? { defaults: q.defaults } : {}), ...(q.custom ? { custom: true } : {}),
  };
  if (base && !q.custom) {
    // Built-in: what the code knows (placeholder, meter label…) with the firm's label and options.
    const opts = "opts" in base && q.opts?.length ? { opts: q.opts } : {};
    return { ...base, label: q.label || base.label, ...opts, ...meta } as Field;
  }
  const label = q.label.trim() || "Întrebare";
  switch (q.kind) {
    case "one": case "many": return { k: q.k, label, kind: q.kind, opts: q.opts?.filter(Boolean) ?? [], ...meta };
    case "yn": return { k: q.k, label, kind: "one", opts: DA_NU, ...meta };
    case "num": case "int": return { k: q.k, label, kind: q.kind, unit: q.unit, ...meta };
    case "long": return { k: q.k, label, kind: "text", long: true, ...meta };
    case "photo": return { k: q.k, label, kind: "photo", ...meta };
    default: return { k: q.k, label, kind: "text", ...meta };
  }
}

/** The sections the app shows for a template (hidden groups and questions left out). */
export function templateSections(t: SheetType, tpl: Template): Section[] {
  const base = new Map(FORMS[t].flatMap((s) => s.fields.map((f) => [f.k, f] as const)));
  return tpl
    .filter((g) => !g.hidden)
    .map((g) => ({ id: g.id, title: g.title, fields: g.questions.filter((q) => !q.hidden).map((q) => toField(q, base.get(q.k))) }))
    .filter((s) => s.fields.length);
}

/** The forms of every sheet type for the firm's saved templates (missing ones: the built-in forms). */
export const effectiveForms = (saved: Partial<Record<SheetType, Template>>): Record<SheetType, Section[]> =>
  Object.fromEntries(SHEET_TYPES.map(([t]) => [t, templateSections(t, mergeTemplate(t, saved[t]))])) as Record<SheetType, Section[]>;

export const templateStats = (tpl: Template) => {
  const groups = tpl.filter((g) => !g.hidden);
  const qs = groups.flatMap((g) => g.questions.filter((q) => !q.hidden));
  return { groups: groups.length, questions: qs.length, custom: qs.filter((q) => q.custom).length, hidden: tpl.flatMap((g) => g.questions).filter((q) => q.hidden).length + tpl.filter((g) => g.hidden).length };
};

/** Checks a template sent by the CRM editor (shape, sizes, unique keys); returns it cleaned or an error. */
export function cleanTemplate(t: SheetType, raw: unknown): { ok: true; tpl: Template } | { ok: false; error: string } {
  if (!Array.isArray(raw) || raw.length > 40) return { ok: false, error: "Fișa nu este validă." };
  const keys = new Set<string>();
  const kinds = new Set<string>(["one", "many", "yn", "num", "int", "text", "long", "util", "photo"]);
  const str = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
  const groups: Template = [];
  for (const g of raw as Record<string, unknown>[]) {
    const id = str(g?.id, 60).replace(/[^\w-]/g, "");
    const title = str(g?.title, 80);
    if (!id || !title) return { ok: false, error: "Fiecare grup are nevoie de un nume." };
    if (!Array.isArray(g.questions) || g.questions.length > 120) return { ok: false, error: `Grupul „${title}” nu este valid.` };
    const questions: TplQuestion[] = [];
    for (const q of g.questions as Record<string, unknown>[]) {
      const k = str(q?.k, 80).replace(/[^\w.-]/g, "");
      const label = str(q?.label, 160);
      const kind = str(q?.kind, 10) as QKind;
      if (!k || !label || !kinds.has(kind)) return { ok: false, error: `O întrebare din „${title}” nu are text sau tip.` };
      if (keys.has(k)) return { ok: false, error: `Întrebarea „${label}” apare de două ori.` };
      keys.add(k);
      const opts = Array.isArray(q.opts) ? [...new Set((q.opts as unknown[]).map((o) => str(o, 80)).filter(Boolean))].slice(0, 40) : undefined;
      if ((kind === "one" || kind === "many") && !opts?.length) return { ok: false, error: `Întrebarea „${label}” are nevoie de cel puțin un răspuns.` };
      const defaults = Array.isArray(q.defaults) ? (q.defaults as unknown[]).map((o) => str(o, 80)).filter((o) => opts?.includes(o)) : undefined;
      questions.push({
        k, label, kind, ...(opts ? { opts } : {}), ...(defaults?.length ? { defaults: kind === "one" ? defaults.slice(0, 1) : defaults } : {}),
        ...(str(q.unit, 10) ? { unit: str(q.unit, 10) } : {}),
        ...(q.req === true ? { req: true } : {}), ...(q.pdf === false ? { pdf: false } : {}), ...(q.other === true ? { other: true } : {}),
        ...(q.hidden === true ? { hidden: true } : {}), ...(q.custom === true ? { custom: true } : {}),
      });
    }
    groups.push({ id, title, ...(g.hidden === true ? { hidden: true } : {}), ...(g.custom === true ? { custom: true } : {}), questions });
  }
  return { ok: true, tpl: mergeTemplate(t, groups) };
}

/** Checks the form snapshot a phone sends with a sheet (it renders the PDF later): the shape only. */
export function cleanForm(raw: unknown): Section[] | null {
  if (!Array.isArray(raw) || !raw.length || JSON.stringify(raw).length > 200_000) return null;
  const ok = raw.every((s) => s && typeof s === "object" && typeof s.id === "string" && typeof s.title === "string" && Array.isArray(s.fields)
    && s.fields.every((f: unknown) => !!f && typeof f === "object" && typeof (f as Field).k === "string" && typeof (f as Field).label === "string" && typeof (f as Field).kind === "string"));
  return ok ? (raw as Section[]) : null;
}

/** A new key for a question added by the firm (never one of the built-in keys). */
export const newQuestionKey = () => `q_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
