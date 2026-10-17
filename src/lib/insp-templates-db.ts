// Server-only: the firm's inspection sheet templates. The built-in ones (one per property type, table insp_templates keyed by the
// type) and the ones made in the CRM ("c-<id>", started from a built-in type); names and the new sheets in insp_template_meta.
import { now } from "./db";
import { SHEET_TYPES, type Section, type SheetType } from "./insp-forms";
import { baseTemplate, effectiveForms, mergeTemplate, templateSections, type Template } from "./insp-templates";

export type TplInfo = { key: string; name: string; base: SheetType; builtin: boolean; deleted: boolean };

const isType = (t: string | null | undefined): t is SheetType => SHEET_TYPES.some(([k]) => k === t);

/** Every sheet: the built-in ones first (with the name the firm gave them), then the firm's own (deleted ones only on request). */
export async function templateList(db: D1Database, withDeleted = false): Promise<TplInfo[]> {
  const { results } = await db.prepare("SELECT key, name, base, deleted_at FROM insp_template_meta ORDER BY created_at")
    .all<{ key: string; name: string | null; base: string; deleted_at: string | null }>().catch(() => ({ results: [] as { key: string; name: string | null; base: string; deleted_at: string | null }[] }));
  const meta = new Map(results.map((r) => [r.key, r]));
  const builtin = SHEET_TYPES.map(([t, label]): TplInfo => ({ key: t, name: meta.get(t)?.name?.trim() || label, base: t, builtin: true, deleted: false }));
  const own = results.filter((r) => !isType(r.key) && isType(r.base) && (withDeleted || !r.deleted_at))
    .map((r): TplInfo => ({ key: r.key, name: r.name?.trim() || "Fișă fără nume", base: r.base as SheetType, builtin: false, deleted: !!r.deleted_at }));
  return [...builtin, ...own];
}

/** The template key an inspection uses (its own sheet, else its type). */
export const tplKey = (i: { template?: string | null; sheet_type?: string | null }) => i.template || i.sheet_type || "apartament";

/** The built-in type behind a key (a built-in key is its own type). */
export const baseOfKey = (list: TplInfo[], key: string | null | undefined): SheetType =>
  isType(key) ? key : list.find((x) => x.key === key)?.base ?? "apartament";

/** The name of each sheet, by key (deleted ones included, for the inspections that used them). */
export const templateNames = async (db: D1Database): Promise<Record<string, string>> => Object.fromEntries((await templateList(db, true)).map((x) => [x.key, x.name]));

export async function savedTemplates(db: D1Database): Promise<Record<string, Template>> {
  const { results } = await db.prepare("SELECT sheet_type, groups FROM insp_templates").all<{ sheet_type: string; groups: string }>();
  const out: Record<string, Template> = {};
  for (const r of results) {
    try { out[r.sheet_type] = JSON.parse(r.groups) as Template; } catch { /* broken row: built-in form */ }
  }
  return out;
}

/** The forms the inspectors fill in now: every built-in type and every sheet made in the CRM, by key. */
export async function currentForms(db: D1Database): Promise<Record<string, Section[]>> {
  const [saved, list] = await Promise.all([savedTemplates(db), templateList(db, true)]);
  const forms: Record<string, Section[]> = effectiveForms(saved);
  for (const x of list) if (!x.builtin) forms[x.key] = templateSections(x.base, mergeTemplate(x.base, saved[x.key]));
  return forms;
}

export async function templateOf(db: D1Database, key: string, base: SheetType) {
  const row = await db.prepare("SELECT groups, updated_at, updated_by FROM insp_templates WHERE sheet_type = ?").bind(key)
    .first<{ groups: string; updated_at: string; updated_by: string | null }>();
  let saved: Template | null = null;
  try { saved = row ? (JSON.parse(row.groups) as Template) : null; } catch { /* built-in */ }
  return { tpl: mergeTemplate(base, saved), custom: !!saved, updated_at: row?.updated_at ?? null };
}

export async function saveTemplate(db: D1Database, key: string, tpl: Template | null, userId: string) {
  if (!tpl) await db.prepare("DELETE FROM insp_templates WHERE sheet_type = ?").bind(key).run();
  else await db.prepare(
    "INSERT INTO insp_templates (sheet_type, groups, updated_at, updated_by) VALUES (?, ?, ?, ?) ON CONFLICT(sheet_type) DO UPDATE SET groups = excluded.groups, updated_at = excluded.updated_at, updated_by = excluded.updated_by",
  ).bind(key, JSON.stringify(tpl), now(), userId).run();
}

/** A new sheet, as a copy of another one (its current questions, or the VALUEFY model of a type when `model`). */
export async function createTemplate(db: D1Database, name: string, from: string, model: boolean, userId: string) {
  const src = (await templateList(db)).find((x) => x.key === from);
  if (!src) return null;
  const key = `c-${crypto.randomUUID().slice(0, 8)}`;
  const tpl = model ? baseTemplate(src.base) : (await templateOf(db, src.key, src.base)).tpl;
  await db.prepare("INSERT INTO insp_template_meta (key, name, base, created_at, created_by) VALUES (?, ?, ?, ?, ?)").bind(key, name, src.base, now(), userId).run();
  await saveTemplate(db, key, tpl, userId);
  return { key, base: src.base };
}

export async function renameTemplate(db: D1Database, key: string, base: SheetType, name: string) {
  await db.prepare("INSERT INTO insp_template_meta (key, name, base, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET name = excluded.name")
    .bind(key, name, base, now()).run();
}

/** Takes a sheet made in the CRM off the list (inspections that used it keep it). */
export const removeTemplate = (db: D1Database, key: string) =>
  db.prepare("UPDATE insp_template_meta SET deleted_at = ? WHERE key = ? AND key LIKE 'c-%'").bind(now(), key).run();
