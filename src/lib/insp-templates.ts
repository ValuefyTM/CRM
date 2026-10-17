// Inspection sheet templates: the built-in forms (insp-forms.ts) as the firm adapts them in the CRM (Setări → Fișe
// de inspecție): groups renamed, reordered or hidden, questions hidden, edited or added. Shared by the CRM editor,
// the API and the inspections app. No server code here.
//
// A sheet keeps the form it was started with (a snapshot in its answers JSON), so a change applies to new sheets.
import { FORMS, SHEET_TYPES, type Field, type Section, type SheetType, type SubField, type SubKind } from "./insp-forms";

/** How a question is answered. "yn" is a one-option question with Da / Nu; "long" is a text over several lines. */
export type QKind = "one" | "many" | "yn" | "num" | "int" | "text" | "long" | "util" | "photo" | "comp";
export const QKINDS: [QKind, string][] = [
  ["one", "O variantă"], ["many", "Mai multe"], ["yn", "Da / Nu"], ["num", "Număr"], ["text", "Text"], ["long", "Text lung"], ["photo", "Fotografie"],
  ["comp", "Compusă (întrebări după răspuns)"],
];
export const SUBKINDS: [SubKind, string][] = [["one", "O variantă"], ["many", "Mai multe"], ["text", "Text"], ["num", "Număr"]];
export const qKindLabel = (k: QKind) => (k === "int" ? "Număr întreg" : k === "util" ? "Branșament" : QKINDS.find(([x]) => x === k)?.[1] ?? k);

export type TplQuestion = {
  k: string; label: string; kind: QKind; opts?: string[]; defaults?: string[]; unit?: string;
  req?: boolean; pdf?: boolean; other?: boolean; hidden?: boolean; custom?: boolean;
  /** "comp": the follow-ups asked after each answer. */
  sub?: Record<string, SubField[]>;
  /** The inspector is asked a photo for this question too. */
  photo?: boolean;
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
 * The firm's template checked against the built-in form. The firm owns its sheets: groups and questions may be deleted,
 * renamed and changed. A built-in question whose kind was changed is no longer the built-in one (it gets its own key, so
 * the CRM column it filled is not written with another kind of answer).
 */
export function mergeTemplate(t: SheetType, saved: Template | null | undefined): Template {
  if (!saved) return baseTemplate(t);
  const baseQ = new Map(baseTemplate(t).flatMap((g) => g.questions.map((q) => [q.k, q] as const)));
  const seen = new Set<string>();
  return saved.map((g) => ({
    ...g,
    questions: g.questions.flatMap((q): TplQuestion[] => {
      if (seen.has(q.k)) return [];
      seen.add(q.k);
      const b = baseQ.get(q.k);
      if (!b || q.custom) return [{ ...q, custom: true }];
      const sameKind = b.kind === q.kind || (b.kind === "one" && q.kind === "yn") || (b.kind === "yn" && q.kind === "one");
      if (!sameKind) return [{ ...q, k: `q_${q.k}`, custom: true }];
      return [{ ...q, unit: b.unit, custom: false, opts: b.opts ? (q.opts?.length ? q.opts : b.opts) : q.opts }];
    }),
  }));
}

/** A template question as the field the app renders. */
export function toField(q: TplQuestion, base?: Field): Field {
  const meta = {
    ...(q.req ? { req: true } : {}), ...(q.other ? { other: true } : {}), ...(q.pdf === false ? { pdf: false } : {}),
    ...(q.defaults?.length ? { defaults: q.defaults } : {}), ...(q.custom ? { custom: true } : {}), ...(q.photo ? { photo: true } : {}),
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
    case "comp": {
      const opts = q.opts?.filter(Boolean) ?? [];
      const sub = Object.fromEntries(opts.map((o) => [o, (q.sub?.[o] ?? []).filter((s) => s.label.trim())]).filter(([, l]) => (l as SubField[]).length));
      return { k: q.k, label, kind: "comp", opts, sub, ...meta };
    }
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
  const kinds = new Set<string>(["one", "many", "yn", "num", "int", "text", "long", "util", "photo", "comp"]);
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
      if ((kind === "one" || kind === "many" || kind === "comp") && !opts?.length) return { ok: false, error: `Întrebarea „${label}” are nevoie de cel puțin un răspuns.` };
      // the follow-ups of a composite question, by answer (only for answers it has)
      let sub: Record<string, SubField[]> | undefined;
      if (kind === "comp" && q.sub && typeof q.sub === "object") {
        sub = {};
        for (const o of opts ?? []) {
          const list = Array.isArray((q.sub as Record<string, unknown>)[o]) ? ((q.sub as Record<string, unknown[]>)[o]).slice(0, 12) : [];
          const out: SubField[] = [];
          for (const x of list as Record<string, unknown>[]) {
            const sl = str(x?.label, 160), sk = str(x?.k, 40).replace(/[^\w-]/g, "") || `s${out.length + 1}`;
            const skind = (["one", "many", "text", "num"].includes(String(x?.kind)) ? x.kind : "text") as SubKind;
            if (!sl || out.some((y) => y.k === sk)) continue;
            const so = Array.isArray(x.opts) ? [...new Set((x.opts as unknown[]).map((v) => str(v, 80)).filter(Boolean))].slice(0, 20) : [];
            out.push({ k: sk, label: sl, kind: skind, ...((skind === "one" || skind === "many") ? { opts: so.length ? so : ["Da", "Nu"] } : {}), ...(skind === "num" && str(x.unit, 10) ? { unit: str(x.unit, 10) } : {}) });
          }
          if (out.length) sub[o] = out;
        }
      }
      const defaults = Array.isArray(q.defaults) ? (q.defaults as unknown[]).map((o) => str(o, 80)).filter((o) => opts?.includes(o)) : undefined;
      questions.push({
        k, label, kind, ...(opts ? { opts } : {}), ...(defaults?.length ? { defaults: kind === "one" ? defaults.slice(0, 1) : defaults } : {}),
        ...(str(q.unit, 10) ? { unit: str(q.unit, 10) } : {}),
        ...(q.req === true ? { req: true } : {}), ...(q.pdf === false ? { pdf: false } : {}), ...(q.other === true ? { other: true } : {}),
        ...(q.hidden === true ? { hidden: true } : {}), ...(q.custom === true ? { custom: true } : {}), ...(q.photo === true ? { photo: true } : {}),
        ...(sub && Object.keys(sub).length ? { sub } : {}),
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

/** The asset types a sheet is linked to, as sent by the editor ("CATEGORIE" or "CATEGORIE|TIP"). */
export const cleanAssets = (v: unknown): string[] =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string").map((x) => x.trim().toUpperCase().slice(0, 100)).filter(Boolean))].slice(0, 60) : [];
