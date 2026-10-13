// Server-only: deletes some rows and everything that cannot exist without them, following the foreign keys of the
// schema (read at run time, so new tables are covered). Rows that only point to a deleted row lose that link.
// The rows are collected in glide_purge first (a scratch table), then deleted in one transaction; files they
// kept in R2 are deleted afterwards.
import { bucket } from "./orders";

type Ref = { table: string; col: string; parent: string; pcol: string; notnull: boolean };
export type Seed = { table: string; where: string; binds?: (string | number | null)[] };
export type CascadeOpts = {
  seeds: Seed[];
  /** Optional links that still make no sense without their parent ("table.col"). */
  hard?: Set<string>;
  /** Tables never deleted from (accounts…). */
  keep?: Set<string>;
  /** Tables whose rows stay while a surviving row still points to them (shared clients, framework contracts…). */
  protect?: Set<string>;
};

const SKIP = /^(sqlite_|_cf_|d1_|glide_purge$|glide_files$)/;
const EXTRA: Ref[] = [
  { table: "orders", col: "referral_order_id", parent: "orders", pcol: "id", notnull: false },
  { table: "report_documents", col: "asset_id", parent: "assets", pcol: "id", notnull: false },
];
const q = (n: string) => `"${n.replace(/"/g, "")}"`;
const purged = (t: string) => `SELECT rid FROM glide_purge WHERE tbl = '${t}'`;

async function schema(db: D1Database, hard: Set<string>) {
  const { results } = await db.prepare("PRAGMA table_list").all<{ schema: string; name: string; type: string }>();
  const tables = results.filter((t) => t.schema === "main" && t.type === "table" && !SKIP.test(t.name)).map((t) => t.name);
  const refs: Ref[] = [...EXTRA];
  const r2: string[] = [];
  for (const t of tables) {
    const [cols, fks] = await Promise.all([
      db.prepare(`PRAGMA table_info(${q(t)})`).all<{ name: string; notnull: number }>(),
      db.prepare(`PRAGMA foreign_key_list(${q(t)})`).all<{ table: string; from: string; to: string | null }>(),
    ]);
    if (cols.results.some((c) => c.name === "r2_key")) r2.push(t);
    for (const f of fks.results) {
      const notnull = !!cols.results.find((c) => c.name === f.from)?.notnull || hard.has(`${t}.${f.from}`);
      refs.push({ table: t, col: f.from, parent: f.table, pcol: f.to ?? "id", notnull });
    }
  }
  for (const r of refs) if (hard.has(`${r.table}.${r.col}`)) r.notnull = true;
  return { refs, r2 };
}

async function collect(db: D1Database, o: CascadeOpts) {
  const keep = o.keep ?? new Set<string>(), protect = o.protect ?? new Set<string>();
  const s = await schema(db, o.hard ?? new Set());
  await db.batch([
    db.prepare("DELETE FROM glide_purge"),
    ...o.seeds.map((x) => db.prepare(`INSERT OR IGNORE INTO glide_purge (tbl, rid) SELECT '${x.table}', rowid FROM ${q(x.table)} WHERE ${x.where}`).bind(...(x.binds ?? []))),
  ]);
  const hard = s.refs.filter((r) => r.notnull && !keep.has(r.table));
  const rescue = s.refs.filter((r) => protect.has(r.parent));
  // Protected rows still used by a row that stays are kept; then the children that need a deleted row go too.
  const fix = async (stmts: () => D1PreparedStatement[]) => {
    for (let pass = 0; pass < 12; pass++) {
      const list = stmts();
      if (!list.length) return;
      const res = await db.batch(list);
      if (!res.some((x) => (x.meta?.changes ?? 0) > 0)) return;
    }
  };
  await fix(() => rescue.map((r) => db.prepare(
    `DELETE FROM glide_purge WHERE tbl = '${r.parent}' AND rid IN (SELECT rowid FROM ${q(r.parent)} WHERE ${q(r.pcol)} IN
      (SELECT ${q(r.col)} FROM ${q(r.table)} WHERE ${q(r.col)} IS NOT NULL AND rowid NOT IN (${purged(r.table)})))`,
  )));
  await fix(() => hard.map((r) => db.prepare(
    `INSERT OR IGNORE INTO glide_purge (tbl, rid) SELECT '${r.table}', rowid FROM ${q(r.table)}
      WHERE ${q(r.col)} IN (SELECT ${q(r.pcol)} FROM ${q(r.parent)} WHERE rowid IN (${purged(r.parent)}))`,
  )));
  return s;
}

const softWhere = (r: Ref) =>
  `${q(r.col)} IN (SELECT ${q(r.pcol)} FROM ${q(r.parent)} WHERE rowid IN (${purged(r.parent)})) AND rowid NOT IN (${purged(r.table)})`;

/** What would be deleted: rows per table (nothing is deleted). */
export async function cascadePlan(db: D1Database, o: CascadeOpts) {
  await collect(db, o);
  const { results } = await db.prepare("SELECT tbl, COUNT(*) AS n FROM glide_purge GROUP BY tbl").all<{ tbl: string; n: number }>();
  await db.prepare("DELETE FROM glide_purge").run();
  return Object.fromEntries(results.map((r) => [r.tbl, r.n])) as Record<string, number>;
}

/** Deletes the rows in one transaction, then their files in R2. Returns the rows deleted per table. */
export async function cascadeRun(db: D1Database, o: CascadeOpts) {
  const s = await collect(db, o);
  const { results } = await db.prepare("SELECT tbl, COUNT(*) AS n FROM glide_purge GROUP BY tbl").all<{ tbl: string; n: number }>();
  const keys: string[] = [];
  for (const t of s.r2.filter((t) => results.some((r) => r.tbl === t))) {
    const k = await db.prepare(`SELECT r2_key FROM ${q(t)} WHERE r2_key IS NOT NULL AND r2_key <> '' AND rowid IN (${purged(t)})`).all<{ r2_key: string }>();
    keys.push(...k.results.map((x) => x.r2_key));
  }
  await db.batch([
    db.prepare("PRAGMA defer_foreign_keys = ON"),
    ...s.refs.filter((r) => !r.notnull).map((r) => db.prepare(`UPDATE ${q(r.table)} SET ${q(r.col)} = NULL WHERE ${softWhere(r)}`)),
    ...results.map((r) => db.prepare(`DELETE FROM ${q(r.tbl)} WHERE rowid IN (${purged(r.tbl)})`)),
    db.prepare("DELETE FROM glide_purge"),
  ]);
  const r2 = keys.length ? await bucket() : null;
  for (let i = 0; r2 && i < keys.length; i += 500) await r2.delete(keys.slice(i, i + 500)).catch(() => {});
  return Object.fromEntries(results.map((r) => [r.tbl, r.n])) as Record<string, number>;
}
