// Server-only: writes rows prepared by transform.ts (Glide export) into D1. Idempotent: rows are matched on glide_id.
import { now, uuid } from "../db";
import { TABLES, type Row, type TableName } from "./transform";
import { FILE_COLUMNS } from "../files";

type Value = string | number | null;

/** Columns that exist in a table (anything else in the rows is ignored). */
async function columns(db: D1Database, table: TableName) {
  const { results } = await db.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>();
  return new Set(results.map((c) => c.name));
}

/** "g-usr-<glide id>" / "g-prt-<slug>" → the real id of the user / partner firm in the CRM (they may predate the import). */
async function resolver(db: D1Database) {
  const [u, p] = await Promise.all([
    db.prepare("SELECT id, glide_id FROM users WHERE glide_id IS NOT NULL").all<{ id: string; glide_id: string }>(),
    db.prepare("SELECT id, glide_id FROM partners WHERE glide_id IS NOT NULL").all<{ id: string; glide_id: string }>(),
  ]);
  const users = new Map(u.results.map((r) => [r.glide_id, r.id]));
  const partners = new Map(p.results.map((r) => [r.glide_id, r.id]));
  return (v: Value): Value => {
    if (typeof v !== "string") return v;
    if (v.startsWith("g-usr-")) return users.get(v.slice(6)) ?? null;
    if (v.startsWith("g-prt-")) return partners.get(`firm:${v.slice(6)}`) ?? null;
    return v;
  };
}

/** Partner firms: matched by Glide id, then by name (a firm created by hand in the CRM is reused). */
async function importPartners(db: D1Database, rows: Row[], actor: string) {
  for (const r of rows) {
    const byGlide = await db.prepare("SELECT id FROM partners WHERE glide_id = ?").bind(r.glide_id).first<{ id: string }>();
    if (byGlide) { await db.prepare("UPDATE partners SET kind = ?, updated_at = ? WHERE id = ?").bind(r.kind, now(), byGlide.id).run(); continue; }
    const byName = await db.prepare("SELECT id FROM partners WHERE lower(name) = lower(?) AND glide_id IS NULL").bind(r.name).first<{ id: string }>();
    if (byName) await db.prepare("UPDATE partners SET glide_id = ? WHERE id = ?").bind(r.glide_id, byName.id).run();
    else await db.prepare("INSERT INTO partners (id, glide_id, name, kind, status, created_by) VALUES (?, ?, ?, ?, 'active', ?)").bind(r.id, r.glide_id, r.name, r.kind, actor).run();
  }
}

/**
 * People: matched by Glide id, then by email (accounts that already exist keep their role and status; only empty
 * details are filled in). New accounts are created as "invited" without sending any email.
 */
async function importUsers(db: D1Database, rows: Row[], actor: string, resolve: (v: Value) => Value) {
  const fill = ["name", "phone", "anevar_no", "specializations", "coverage", "share_evaluator", "share_verifier", "engagement"];
  for (const r of rows) {
    const existing =
      (await db.prepare("SELECT id FROM users WHERE glide_id = ?").bind(r.glide_id).first<{ id: string }>()) ??
      (await db.prepare("SELECT id FROM users WHERE kind = ? AND email = ?").bind(r.kind, r.email).first<{ id: string }>());
    const partner = resolve(r.partner_id ?? null);
    if (existing) {
      const sets = fill.filter((k) => r[k] !== undefined && r[k] !== null).map((k) => `${k} = COALESCE(NULLIF(${k}, ''), ?)`);
      await db
        .prepare(`UPDATE users SET glide_id = ?${sets.length ? ", " + sets.join(", ") : ""}, updated_at = ? WHERE id = ?`)
        .bind(r.glide_id, ...fill.filter((k) => r[k] !== undefined && r[k] !== null).map((k) => r[k]), now(), existing.id)
        .run();
      continue;
    }
    const role = r.role === "owner" ? "admin" : r.role; // owners come only from CRM_OWNER_EMAILS
    await db
      .prepare(
        `INSERT INTO users (id, glide_id, kind, email, name, phone, role, duties, status, partner_id, engagement, anevar_no, specializations, coverage,
          share_evaluator, share_verifier, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'invited', ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(r.id ?? uuid(), r.glide_id, r.kind, r.email, r.name ?? "", r.phone ?? null, role, role === "evaluator" || role === "inspector" ? role : null, partner, r.engagement ?? null, r.anevar_no ?? null,
        r.specializations ?? null, r.coverage ?? null, r.share_evaluator ?? null, r.share_verifier ?? null, actor)
      .run();
  }
}

/** Columns that point to another table: checked before writing, and never emptied by an import. */
const REFS: Record<string, string> = {
  client_id: "entities", recipient_id: "entities", issuer_id: "entities", bank_id: "entities", firm_id: "entities",
  order_id: "orders", referral_order_id: "orders", contract_id: "contracts", collaboration_id: "collaborations", statement_id: "statements",
  report_id: "reports", property_id: "crm_properties", asset_id: "assets", inspection_id: "inspections",
};

/** People and dates set in the CRM that an export without them must not clear. */
const KEEP = new Set(["inspector_id", "referral_user_id", "scheduled_at", "done_at"]);

/**
 * References to rows of other tables that do not exist in the CRM become null (a partial export may name clients,
 * banks or orders that were never imported) — and a null never overwrites a link already saved (see importRows).
 */
async function checkRefs(db: D1Database, table: TableName, rows: Row[], cols: Set<string>) {
  for (const [col, target] of Object.entries(REFS)) {
    if (!cols.has(col) || target === table) continue;
    const ids = [...new Set(rows.map((r) => r[col]).filter((v): v is string => typeof v === "string" && v !== ""))];
    if (!ids.length) continue;
    const found = new Set<string>();
    for (let i = 0; i < ids.length; i += 90) {
      const part = ids.slice(i, i + 90);
      const { results } = await db.prepare(`SELECT id FROM ${target} WHERE id IN (${part.map(() => "?").join(", ")})`).bind(...part).all<{ id: string }>();
      for (const r of results) found.add(r.id);
    }
    for (const r of rows) if (typeof r[col] === "string" && !found.has(r[col] as string)) r[col] = null;
  }
}

/** Files copied into R2 before the Glide data was deleted (see purge.ts) are linked again instead of the Glide URL. */
async function relinkFiles(db: D1Database, table: TableName, rows: Row[]) {
  const cols = FILE_COLUMNS.filter(([t]) => t === table).map(([, c]) => c);
  const ids = rows.map((r) => r.id).filter((v): v is string => typeof v === "string");
  if (!cols.length || !ids.length) return;
  const saved = new Map<string, string>();
  for (let i = 0; i < ids.length; i += 90) {
    const part = ids.slice(i, i + 90);
    const { results } = await db.prepare(`SELECT col, row_id, value FROM glide_files WHERE tbl = ? AND row_id IN (${part.map(() => "?").join(", ")})`)
      .bind(table, ...part).all<{ col: string; row_id: string; value: string }>();
    for (const f of results) saved.set(`${f.row_id}|${f.col}`, f.value);
  }
  for (const r of rows) for (const c of cols) {
    const v = saved.get(`${r.id}|${c}`);
    if (v && r[c]) r[c] = v;
  }
}

/** Upserts one batch of rows into a table. Returns how many rows were written. */
export async function importRows(db: D1Database, table: string, rows: Row[], actor: string) {
  if (!(TABLES as readonly string[]).includes(table)) throw new Error("Tabel necunoscut.");
  const name = table as TableName;
  if (name === "partners") { await importPartners(db, rows, actor); return rows.length; }
  const resolve = await resolver(db);
  if (name === "users") { await importUsers(db, rows, actor, resolve); return rows.length; }

  const cols = await columns(db, name);
  await checkRefs(db, name, rows, cols);
  await relinkFiles(db, name, rows);
  // A team member of a report that is not in the CRM cannot be saved.
  const list = name === "report_members" ? rows.filter((r) => r.report_id && resolve(r.user_id ?? null)) : rows;
  const statements = list.map((r) => {
    const keys = Object.keys(r).filter((k) => cols.has(k));
    const values = keys.map((k) => resolve(r[k]));
    const insert = `INSERT INTO ${name} (${keys.join(", ")}) VALUES (${keys.map(() => "?").join(", ")})`;
    if (name === "report_members") return db.prepare(`${insert} ON CONFLICT DO NOTHING`).bind(...values);
    // Glide is the source for imported rows; only "seen in the CRM" is kept once set.
    const update = keys.filter((k) => !["id", "glide_id", "viewed_by"].includes(k));
    if (cols.has("updated_at") && !update.includes("updated_at")) update.push("updated_at");
    const sets = update.map((k) =>
      k === "updated_at" ? `updated_at = '${now()}'`
      : k === "viewed_at" ? "viewed_at = COALESCE(viewed_at, excluded.viewed_at)"
      : FILE_COLUMNS.some(([t, c]) => t === name && c === k) ? `${k} = CASE WHEN ${k} LIKE 'r2:%' OR ${k} LIKE 'lost:%' THEN ${k} ELSE excluded.${k} END` // files already moved to R2 stay
      // A link (client, bank, issuer, order…) missing from this export keeps the one already saved.
      : REFS[k] || KEEP.has(k) ? `${k} = COALESCE(excluded.${k}, ${k})`
      // An inspection done in the CRM app stays done.
      : name === "inspections" && k === "status" ? "status = CASE WHEN status = 'done' AND excluded.status <> 'cancelled' THEN status ELSE excluded.status END"
      : `${k} = excluded.${k}`);
    return db.prepare(`${insert} ON CONFLICT(glide_id) DO UPDATE SET ${sets.join(", ")}`).bind(...values);
  });
  if (statements.length) await db.batch(statements);
  return rows.length;
}
