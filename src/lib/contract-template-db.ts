// Server-only: the contract model saved in settings ("contract_template"); the default model until it is edited.
import { audit } from "./auth";
import { now } from "./db";
import { cleanTemplate, DEFAULT_TEMPLATE, type ContractTemplate } from "./contract-template";

const KEY = "contract_template";

export async function getContractTemplate(db: D1Database): Promise<ContractTemplate & { custom: boolean; updated_at: string | null; updated_by: string | null }> {
  const row = await db.prepare(`SELECT s.value, s.updated_at, COALESCE(NULLIF(u.name, ''), u.email) AS who FROM settings s LEFT JOIN users u ON u.id = s.updated_by WHERE s.key = ?`)
    .bind(KEY).first<{ value: string; updated_at: string | null; who: string | null }>().catch(() => null);
  if (!row) return { ...DEFAULT_TEMPLATE, custom: false, updated_at: null, updated_by: null };
  let raw: unknown = null;
  try { raw = JSON.parse(row.value); } catch { /* broken: the default */ }
  return { ...cleanTemplate(raw), custom: true, updated_at: row.updated_at, updated_by: row.who };
}

/** Only the three parts (no metadata): what is stored in a signed contract's snapshot. */
export const templateParts = (t: ContractTemplate): ContractTemplate => ({ general: t.general, annex1: t.annex1, annex2: t.annex2 });

export async function saveContractTemplate(db: D1Database, actor: { id: string }, raw: unknown) {
  const t = cleanTemplate(raw);
  await db.prepare("INSERT INTO settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by")
    .bind(KEY, JSON.stringify(t), now(), actor.id).run();
  await audit(db, `user:${actor.id}`, "settings.contract_template", "settings", KEY, "modelul de contract a fost modificat");
  return t;
}

export async function resetContractTemplate(db: D1Database, actor: { id: string }) {
  await db.prepare("DELETE FROM settings WHERE key = ?").bind(KEY).run();
  await audit(db, `user:${actor.id}`, "settings.contract_template", "settings", KEY, "modelul standard de contract a fost restaurat");
}
