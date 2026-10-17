// Server-only: the firm's inspection sheet templates. The built-in ones (one per property type, table insp_templates keyed by the
// type) and the ones made in the CRM ("c-<id>", started from a built-in type); names and the new sheets in insp_template_meta.
import { now } from "./db";
import { ALL_ASSETS, SHEET_TYPES, defaultSheetAssets, guessSheetType, type Section, type SheetType } from "./insp-forms";
import { ASSET_CATEGORIES } from "./asset-labels";
import { baseTemplate, effectiveForms, mergeTemplate, templateSections, type Template } from "./insp-templates";

export type TplInfo = { key: string; name: string; base: SheetType; builtin: boolean; deleted: boolean;
  /** asset types the sheet is for ("CATEGORIE|TIP", or a whole "CATEGORIE"; "*": every asset) */
  assets: string[];
  /** a built-in sheet never linked by hand: for the asset types whose sheet it is (by the type of the asset) */
  auto: boolean };

/** The sheet of an inspection given with "the standard sheet" (UVALO's of the type, in the CRM app the VALUEFY model). */
export const STD = "std";

const isType = (t: string | null | undefined): t is SheetType => SHEET_TYPES.some(([k]) => k === t);

/** Every sheet: the built-in ones first (with the name the firm gave them), then the firm's own (deleted ones only on request). */
export async function templateList(db: D1Database, withDeleted = false): Promise<TplInfo[]> {
  type M = { key: string; name: string | null; base: string; deleted_at: string | null; asset_types: string | null };
  const { results } = await db.prepare("SELECT key, name, base, deleted_at, asset_types FROM insp_template_meta ORDER BY created_at")
    .all<M>().catch(() => ({ results: [] as M[] }));
  const meta = new Map(results.map((r) => [r.key, r]));
  const assets = (r?: M) => { try { const v: unknown = JSON.parse(r?.asset_types ?? "[]"); return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []; } catch { return []; } };
  const nomen = ASSET_CATEGORIES.map(([c, , types]): [string, string[]] => [c, types]);
  const builtin = SHEET_TYPES.map(([t, label]): TplInfo => {
    const m = meta.get(t), auto = m?.asset_types == null;
    return { key: t, name: m?.name?.trim() || label, base: t, builtin: true, deleted: !!m?.deleted_at, assets: auto ? defaultSheetAssets(t, nomen) : assets(m), auto };
  });
  const own = results.filter((r) => !isType(r.key) && isType(r.base))
    .map((r): TplInfo => ({ key: r.key, name: r.name?.trim() || "Fișă fără nume", base: r.base as SheetType, builtin: false, deleted: !!r.deleted_at, assets: assets(r), auto: false }));
  return [...builtin, ...own].filter((x) => withDeleted || !x.deleted);
}

/** The sheet an inspection uses: the one it was given with; null for the standard sheet; older inspections: the sheet of their type. */
export const tplKey = (i: { template?: string | null; sheet_type?: string | null }) => (i.template === STD ? null : i.template || i.sheet_type || "apartament");

/** Whether a sheet is meant for an asset: "every asset", its type or its whole category; a built-in sheet never linked by hand:
 * the assets whose sheet it is (also types not in the list of asset types). */
export const sheetFits = (x: TplInfo, a: { category: string | null; type: string | null }) =>
  x.auto ? (a.category ?? "").toUpperCase() !== "BUN MOBIL" && guessSheetType(a.category, a.type) === x.base
    : !x.assets.length || x.assets.includes(ALL_ASSETS) || x.assets.includes(`${a.category ?? ""}|${a.type ?? ""}`) || (!!a.category && x.assets.includes(a.category));

/** The built-in type behind a key (a built-in key is its own type). */
export const baseOfKey = (list: TplInfo[], key: string | null | undefined): SheetType =>
  isType(key) ? key : list.find((x) => x.key === key)?.base ?? "apartament";

/** The name of each sheet, by key (deleted ones included, for the inspections that used them). */
export const templateNames = async (db: D1Database): Promise<Record<string, string>> =>
  ({ ...Object.fromEntries((await templateList(db, true)).map((x) => [x.key, x.name])), [STD]: "Fișa standard" });

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

/**
 * A new sheet: `from` = "blank" (one empty group), "model:<type>" (the VALUEFY model of a type) or a sheet's key (a copy of
 * its questions). `base`: the built-in type behind it (CRM columns, rooms, required photos), for a blank sheet.
 */
export async function createTemplate(db: D1Database, name: string, from: string, base: SheetType, assets: string[], userId: string) {
  let tpl: Template, type: SheetType = base;
  if (from === "blank") tpl = [{ id: `g_${crypto.randomUUID().slice(0, 5)}`, title: "Date generale", custom: true, questions: [] }];
  else if (from.startsWith("model:") && isType(from.slice(6))) { type = from.slice(6) as SheetType; tpl = baseTemplate(type); }
  else {
    const src = (await templateList(db)).find((x) => x.key === from);
    if (!src) return null;
    type = src.base;
    tpl = (await templateOf(db, src.key, src.base)).tpl;
  }
  const key = `c-${crypto.randomUUID().slice(0, 8)}`;
  await db.prepare("INSERT INTO insp_template_meta (key, name, base, created_at, created_by, asset_types) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(key, name, type, now(), userId, JSON.stringify(assets)).run();
  await saveTemplate(db, key, tpl, userId);
  return { key, base: type };
}

export const setTemplateAssets = (db: D1Database, key: string, base: SheetType, assets: string[]) =>
  db.prepare("INSERT INTO insp_template_meta (key, base, created_at, asset_types) VALUES (?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET asset_types = excluded.asset_types")
    .bind(key, base, now(), JSON.stringify(assets)).run();

export async function renameTemplate(db: D1Database, key: string, base: SheetType, name: string) {
  await db.prepare("INSERT INTO insp_template_meta (key, name, base, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET name = excluded.name")
    .bind(key, name, base, now()).run();
}

/** Takes a sheet off the list (inspections that used it keep it); a built-in one goes back to the VALUEFY model for them. */
export async function removeTemplate(db: D1Database, key: string, base: SheetType) {
  await db.prepare("INSERT INTO insp_template_meta (key, base, created_at, deleted_at) VALUES (?1, ?2, ?3, ?3) ON CONFLICT(key) DO UPDATE SET deleted_at = excluded.deleted_at")
    .bind(key, base, now()).run();
  if (isType(key)) await saveTemplate(db, key, null, "");
}
