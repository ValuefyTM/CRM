// Server-only: the permissions matrix (setting "perms") and the reports a team member may see.
import { now } from "./db";
import { can, cleanMatrix, type Matrix, type WithPerms } from "./perms";

export async function getMatrix(db: D1Database): Promise<Matrix> {
  const row = await db.prepare("SELECT value FROM settings WHERE key = 'perms'").first<{ value: string }>().catch(() => null);
  try {
    return cleanMatrix(row ? JSON.parse(row.value) : null);
  } catch {
    return cleanMatrix(null);
  }
}

export async function saveMatrix(db: D1Database, actor: string, raw: unknown) {
  const m = cleanMatrix(raw);
  // Administrators keep "admin": otherwise nobody but the owner could undo the change.
  if (!m.admin.includes("admin")) m.admin.push("admin");
  await db.prepare("INSERT INTO settings (key, value, updated_at, updated_by) VALUES ('perms', ?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by")
    .bind(JSON.stringify(m), now(), actor).run();
  return m;
}

type Viewer = WithPerms & { id: string };

/** The roles a user has in a report's team. */
export async function reportRoles(db: D1Database, reportId: string, userId: string) {
  const { results } = await db.prepare("SELECT role FROM report_members WHERE report_id = ? AND user_id = ?").bind(reportId, userId).all<{ role: string }>();
  return results.map((r) => r.role);
}

/** Finished: done or delivered. */
export const isFinished = (r: { status: string; delivered_at?: string | null }) => r.status === "done" || !!r.delivered_at;

/**
 * What a user may do on a report: see it (team members while it is worked on, then the main evaluator and the
 * verifier; everything with "reports.all"), work on it (documents, assets, inspections) and lead it (status, team).
 */
export async function reportAccess(db: D1Database, u: Viewer, r: { id: string; status: string; delivered_at?: string | null }) {
  const roles = await reportRoles(db, r.id, u.id);
  const lead = roles.includes("evaluator");
  const member = roles.length > 0;
  const all = can(u, "reports.all");
  const view = all || (member && (!isFinished(r) || lead || roles.includes("verifier")));
  return { view, work: view && (all || member), lead: view && (lead || can(u, "team")), member, roles };
}

/** SQL condition (on reports r) for the reports a user without "reports.all" sees; binds the user id. */
export const MY_REPORTS_SQL = `EXISTS (SELECT 1 FROM report_members m WHERE m.report_id = r.id AND m.user_id = ? AND
  (m.role IN ('evaluator', 'verifier') OR (r.status <> 'done' AND r.delivered_at IS NULL)))`;

/** Same, for a report id column of another table (properties, search…). */
export const reportVisibleSql = (col: string) => `EXISTS (SELECT 1 FROM reports r JOIN report_members m ON m.report_id = r.id
  WHERE r.id = ${col} AND m.user_id = ? AND (m.role IN ('evaluator', 'verifier') OR (r.status <> 'done' AND r.delivered_at IS NULL)))`;
