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

/** Upserts one batch of rows into a table. Returns how many rows were written. */
export async function importRows(db: D1Database, table: string, rows: Row[], actor: string) {
  if (!(TABLES as readonly string[]).includes(table)) throw new Error("Tabel necunoscut.");
  const name = table as TableName;
  if (name === "partners") { await importPartners(db, rows, actor); return rows.length; }
  const resolve = await resolver(db);
  if (name === "users") { await importUsers(db, rows, actor, resolve); return rows.length; }

  const cols = await columns(db, name);
  const statements = rows.map((r) => {
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
      : `${k} = excluded.${k}`);
    return db.prepare(`${insert} ON CONFLICT(glide_id) DO UPDATE SET ${sets.join(", ")}`).bind(...values);
  });
  if (statements.length) await db.batch(statements);
  return rows.length;
}
