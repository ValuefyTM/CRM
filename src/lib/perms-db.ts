// Server-only: the permissions configuration (setting "perms"), and what a team member may do on a report.
import { now } from "./db";
import { can, cleanConfig, DEFAULT_CONFIG, TEAM_RIGHTS, type FeeView, type PermConfig, type TeamRight, type TeamRole, type WithPerms } from "./perms";

export async function getConfig(db: D1Database): Promise<PermConfig> {
  const row = await db.prepare("SELECT value FROM settings WHERE key = 'perms'").first<{ value: string }>().catch(() => null);
  try {
    const v = row ? JSON.parse(row.value) : null;
    // The first version kept a flat matrix ({ admin: [...], ... }): start again from the defaults.
    return cleanConfig(v && Array.isArray(v.roles) ? v : null);
  } catch {
    return cleanConfig(null);
  }
}

export async function saveConfig(db: D1Database, actor: string, raw: unknown) {
  const cfg = cleanConfig(raw);
  await db.prepare("INSERT INTO settings (key, value, updated_at, updated_by) VALUES ('perms', ?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by")
    .bind(JSON.stringify(cfg), now(), actor).run();
  return cfg;
}

type Viewer = WithPerms & { id: string };

/** The roles a user has in a report's team. */
export async function reportRoles(db: D1Database, reportId: string, userId: string) {
  const { results } = await db.prepare("SELECT role FROM report_members WHERE report_id = ? AND user_id = ?").bind(reportId, userId).all<{ role: string }>();
  return results.map((r) => r.role as TeamRole);
}

/** Finished: done or delivered. */
export const isFinished = (r: { status: string; delivered_at?: string | null }) => r.status === "done" || !!r.delivered_at;

export type ReportAccess = { view: boolean; can: Record<TeamRight, boolean>; fee: FeeView; roles: TeamRole[]; all: boolean };
const FEE_RANK: Record<FeeView, number> = { none: 0, share: 1, all: 2 };

/**
 * What a user may do on a report. With "Rapoarte: toate" the rights of the Rapoarte module apply on every report;
 * a team member also has the rights of their role(s) in the report (Setări → Permisiuni, echipa raportului) —
 * the widest of them when they have several. A finished report is seen by the team roles that have "after finishing".
 */
export async function reportAccess(db: D1Database, u: Viewer, r: { id: string; status: string; delivered_at?: string | null }, team?: PermConfig["team"]): Promise<ReportAccess> {
  const roles = await reportRoles(db, r.id, u.id);
  const t = team ?? (u as { team?: PermConfig["team"] }).team ?? (await getConfig(db)).team;
  const done = isFinished(r);
  const right: Record<string, boolean> = Object.fromEntries(TEAM_RIGHTS.map(([k]) => [k, false]));
  let fee: FeeView = "none";
  let view = false;
  for (const role of roles) {
    const row = t[role];
    if (!row || !row.r.includes(done ? "viewDone" : "view")) continue;
    view = true;
    for (const k of row.r) right[k] = true;
    if (FEE_RANK[row.fee] > FEE_RANK[fee]) fee = row.fee;
  }
  // "Rapoarte: unde e evaluator / verificator": the module's rights on the reports the user leads or verifies.
  const leads = roles.includes("evaluator") || roles.includes("verifier");
  const all = can(u, "reports.all") || (can(u, "reports.lead") && leads);
  if (all) {
    view = true;
    const edit = can(u, "reports.E");
    for (const k of ["edit", "assets", "docs", "schedule"] as const) right[k] ||= edit;
    right.docsDelete ||= can(u, "reports.D");
    right.status ||= can(u, "reports:status");
    right.verify ||= can(u, "reports:status");
    right.deliver ||= can(u, "reports:deliver");
    right.members ||= can(u, "reports:team");
    right.messages = true;
  }
  // The Onorarii module decides for everyone: all the amounts, or at most the user's own share.
  if (can(u, "fees.all") || (can(u, "fees.lead") && leads)) fee = "all";
  else if (fee === "all") fee = "share";
  if (!can(u, "fees") && !roles.length) fee = "none";
  if (!view) for (const k of Object.keys(right)) right[k] = false;
  return { view, can: right as Record<TeamRight, boolean>, fee, roles, all };
}

/**
 * SQL condition (on reports r) for the reports a user without "Rapoarte: toate" sees: in the team, with a team role
 * that sees reports while worked on / after finishing. Binds the user id once.
 */
export function myReportsSql(team: PermConfig["team"]) {
  const open = Object.entries(team).filter(([, v]) => v.r.includes("view")).map(([k]) => `'${k}'`);
  const done = Object.entries(team).filter(([, v]) => v.r.includes("viewDone")).map(([k]) => `'${k}'`);
  const inList = (l: string[]) => (l.length ? `m.role IN (${l.join(", ")})` : "0");
  return `EXISTS (SELECT 1 FROM report_members m WHERE m.report_id = r.id AND m.user_id = ? AND
    CASE WHEN r.status = 'done' OR r.delivered_at IS NOT NULL THEN ${inList(done)} ELSE ${inList(open)} END)`;
}

/** The reports condition for a signed-in user (their team matrix comes with currentUser). */
export const mySql = (u: { team?: PermConfig["team"] }) => myReportsSql(u.team ?? DEFAULT_CONFIG.team);

/** Same, for a report id column of another table (properties, search…). */
export const reportVisibleSql = (team: PermConfig["team"], col: string) =>
  `EXISTS (SELECT 1 FROM reports r WHERE r.id = ${col} AND ${myReportsSql(team)})`;

/** The share of a report's fee a team member gets (fișa utilizatorului): main evaluator %, verifier %, inspector fixed or %. */
export async function feeShare(db: D1Database, userId: string, roles: TeamRole[], fee: number | null) {
  const u = await db.prepare("SELECT share_evaluator, share_verifier, inspector_fee_kind, inspector_fee FROM users WHERE id = ?").bind(userId)
    .first<{ share_evaluator: number | null; share_verifier: number | null; inspector_fee_kind: string | null; inspector_fee: number | null }>();
  if (!u) return null;
  const parts: { label: string; amount: number | null }[] = [];
  const pct = (p: number | null) => (p != null && fee != null ? Math.round(fee * p) / 100 : null);
  if (roles.includes("evaluator") && u.share_evaluator != null) parts.push({ label: `${u.share_evaluator}% ca evaluator principal`, amount: pct(u.share_evaluator) });
  if (roles.includes("verifier") && u.share_verifier != null) parts.push({ label: `${u.share_verifier}% ca verificator`, amount: pct(u.share_verifier) });
  // The inspection fee is paid when the person only inspected (not when they are also the main evaluator).
  if (roles.includes("inspector") && !roles.includes("evaluator") && u.inspector_fee != null) {
    parts.push(u.inspector_fee_kind === "pct"
      ? { label: `${u.inspector_fee}% ca inspector`, amount: pct(u.inspector_fee) }
      : { label: "tarif fix de inspecție", amount: u.inspector_fee });
  }
  return parts.length ? { parts, total: parts.reduce((s, p) => s + (p.amount ?? 0), 0) } : null;
}
