// Server-only: the firm's inspection sheet templates (table insp_templates).
import { now } from "./db";
import { SHEET_TYPES, type SheetType } from "./insp-forms";
import { effectiveForms, mergeTemplate, type Template } from "./insp-templates";

export async function savedTemplates(db: D1Database): Promise<Partial<Record<SheetType, Template>>> {
  const { results } = await db.prepare("SELECT sheet_type, groups FROM insp_templates").all<{ sheet_type: string; groups: string }>();
  const out: Partial<Record<SheetType, Template>> = {};
  for (const r of results) {
    if (!SHEET_TYPES.some(([t]) => t === r.sheet_type)) continue;
    try { out[r.sheet_type as SheetType] = JSON.parse(r.groups) as Template; } catch { /* broken row: built-in form */ }
  }
  return out;
}

/** The forms the inspectors fill in now, for every sheet type. */
export const currentForms = async (db: D1Database) => effectiveForms(await savedTemplates(db));

export async function templateOf(db: D1Database, t: SheetType) {
  const row = await db.prepare("SELECT groups, updated_at, updated_by FROM insp_templates WHERE sheet_type = ?").bind(t)
    .first<{ groups: string; updated_at: string; updated_by: string | null }>();
  let saved: Template | null = null;
  try { saved = row ? (JSON.parse(row.groups) as Template) : null; } catch { /* built-in */ }
  return { tpl: mergeTemplate(t, saved), custom: !!saved, updated_at: row?.updated_at ?? null };
}

export async function saveTemplate(db: D1Database, t: SheetType, tpl: Template | null, userId: string) {
  if (!tpl) await db.prepare("DELETE FROM insp_templates WHERE sheet_type = ?").bind(t).run();
  else await db.prepare(
    "INSERT INTO insp_templates (sheet_type, groups, updated_at, updated_by) VALUES (?, ?, ?, ?) ON CONFLICT(sheet_type) DO UPDATE SET groups = excluded.groups, updated_at = excluded.updated_at, updated_by = excluded.updated_by",
  ).bind(t, JSON.stringify(tpl), now(), userId).run();
}
