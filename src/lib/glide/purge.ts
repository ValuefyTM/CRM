// Server-only: deletes every row that came from Glide (glide_id set), so that a clean export can be imported again.
// Accounts (users, partner firms) stay. Rows made in the CRM that cannot live without a deleted row (a team member of
// an imported report, a photo of an imported inspection…) go with it; the other links to deleted rows become empty.
// The rows are collected in glide_purge first and deleted in one transaction.
import { FILE_COLUMNS } from "../files";
import { TABLE_LABEL, TABLES, type TableName } from "./transform";

const KEEP = new Set(["users", "partners"]);
// Clients, banks, firms, contracts and properties still used by rows made in the CRM stay (with their Glide id, so a
// new import updates them instead of making copies).
const PROTECT = new Set(["entities", "contracts", "collaborations", "statements", "crm_properties"]);
// Optional links that still make no sense without their parent: the work done in the app on an imported inspection.
const HARD = new Set(["inspection_sheets.inspection_id", "property_features.inspection_id", "property_features.sheet_id", "inspection_photos.sheet_id"]);
const SKIP = /^(sqlite_|_cf_|d1_|glide_purge$|glide_files$)/;
// References the schema does not declare.
const EXTRA: Ref[] = [
  { table: "orders", col: "referral_order_id", parent: "orders", pcol: "id", notnull: false },
  { table: "report_documents", col: "asset_id", parent: "assets", pcol: "id", notnull: false },
];

const LABEL: Record<string, string> = {
  report_documents: "Documente încărcate la rapoarte", report_members: "Echipa rapoartelor", inspection_photos: "Fotografii din aplicația de inspecții",
  inspection_schedule_log: "Istoricul programărilor", property_features: "Caracteristici din fișele de inspecție", offers: "Oferte",
  order_documents: "Documente încărcate la comenzi", order_leads: "Legături comenzi – cereri site", bank_emails: "Emailuri de la bănci",
  invoices: "Facturi", entity_contacts: "Persoane de contact",
};

type Ref = { table: string; col: string; parent: string; pcol: string; notnull: boolean };
export type PurgePlan = {
  tables: { table: string; label: string; glide: number; crm: number }[];
  kept: { table: string; label: string; n: number }[];
  cleared: { table: string; col: string; n: number }[];
  files: number;
};

const q = (n: string) => `"${n.replace(/"/g, "")}"`;
const purged = (t: string) => `SELECT rid FROM glide_purge WHERE tbl = '${t}'`;

async function schema(db: D1Database) {
  const { results } = await db.prepare("PRAGMA table_list").all<{ schema: string; name: string; type: string }>();
  const tables = results.filter((t) => t.schema === "main" && t.type === "table" && !SKIP.test(t.name)).map((t) => t.name);
  const glide: string[] = [];
  const refs: Ref[] = [...EXTRA];
  for (const t of tables) {
    const [cols, fks] = await Promise.all([
      db.prepare(`PRAGMA table_info(${q(t)})`).all<{ name: string; notnull: number }>(),
      db.prepare(`PRAGMA foreign_key_list(${q(t)})`).all<{ table: string; from: string; to: string | null }>(),
    ]);
    if (cols.results.some((c) => c.name === "glide_id") && !KEEP.has(t)) glide.push(t);
    for (const f of fks.results) {
      const notnull = !!cols.results.find((c) => c.name === f.from)?.notnull || HARD.has(`${t}.${f.from}`);
      refs.push({ table: t, col: f.from, parent: f.table, pcol: f.to ?? "id", notnull });
    }
  }
  return { tables, glide, refs };
}

/** Fills glide_purge: the Glide rows, then (until nothing changes) the rows that need one of them. */
async function collect(db: D1Database) {
  const s = await schema(db);
  await db.batch([
    db.prepare("DELETE FROM glide_purge"),
    ...s.glide.map((t) => db.prepare(`INSERT INTO glide_purge (tbl, rid) SELECT '${t}', rowid FROM ${q(t)} WHERE glide_id IS NOT NULL`)),
  ]);
  const keep = s.refs.filter((r) => PROTECT.has(r.parent));
  for (let pass = 0; pass < 12; pass++) {
    const res = await db.batch(keep.map((r) => db.prepare(
      `DELETE FROM glide_purge WHERE tbl = '${r.parent}' AND rid IN (SELECT rowid FROM ${q(r.parent)} WHERE ${q(r.pcol)} IN
        (SELECT ${q(r.col)} FROM ${q(r.table)} WHERE ${q(r.col)} IS NOT NULL AND rowid NOT IN (${purged(r.table)})))`,
    )));
    if (!res.some((x) => (x.meta?.changes ?? 0) > 0)) break;
  }
  const hard = s.refs.filter((r) => r.notnull && !KEEP.has(r.table));
  for (let pass = 0; pass < 12; pass++) {
    const res = await db.batch(hard.map((r) => db.prepare(
      `INSERT OR IGNORE INTO glide_purge (tbl, rid) SELECT '${r.table}', rowid FROM ${q(r.table)}
        WHERE ${q(r.col)} IN (SELECT ${q(r.pcol)} FROM ${q(r.parent)} WHERE rowid IN (${purged(r.parent)}))`,
    )));
    if (!res.some((x) => (x.meta?.changes ?? 0) > 0)) break;
  }
  return s;
}

const soft = (s: Awaited<ReturnType<typeof schema>>) => s.refs.filter((r) => !r.notnull);
const softWhere = (r: Ref) =>
  `${q(r.col)} IN (SELECT ${q(r.pcol)} FROM ${q(r.parent)} WHERE rowid IN (${purged(r.parent)})) AND rowid NOT IN (${purged(r.table)})`;

/** What a deletion would remove (nothing is deleted). */
export async function purgePlan(db: D1Database): Promise<PurgePlan> {
  const s = await collect(db);
  const { results } = await db.prepare("SELECT tbl, COUNT(*) AS n FROM glide_purge GROUP BY tbl").all<{ tbl: string; n: number }>();
  const tables: PurgePlan["tables"] = [];
  for (const r of results) {
    const glide = s.glide.includes(r.tbl)
      ? (await db.prepare(`SELECT COUNT(*) AS n FROM ${q(r.tbl)} WHERE glide_id IS NOT NULL AND rowid IN (${purged(r.tbl)})`).first<{ n: number }>())?.n ?? 0
      : (TABLES as readonly string[]).includes(r.tbl) ? r.n : 0; // the report teams come from Glide too
    tables.push({ table: r.tbl, label: LABEL[r.tbl] ?? TABLE_LABEL[r.tbl as TableName] ?? r.tbl, glide, crm: r.n - glide });
  }
  const kept: PurgePlan["kept"] = [];
  for (const t of s.glide) {
    const k = (await db.prepare(`SELECT COUNT(*) AS n FROM ${q(t)} WHERE glide_id IS NOT NULL AND rowid NOT IN (${purged(t)})`).first<{ n: number }>())?.n ?? 0;
    if (k) kept.push({ table: t, label: TABLE_LABEL[t as TableName] ?? t, n: k });
  }
  const cleared: PurgePlan["cleared"] = [];
  for (const r of soft(s)) {
    const n = (await db.prepare(`SELECT COUNT(*) AS n FROM ${q(r.table)} WHERE ${softWhere(r)}`).first<{ n: number }>())?.n ?? 0;
    if (n) cleared.push({ table: r.table, col: r.col, n });
  }
  const files = await filesToKeep(db);
  await db.prepare("DELETE FROM glide_purge").run();
  return { tables: tables.sort((a, b) => b.glide + b.crm - (a.glide + a.crm)), kept, cleared, files };
}

async function filesToKeep(db: D1Database) {
  let n = 0;
  for (const [t, c] of FILE_COLUMNS) {
    const r = await db.prepare(`SELECT COUNT(*) AS n FROM ${q(t)} WHERE (${q(c)} LIKE 'r2:%' OR ${q(c)} LIKE 'lost:%') AND rowid IN (${purged(t)})`).first<{ n: number }>();
    n += r?.n ?? 0;
  }
  return n;
}

/** Deletes the Glide rows (and what depends on them) in one transaction. */
export async function purgeGlide(db: D1Database) {
  const s = await collect(db);
  const { results } = await db.prepare("SELECT tbl, COUNT(*) AS n FROM glide_purge GROUP BY tbl").all<{ tbl: string; n: number }>();
  await db.batch([
    db.prepare("PRAGMA defer_foreign_keys = ON"),
    // Files already in R2 are remembered for the next import.
    ...FILE_COLUMNS.map(([t, c]) => db.prepare(
      `INSERT OR REPLACE INTO glide_files (tbl, col, row_id, value) SELECT '${t}', '${c}', id, ${q(c)} FROM ${q(t)}
        WHERE (${q(c)} LIKE 'r2:%' OR ${q(c)} LIKE 'lost:%') AND rowid IN (${purged(t)})`,
    )),
    ...soft(s).map((r) => db.prepare(`UPDATE ${q(r.table)} SET ${q(r.col)} = NULL WHERE ${softWhere(r)}`)),
    ...results.map((r) => db.prepare(`DELETE FROM ${q(r.tbl)} WHERE rowid IN (${purged(r.tbl)})`)),
    db.prepare("DELETE FROM glide_purge"),
  ]);
  return results.reduce((n, r) => n + r.n, 0);
}
