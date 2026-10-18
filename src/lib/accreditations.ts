// Server-only: agreeri — team members accredited by a bank on a framework contract. The accreditation is a permission
// of its own, on top of the role: on those contracts the person registers the bank's orders (Lucrare nouă), processes
// them and runs their reports, whatever the Comenzi module says for their role.
import { now } from "./db";

/** What an accreditation adds to the permissions of the role ("orders.contract": the orders of those contracts). */
export const ACCREDITED_PERMS = ["orders", "orders.A", "orders.E", "orders:process", "orders.contract"] as const;

/** SQL: the order (table aliased `alias`) is on a framework contract the user is accredited on. Binds the user id once. */
export const accreditedSql = (alias: string) =>
  `${alias}.contract_id IN (SELECT ca.contract_id FROM contract_accreditations ca WHERE ca.user_id = ?)`;

/** The open framework contracts a user is accredited on (ids). */
export async function accreditedContracts(db: D1Database, userId: string) {
  const { results } = await db.prepare(`SELECT ca.contract_id AS id FROM contract_accreditations ca JOIN contracts k ON k.id = ca.contract_id
      WHERE ca.user_id = ? AND k.kind = 'framework' AND k.closed_on IS NULL`).bind(userId).all<{ id: string }>().catch(() => ({ results: [] as { id: string }[] }));
  return results.map((r) => r.id);
}

/** The permissions an accreditation gives a user (none without one on an open contract). */
export async function accreditationPerms(db: D1Database, userId: string): Promise<string[]> {
  return (await accreditedContracts(db, userId)).length ? [...ACCREDITED_PERMS] : [];
}

/** The accredited members of a contract. */
export async function accreditedUsers(db: D1Database, contractId: string) {
  const { results } = await db.prepare(`SELECT u.id, COALESCE(NULLIF(u.name, ''), u.email) AS name, u.role, ca.created_at
      FROM contract_accreditations ca JOIN users u ON u.id = ca.user_id WHERE ca.contract_id = ? AND u.status <> 'deleted' ORDER BY name`)
    .bind(contractId).all<{ id: string; name: string; role: string; created_at: string }>().catch(() => ({ results: [] as { id: string; name: string; role: string; created_at: string }[] }));
  return results;
}

/** Sets the contracts a user is accredited on (the whole list). Returns what was added and removed. */
export async function setAccreditations(db: D1Database, userId: string, contractIds: string[], actor: string) {
  const before = new Set((await db.prepare("SELECT contract_id FROM contract_accreditations WHERE user_id = ?").bind(userId).all<{ contract_id: string }>()).results.map((r) => r.contract_id));
  const wanted = new Set(contractIds);
  const added = [...wanted].filter((c) => !before.has(c)), removed = [...before].filter((c) => !wanted.has(c));
  const t = now();
  const writes = [
    ...added.map((c) => db.prepare("INSERT OR IGNORE INTO contract_accreditations (contract_id, user_id, created_at, created_by) VALUES (?, ?, ?, ?)").bind(c, userId, t, actor)),
    ...removed.map((c) => db.prepare("DELETE FROM contract_accreditations WHERE contract_id = ? AND user_id = ?").bind(c, userId)),
  ];
  if (writes.length) await db.batch(writes);
  return { added, removed };
}
