// Server-only: which clients, orders and contracts a user works on (Setări → Permisiuni, „Pe ce date”):
// all, the ones they created, or the ones behind reports where they are main evaluator or verifier.
import { can, leadSql, scopeOf, type WithPerms } from "./perms";
import { accreditedSql } from "./accreditations";

type Mod = "clients" | "orders" | "contracts";
type Viewer = WithPerms & { id: string };
export type ScopeFilter = { sql: string; binds: string[] } | null;

const LINK: Record<Mod, (a: string) => string> = {
  clients: (a) => `${a}.client_id`,
  orders: (a) => `${a}.order_id`,
  contracts: (a) => `${a}.contract_id`,
};

/** A WHERE condition on the table aliased `alias` (entities / orders / contracts), or null for everything. */
export function scopeFilter(u: Viewer, mod: Mod, alias: string): ScopeFilter {
  const s = scopeOf(u, mod);
  if (s === "all") return null;
  if (s === "own") {
    if (mod === "contracts") return { sql: "0", binds: [] };
    // Accredited on framework contracts (agreeri): the bank's orders on those contracts too.
    if (mod === "orders" && can(u, "orders.contract")) return { sql: `(${alias}.created_by = ? OR ${accreditedSql(alias)})`, binds: [u.id, u.id] };
    return { sql: `${alias}.created_by = ?`, binds: [u.id] };
  }
  const lead = `EXISTS (SELECT 1 FROM reports sr WHERE ${LINK[mod]("sr")} = ${alias}.id AND ${leadSql("sr.id")})`;
  // Accredited (agreeri): the bank's orders on those contracts as well, before they have a report.
  if (mod === "orders" && can(u, "orders.contract")) return { sql: `(${lead} OR ${accreditedSql(alias)})`, binds: [u.id, u.id] };
  return { sql: lead, binds: [u.id] };
}

const TABLE: Record<Mod, string> = { clients: "entities", orders: "orders", contracts: "contracts" };

/** Whether one record is in the user's scope. */
export async function inScope(db: D1Database, u: Viewer, mod: Mod, id: string) {
  const f = scopeFilter(u, mod, "x");
  if (!f) return true;
  return !!(await db.prepare(`SELECT 1 AS ok FROM ${TABLE[mod]} x WHERE x.id = ? AND ${f.sql}`).bind(id, ...f.binds).first());
}
