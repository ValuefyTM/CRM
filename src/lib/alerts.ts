// Server-only: the configurable alerts (Setări → Alerte). The rules live in the settings table; nothing is stored per
// alert: each rule is a question asked of the data (inspections done, reports not collected, orders not opened…),
// answered for one user at a time — the bell, the phone (push) and the dashboard ask it.
import { ALERT_KINDS, DEFAULT_RULES, type AlertKind, type AlertRule } from "./alert-kinds";
import { can, type WithPerms } from "./perms";
import { audit } from "./auth";
import { now } from "./db";
import { getBilling, FINISHED_HERE } from "./billing";
import { DUE_SQL } from "./reports";
import { orderCode } from "./order-labels";
import { ROLE_LABEL } from "./reports";

export type { AlertRule };

const SETTING = "alerts";

/** The rules (the defaults, plus the per-contract "not collected" alerts of the Facturare page, when none were saved yet). */
export async function getAlertRules(db: D1Database): Promise<AlertRule[]> {
  const row = await db.prepare("SELECT value FROM settings WHERE key = ?").bind(SETTING).first<{ value: string }>().catch(() => null);
  if (row?.value) {
    try { const v = JSON.parse(row.value) as { rules?: unknown }; return cleanRules(v.rules); } catch { /* broken: the defaults */ }
  }
  const rules = [...DEFAULT_RULES];
  // Alerts set per contract before this page existed: one rule each.
  const old = await db.prepare(`SELECT 'k:' || id AS s, collect_alert_days AS d, collect_alert_to AS t FROM contracts WHERE collect_alert_days IS NOT NULL
    UNION ALL SELECT 'c:' || id, collect_alert_days, collect_alert_to FROM collaborations WHERE collect_alert_days IS NOT NULL`).all<{ s: string; d: number; t: string | null }>().catch(() => ({ results: [] as { s: string; d: number; t: string | null }[] }));
  for (const o of old.results) rules.push({ id: `r-old-${o.s}`, kind: "uncollected_after_insp", days: o.d, to: o.t === "ops" ? ["ops"] : o.t === "evaluator" ? ["evaluator"] : ["evaluator", "ops"], scope: [o.s], dashboard: true, enabled: true });
  return rules;
}

const TO = new Set(["assigned", "evaluator", "verifier", "inspector", "team", "ops", "orders", "admins", "all"]);
function cleanRules(v: unknown): AlertRule[] {
  if (!Array.isArray(v)) return [];
  const out: AlertRule[] = [];
  for (const x of v as Record<string, unknown>[]) {
    if (!x || typeof x !== "object" || typeof x.id !== "string" || !ALERT_KINDS[x.kind as AlertKind]) continue;
    const to = Array.isArray(x.to) ? x.to.filter((t): t is string => typeof t === "string" && (TO.has(t) || /^u:[\w-]{1,64}$/.test(t))) : [];
    const scope = Array.isArray(x.scope) ? x.scope.filter((s): s is string => typeof s === "string" && (s === "direct" || /^[kc]:[\w-]{1,80}$/.test(s))).slice(0, 200) : [];
    const days = typeof x.days === "number" && Number.isFinite(x.days) ? Math.min(365, Math.max(0, Math.round(x.days))) : 0;
    const every = typeof x.every === "number" && Number.isFinite(x.every) && ALERT_KINDS[x.kind as AlertKind].lasting ? Math.min(720, Math.max(0, Math.round(x.every))) : 0;
    out.push({ id: x.id.slice(0, 40), kind: x.kind as AlertKind, days, to, scope, dashboard: !!x.dashboard, email: !!x.email, enabled: x.enabled !== false, ...(every ? { every } : {}), ...(typeof x.title === "string" && x.title.trim() ? { title: x.title.trim().slice(0, 80) } : {}) });
    if (out.length >= 60) break;
  }
  return out;
}

export async function saveAlertRules(db: D1Database, actor: string, rules: unknown) {
  const clean = cleanRules(rules);
  if (clean.some((r) => r.enabled && !r.to.length)) return { ok: false as const, error: "Fiecare alertă activă are nevoie de cel puțin un destinatar." };
  await db.prepare("INSERT INTO settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by")
    .bind(SETTING, JSON.stringify({ rules: clean }), now(), actor).run();
  await audit(db, `user:${actor}`, "settings.alerts", "settings", SETTING, `${clean.filter((r) => r.enabled).length} alerte active din ${clean.length}`);
  return { ok: true as const, rules: clean };
}

// ---------- evaluation ----------

type Row = {
  key: string; anchor: string | null; rid: string | null; oid: string | null; number: string | null; label: string | null; client: string | null; bank: string | null;
  fee: number | null; kid: string | null; cid: string | null; my_roles: string | null; inspector_id: string | null; who: string | null; place: string | null; extra: string | null;
  /** the person a "report assigned" row is about */
  assigned_id: string | null;
  seq: number | null; bank_ref: string | null; source: string | null;
};

/** The columns every situation reports about its report (the team roles of the user: for the recipients). */
const REPORT_COLS = `r.id AS rid, NULL AS oid, r.number, r.label, c.name AS client, COALESCE(b.code, b.name) AS bank, r.fee,
  (SELECT k.id FROM contracts k WHERE k.id = r.contract_id AND k.kind = 'framework') AS kid, o.collaboration_id AS cid,
  (SELECT group_concat(rm.role) FROM report_members rm WHERE rm.report_id = r.id AND rm.user_id = ?1) AS my_roles, NULL AS seq, NULL AS bank_ref, NULL AS source`;
const REPORT_JOINS = `LEFT JOIN orders o ON o.id = r.order_id LEFT JOIN entities c ON c.id = r.client_id LEFT JOIN entities b ON b.id = r.recipient_id`;
const INSP_COLS = `i.id AS key, NULL AS assigned_id, i.inspector_id, (SELECT COALESCE(NULLIF(x.name, ''), x.email) FROM users x WHERE x.id = i.inspector_id) AS who,
  COALESCE(NULLIF(i.address, ''), p.full_address, p.city) AS place`;
const INSP_JOINS = `LEFT JOIN reports r ON r.id = i.report_id LEFT JOIN assets a ON a.id = i.asset_id LEFT JOIN crm_properties p ON p.id = a.property_id ${REPORT_JOINS}`;
const OPEN_REPORT = `r.status IN ('draft', 'in_progress') AND r.delivered_at IS NULL`;
const NEW_HERE = `r.glide_id IS NULL`;

/** ?1 = user id, ?2 = the oldest moment still of interest, ?3 / ?4 = the billing defaults (framework, collaboration). */
const SQL: Record<AlertKind, string> = {
  report_assigned: `SELECT rm.report_id || ':' || rm.user_id || ':' || rm.role AS key, rm.user_id AS assigned_id, NULL AS inspector_id,
      (SELECT COALESCE(NULLIF(x.name, ''), x.email) FROM users x WHERE x.id = rm.user_id) AS who, (SELECT COALESCE(NULLIF(x.name, ''), x.email) FROM users x WHERE x.id = rm.added_by) AS place,
      rm.added_at AS anchor, rm.role || '|' || COALESCE(rm.added_by, '') AS extra, ${REPORT_COLS}
    FROM report_members rm JOIN reports r ON r.id = rm.report_id ${REPORT_JOINS} WHERE rm.added_at > ?2 AND r.status <> 'cancelled'`,
  // from the moment the CRM learnt it (a sync from UVALO may come later than the inspection itself)
  insp_done: `SELECT ${INSP_COLS}, COALESCE(i.done_logged_at, i.done_at) AS anchor, NULL AS extra, ${REPORT_COLS} FROM inspections i ${INSP_JOINS}
    WHERE i.status = 'done' AND i.done_at IS NOT NULL AND i.glide_id IS NULL AND COALESCE(i.done_logged_at, i.done_at) > ?2`,
  insp_not_scheduled: `SELECT ${INSP_COLS}, COALESCE(i.assigned_at, i.created_at) AS anchor, NULL AS extra, ${REPORT_COLS} FROM inspections i ${INSP_JOINS}
    WHERE i.status = 'to_schedule' AND i.glide_id IS NULL AND (r.id IS NULL OR ${OPEN_REPORT})`,
  insp_overdue: `SELECT ${INSP_COLS}, i.scheduled_at AS anchor, i.scheduled_at AS extra, ${REPORT_COLS} FROM inspections i ${INSP_JOINS}
    WHERE i.status = 'scheduled' AND i.scheduled_at IS NOT NULL AND i.glide_id IS NULL AND (r.id IS NULL OR ${OPEN_REPORT})`,
  uncollected_after_insp: `SELECT r.id AS key, NULL AS assigned_id, NULL AS inspector_id, NULL AS who, NULL AS place,
      (SELECT MIN(i.done_at) FROM inspections i WHERE i.report_id = r.id AND i.status = 'done' AND i.done_at IS NOT NULL) AS anchor, NULL AS extra, ${REPORT_COLS}
    FROM reports r ${REPORT_JOINS} WHERE COALESCE(r.collected, 0) = 0 AND r.status <> 'cancelled' AND ${NEW_HERE} AND anchor IS NOT NULL`,
  delivered_uncollected: `SELECT r.id AS key, NULL AS assigned_id, NULL AS inspector_id, NULL AS who, NULL AS place, r.delivered_at AS anchor, NULL AS extra, ${REPORT_COLS}
    FROM reports r ${REPORT_JOINS} WHERE r.delivered_at IS NOT NULL AND COALESCE(r.collected, 0) = 0 AND r.status <> 'cancelled' AND ${NEW_HERE}`,
  to_invoice: `SELECT r.id AS key, NULL AS assigned_id, NULL AS inspector_id, NULL AS who, NULL AS place, COALESCE(r.delivered_at, r.updated_at) AS anchor, NULL AS extra, ${REPORT_COLS}
    FROM reports r ${REPORT_JOINS} LEFT JOIN contracts k ON k.id = r.contract_id LEFT JOIN collaborations cb ON cb.id = o.collaboration_id
    WHERE r.invoice_id IS NULL AND r.billed_outside_at IS NULL AND r.status <> 'cancelled' AND (r.delivered_at IS NOT NULL OR r.status = 'done') AND ${FINISHED_HERE}
      AND ((k.kind = 'framework' AND COALESCE(k.billing_mode, ?3) = 'per_order') OR (o.collaboration_id IS NOT NULL AND COALESCE(cb.billing_mode, ?4) = 'per_order'))`,
  review_waiting: `SELECT r.id AS key, NULL AS assigned_id, NULL AS inspector_id, NULL AS who, NULL AS place,
      COALESCE((SELECT MAX(al.at) FROM audit_log al WHERE al.entity = 'report' AND al.entity_id = r.id AND al.action = 'report.stage' AND al.details = 'Verificare'), r.updated_at) AS anchor, NULL AS extra, ${REPORT_COLS}
    FROM reports r ${REPORT_JOINS} WHERE r.stage = 'review' AND r.verified_at IS NULL AND ${OPEN_REPORT}`,
  overdue: `SELECT r.id AS key, NULL AS assigned_id, NULL AS inspector_id, NULL AS who, NULL AS place, date((${DUE_SQL}), '+1 day') AS anchor, (${DUE_SQL}) AS extra, ${REPORT_COLS}
    FROM reports r ${REPORT_JOINS} WHERE ${OPEN_REPORT} AND ${NEW_HERE} AND (${DUE_SQL}) IS NOT NULL`,
  docs_missing: `SELECT r.id AS key, NULL AS assigned_id, NULL AS inspector_id, NULL AS who, NULL AS place,
      (SELECT MIN(COALESCE(d.requested_at, d.created_at)) FROM report_documents d WHERE d.report_id = r.id AND d.status = 'missing') AS anchor,
      (SELECT COUNT(*) || '|' || group_concat(d.filename, ', ') FROM report_documents d WHERE d.report_id = r.id AND d.status = 'missing') AS extra, ${REPORT_COLS}
    FROM reports r ${REPORT_JOINS} WHERE ${OPEN_REPORT} AND EXISTS (SELECT 1 FROM report_documents d WHERE d.report_id = r.id AND d.status = 'missing')`,
  order_new: `SELECT o.id AS key, NULL AS assigned_id, NULL AS inspector_id, NULL AS who, NULL AS place, o.created_at AS anchor, NULL AS extra,
      NULL AS rid, o.id AS oid, NULL AS number, NULL AS label, o.client_name AS client, o.bank, NULL AS fee,
      (SELECT k.id FROM contracts k WHERE k.id = o.contract_id AND k.kind = 'framework') AS kid, o.collaboration_id AS cid, NULL AS my_roles, o.seq, o.bank_ref, o.source
    FROM orders o WHERE o.viewed_at IS NULL AND o.status <> 'cancelled' AND o.created_at > ?2`,
};

/** Bucharest time (the inspections' local times have no zone) as a moment; dates alone count from 8 in the morning. */
function momentOf(s: string): number {
  if (s.length <= 10) s = `${s}T08:00`;
  if (/Z$|[+-]\d\d:\d\d$/.test(s)) return Date.parse(s);
  const guess = Date.parse(`${s}Z`);
  const off = (new Date(new Date(guess).toLocaleString("en-US", { timeZone: "Europe/Bucharest" })).getTime() - new Date(new Date(guess).toLocaleString("en-US", { timeZone: "UTC" })).getTime());
  return guess - off;
}

export type Viewer = WithPerms & { id: string; name?: string; email?: string };
export type Hit = { rule: AlertRule; row: Row; at: string;
  /** a repeated alert: which time it is told (a new notice each time) */
  round?: number;
  /** a "report assigned" alert about the viewer themself: they get the dedicated email of the assignment (dossier.ts), not the digest */
  self?: boolean };

/**
 * Whether the person put in a report's team gets the assignment email: only when an enabled "Raport alocat" rule aimed
 * at them has "și pe email" ticked (Setări → Alerte). Push and the bell follow the rule anyway.
 */
export async function assignmentMailWanted(db: D1Database, userId: string, role: string) {
  const rules = await getAlertRules(db);
  return rules.some((r) => r.enabled && r.kind === "report_assigned" && r.email
    && r.to.some((t) => t === "all" || t === "assigned" || t === "team" || t === role || t === `u:${userId}`));
}

const isAdmin = (u: Viewer) => u.role === "owner" || u.role === "admin";

function forMe(rule: AlertRule, row: Row, u: Viewer) {
  const roles = (row.my_roles ?? "").split(",").filter(Boolean);
  const mine = row.inspector_id === u.id;
  return rule.to.some((t) => t === "all" || (t === "assigned" && row.assigned_id === u.id) || (t === "admins" && isAdmin(u)) || (t === "ops" && can(u, "billing")) || (t === "orders" && can(u, "orders"))
    || (t === "team" && (roles.length > 0 || mine)) || (t === "inspector" && (mine || roles.includes("inspector")))
    || ((t === "evaluator" || t === "verifier" || t === "assistant") && roles.includes(t)) || t === `u:${u.id}`);
}
/**
 * An alert about a report reaches only its team (or the inspector of the inspection), whatever the rule's recipients —
 * except the owner, who sees every one, and the money alerts for who invoices every report (Facturare: toate).
 */
function onMyReport(rule: AlertRule, row: Row, u: Viewer) {
  if (!row.rid || u.role === "owner") return true;
  if (ALERT_KINDS[rule.kind].group === "Bani" && can(u, "billing.all")) return true;
  return !!row.my_roles || row.inspector_id === u.id || row.assigned_id === u.id;
}
const inScope = (rule: AlertRule, row: Row) =>
  !rule.scope.length || rule.scope.some((s) => (s === "direct" ? !row.kid && !row.cid : s === `k:${row.kid}` || s === `c:${row.cid}`));

/**
 * The alerts of one user: every enabled rule, on the rows of its situation, `days` after the moment, for the rules
 * aimed at them and the work in their scope. `since`: nothing older than that (the bell shows 30 days).
 */
export async function alertHits(db: D1Database, u: Viewer, since: string, rules?: AlertRule[]): Promise<Hit[]> {
  const all = (rules ?? (await getAlertRules(db))).filter((r) => r.enabled && r.to.length);
  if (!all.length) return [];
  const kinds = [...new Set(all.map((r) => r.kind))];
  const maxDays = Math.max(...all.map((r) => r.days));
  // rows no older than the window plus the longest delay
  const oldest = new Date(Date.parse(since) - maxDays * 86400000).toISOString();
  const b = kinds.some((k) => k === "to_invoice") ? await getBilling(db) : null;
  const binds = [u.id, oldest, b?.frameworkDefault ?? "per_order", b?.collabDefault ?? "per_order"];
  // D1 wants exactly as many bindings as the query's highest numbered placeholder
  const used = (sql: string) => Math.max(...[...sql.matchAll(/\?(\d)/g)].map((m) => Number(m[1])));
  const rows = await Promise.all(kinds.map((k) => db.prepare(SQL[k]).bind(...binds.slice(0, used(SQL[k])))
    .all<Row>().then((x) => [k, x.results] as const).catch((e) => { console.error("alert", k, e); return [k, [] as Row[]] as const; })));
  const byKind = new Map(rows);
  const nowMs = Date.now(), sinceMs = Date.parse(since);
  const hits: Hit[] = [];
  for (const rule of all) {
    for (const row of byKind.get(rule.kind) ?? []) {
      if (!row.anchor || !inScope(rule, row) || !forMe(rule, row, u)) continue;
      if (!onMyReport(rule, row, u)) continue;
      // what one did oneself (put oneself in a team) is no news
      if (rule.kind === "report_assigned" && (row.extra ?? "").split("|")[1] === u.id) continue;
      let at = momentOf(row.anchor) + rule.days * 86400000;
      // repeated every n hours while it lasts: the latest time it was due
      let round: number | undefined;
      if (rule.every && at <= nowMs) { const step = rule.every * 3600000; round = Math.floor((nowMs - at) / step); at += round * step; }
      if (at > nowMs || at <= sinceMs) continue;
      hits.push({ rule, row, at: new Date(at).toISOString(), ...(round ? { round } : {}), ...(rule.kind === "report_assigned" && row.assigned_id === u.id ? { self: true } : {}) });
    }
  }
  return hits.sort((a, c) => (a.at < c.at ? 1 : -1));
}

const dm = (iso: string | null) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}` : "");
const num = (n: string | null) => (n ? `nr. ${n}` : "fără număr");
const lei = (v: number | null) => (v ? `${Math.round(v).toLocaleString("ro-RO")} lei` : null);

/** Title, text and link of one hit (the bell and the dashboard say the same). */
export function describe(h: Hit, base: string) {
  const { rule, row } = h;
  const k = ALERT_KINDS[rule.kind];
  const rep = row.rid ? `${base}/rapoarte/${row.rid}` : null;
  const r = row.rid ? `raport ${num(row.number)}` : row.label ?? "";
  let short = row.rid ? `Raport ${num(row.number)}` : row.label ?? "";
  const head = rule.title || k.label;
  const days = rule.days ? ` de ${rule.days} ${rule.days === 1 ? "zi" : "zile"}` : "";
  let title = `${head} · ${r}`, sub = "", href = rep ?? `${base}/rapoarte`;
  switch (rule.kind) {
    case "report_assigned": {
      const roleKey = (row.extra ?? "").split("|")[0];
      const role = (ROLE_LABEL[roleKey] ?? roleKey ?? "membru").toLowerCase();
      sub = [`${row.who ?? "cineva"} · ${role}`, row.place && `de ${row.place}`, row.client].filter(Boolean).join(" · ");
      break;
    }
    case "insp_done": sub = [row.place, row.who && `de ${row.who}`].filter(Boolean).join(" · "); href = rep ? `${rep}?tab=inspectii` : `${base}/agenda-inspectii`; break;
    case "insp_not_scheduled": title = `${head}${days} · ${r}`; sub = [row.place, row.who].filter(Boolean).join(" · "); href = rep ? `${rep}?tab=inspectii` : `${base}/agenda-inspectii`; break;
    case "insp_overdue": sub = [row.place, row.extra && `programată ${dm(row.extra)}`, row.who].filter(Boolean).join(" · "); href = rep ? `${rep}?tab=inspectii` : `${base}/agenda-inspectii`; break;
    case "uncollected_after_insp": sub = [`inspecție ${dm(row.anchor)}`, row.client, row.bank, lei(row.fee)].filter(Boolean).join(" · "); break;
    case "delivered_uncollected": sub = [`predat ${dm(row.anchor)}`, row.client, row.bank, lei(row.fee)].filter(Boolean).join(" · "); break;
    case "to_invoice": sub = [`predat ${dm(row.anchor)}`, row.client, row.bank, lei(row.fee)].filter(Boolean).join(" · "); href = `${base}/facturare`; break;
    case "review_waiting": title = `${head}${days} · ${r}`; sub = [row.client, row.bank].filter(Boolean).join(" · "); break;
    case "overdue": sub = [row.extra && `termen ${dm(row.extra)}`, row.client, row.bank].filter(Boolean).join(" · "); break;
    case "docs_missing": {
      const [n, names] = [(row.extra ?? "").split("|")[0], (row.extra ?? "").split("|").slice(1).join("|")];
      title = `${head} · ${r}`; sub = [Number(n) > 1 ? `${n} acte: ${names}` : names, row.client, row.bank].filter(Boolean).join(" · "); href = rep ? `${rep}?tab=documente` : href; break;
    }
    case "order_new": {
      const code = orderCode({ id: row.key, seq: row.seq, bank_ref: row.bank_ref, bank: row.bank, source: row.source ?? undefined });
      short = code; title = `${head} ${code}`; sub = [row.client, row.bank, `primită ${dm(row.anchor)}`].filter(Boolean).join(" · "); href = `${base}/comenzi/${row.key}`; break;
    }
  }
  const kind = k.group === "Bani" ? "collect" : k.group === "Inspecții" ? "inspection" : k.group === "Comenzi" ? "order" : "alert";
  // the person assigned gets the dedicated assignment email (dossier.ts) when the rule is ticked, not the digest
  return { id: `r${rule.id}:${row.key}${h.round ? `:${h.round}` : ""}`, at: h.at, kind, title, short, sub, href, tone: k.tone, email: !!rule.email && !h.self };
}

export type DashAlert = { key: string; tone: "err" | "warn" | "info"; title: string; hint: string; count: number; href: string; items: { label: string; sub?: string; href: string }[] };

/** The dashboard cards: one per rule marked for it, with its open items for this user. */
export async function dashboardAlerts(db: D1Database, u: Viewer, base: string): Promise<DashAlert[]> {
  const rules = (await getAlertRules(db)).filter((r) => r.enabled && r.dashboard);
  if (!rules.length) return [];
  const hits = await alertHits(db, u, new Date(Date.now() - 30 * 86400000).toISOString(), rules);
  return rules.map((rule) => {
    const mine = hits.filter((h) => h.rule.id === rule.id).map((h) => describe(h, base));
    const k = ALERT_KINDS[rule.kind];
    const list = rule.kind === "to_invoice" ? `${base}/facturare` : rule.kind === "order_new" ? `${base}/comenzi` : rule.kind === "overdue" ? `${base}/rapoarte?termen=depasit`
      : rule.kind === "review_waiting" ? `${base}/rapoarte?etapa=verificare` : k.group === "Inspecții" ? `${base}/agenda-inspectii` : mine[0]?.href ?? `${base}/rapoarte`;
    return { key: `rule:${rule.id}`, tone: k.tone, title: rule.title || k.label, hint: k.hint, count: mine.length, href: list,
      items: mine.slice(0, 4).map((m) => ({ label: m.short, sub: m.sub, href: m.href })) };
  }).filter((a) => a.count > 0);
}
