// Server-only: the CRM home dashboard — the month at a glance, what needs attention today, where the reports are,
// how the team is loaded, and the trend over the last 12 months.
import { dueOf, stageOf, type Stage } from "./dossier";
import { countNewLeads } from "./leads";
import { presenceOf, type Presence } from "./presence";
import { dutiesOf } from "./labels";

const OPEN = "r.status IN ('draft', 'in_progress') AND r.delivered_at IS NULL";
/** Day a report was handed over: delivered in the CRM, else its report date (Glide history). */
const DONE_DATE = "COALESCE(substr(r.delivered_at, 1, 10), r.report_date)";

const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Bucharest" });
const addDays = (iso: string, n: number) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const monthStart = (iso: string, back = 0) => { const d = new Date(`${iso.slice(0, 7)}-01T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() - back); return d.toISOString().slice(0, 10); };
const lastDay = (ym: string) => { const d = new Date(`${ym}-01T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() + 1); d.setUTCDate(0); return d.getUTCDate(); };

export type OpenReport = {
  id: string; number: string | null; label: string | null; client: string | null; stage: Stage; due: string | null; evaluator_id: string | null; evaluator: string | null;
};
export type Alert = { key: string; tone: "err" | "warn" | "info"; title: string; hint: string; count: number; href: string; items: { label: string; sub?: string; href: string }[] };
export type TeamRow = {
  id: string; name: string; role: string; presence: Presence; seen: string; open: number; drafting: number; late: number; delivered: number; inspections: number;
};
export type Month = { ym: string; n: number; fees: number; prevN: number; prevFees: number };

export async function dashboard(db: D1Database, base: string) {
  const t = today();
  const m0 = monthStart(t), p0 = monthStart(t, 1);
  // Same period of last month (1st → same day, or its last day).
  const pEnd = `${p0.slice(0, 7)}-${String(Math.min(Number(t.slice(8, 10)), lastDay(p0.slice(0, 7)))).padStart(2, "0")}`;
  const from24 = monthStart(t, 23);
  const now = new Date();
  const ago = (days: number) => new Date(now.getTime() - days * 86400000).toISOString();

  const [period, orders, turn, monthly, openRows, needAlloc, staleTasks, missingDocs, visits, bankOrders, noOffer, waitingOffers, leads, team, teamOpen, teamDone, teamInsp, sources] = await Promise.all([
    db.prepare(`SELECT SUM(${DONE_DATE} BETWEEN ?1 AND ?2) AS n, SUM(CASE WHEN ${DONE_DATE} BETWEEN ?1 AND ?2 THEN r.fee END) AS fees,
        SUM(${DONE_DATE} BETWEEN ?3 AND ?4) AS pn, SUM(CASE WHEN ${DONE_DATE} BETWEEN ?3 AND ?4 THEN r.fee END) AS pfees
      FROM reports r WHERE r.status = 'done' AND ${DONE_DATE} >= ?3`).bind(m0, t, p0, pEnd)
      .first<{ n: number | null; fees: number | null; pn: number | null; pfees: number | null }>(),
    db.prepare(`SELECT o.source, SUM(d BETWEEN ?1 AND ?2) AS n, SUM(d BETWEEN ?3 AND ?4) AS pn FROM (SELECT source, COALESCE(ordered_on, substr(created_at, 1, 10)) AS d FROM orders) o
      WHERE o.d >= ?3 GROUP BY o.source`).bind(m0, t, p0, pEnd).all<{ source: string; n: number | null; pn: number | null }>(),
    db.prepare(`SELECT AVG(CASE WHEN ${DONE_DATE} BETWEEN ?1 AND ?2 THEN days END) AS cur, AVG(CASE WHEN ${DONE_DATE} BETWEEN ?3 AND ?4 THEN days END) AS prev
      FROM (SELECT r.delivered_at, r.report_date, julianday(${DONE_DATE}) - julianday(r.received_on) AS days FROM reports r
        WHERE r.status = 'done' AND r.received_on IS NOT NULL AND ${DONE_DATE} >= ?3) r WHERE days BETWEEN 0 AND 120`).bind(m0, t, p0, pEnd)
      .first<{ cur: number | null; prev: number | null }>(),
    db.prepare(`SELECT substr(${DONE_DATE}, 1, 7) AS ym, COUNT(*) AS n, SUM(r.fee) AS fees FROM reports r WHERE r.status = 'done' AND ${DONE_DATE} >= ? GROUP BY ym`)
      .bind(from24).all<{ ym: string; n: number; fees: number | null }>(),
    db.prepare(`SELECT r.id, r.number, r.label, r.status, r.stage, r.delivered_at, r.due_on, r.term_days, c.name AS client,
        (SELECT COUNT(*) FROM inspections i WHERE i.report_id = r.id AND i.status <> 'cancelled') AS tasks,
        (SELECT COUNT(*) FROM inspections i WHERE i.report_id = r.id AND i.status = 'done') AS done,
        (SELECT COUNT(*) FROM assets a WHERE a.report_id = r.id AND a.no_inspection IS NOT NULL) AS none,
        (SELECT MAX(i.done_at) FROM inspections i WHERE i.report_id = r.id AND i.status = 'done') AS inspected,
        m.user_id AS evaluator_id, COALESCE(NULLIF(u.name, ''), u.email) AS evaluator
      FROM reports r LEFT JOIN entities c ON c.id = r.client_id
      LEFT JOIN report_members m ON m.report_id = r.id AND m.role = 'evaluator' LEFT JOIN users u ON u.id = m.user_id
      WHERE ${OPEN} GROUP BY r.id`)
      .all<{ id: string; number: string | null; label: string | null; status: string; stage: string | null; delivered_at: string | null; due_on: string | null; term_days: number | null;
        client: string | null; tasks: number; done: number; none: number; inspected: string | null; evaluator_id: string | null; evaluator: string | null }>(),
    db.prepare(`SELECT r.id, r.number, r.label, COUNT(*) AS n, MIN(r.created_at) AS since FROM assets a JOIN reports r ON r.id = a.report_id
      WHERE ${OPEN} AND r.glide_id IS NULL AND a.no_inspection IS NULL
        AND NOT EXISTS (SELECT 1 FROM inspections i WHERE i.asset_id = a.id AND i.status IN ('to_schedule', 'scheduled', 'done'))
      GROUP BY r.id ORDER BY since`).all<{ id: string; number: string | null; label: string | null; n: number; since: string }>(),
    db.prepare(`SELECT i.id, i.report_id, i.assigned_at, COALESCE(NULLIF(u.name, ''), u.email) AS inspector, r.label FROM inspections i JOIN reports r ON r.id = i.report_id
      LEFT JOIN users u ON u.id = i.inspector_id WHERE i.status = 'to_schedule' AND i.glide_id IS NULL AND i.assigned_at < ? AND ${OPEN} ORDER BY i.assigned_at`)
      .bind(ago(2)).all<{ id: string; report_id: string; assigned_at: string; inspector: string | null; label: string | null }>(),
    db.prepare(`SELECT d.report_id, d.filename, r.label FROM report_documents d JOIN reports r ON r.id = d.report_id WHERE d.status = 'missing' AND ${OPEN} ORDER BY d.requested_at`)
      .all<{ report_id: string; filename: string; label: string | null }>(),
    db.prepare(`SELECT i.id, i.report_id, i.scheduled_at, i.duration_min, COALESCE(NULLIF(u.name, ''), u.email) AS inspector, i.inspector_id, u.last_seen_at,
        p.type, COALESCE(p.full_address, p.city) AS address, i.contact_name FROM inspections i
      JOIN assets a ON a.id = i.asset_id JOIN crm_properties p ON p.id = a.property_id LEFT JOIN users u ON u.id = i.inspector_id
      WHERE i.status = 'scheduled' AND substr(i.scheduled_at, 1, 10) BETWEEN ? AND ? ORDER BY i.scheduled_at LIMIT 12`)
      .bind(t, addDays(t, 1)).all<{ id: string; report_id: string | null; scheduled_at: string; duration_min: number | null; inspector: string | null; inspector_id: string | null;
        last_seen_at: string | null; type: string | null; address: string | null; contact_name: string | null }>(),
    db.prepare(`SELECT o.id, o.bank, o.bank_ref, o.client_name, o.created_at FROM orders o WHERE o.source = 'bank' AND o.glide_id IS NULL
      AND o.status IN ('received', 'draft') AND NOT EXISTS (SELECT 1 FROM reports r WHERE r.order_id = o.id) ORDER BY o.created_at`)
      .all<{ id: string; bank: string | null; bank_ref: string | null; client_name: string | null; created_at: string }>(),
    db.prepare(`SELECT o.id, o.seq, o.client_name, o.created_at FROM orders o WHERE o.source IN ('partner', 'client', 'site') AND o.glide_id IS NULL AND o.status = 'received'
      AND NOT EXISTS (SELECT 1 FROM offers f WHERE f.order_id = o.id AND f.status IN ('sent', 'accepted')) AND NOT EXISTS (SELECT 1 FROM reports r WHERE r.order_id = o.id)
      ORDER BY o.created_at`).all<{ id: string; seq: number; client_name: string | null; created_at: string }>(),
    db.prepare(`SELECT f.order_id, f.sent_at, o.seq, o.client_name FROM offers f JOIN orders o ON o.id = f.order_id WHERE f.status = 'sent' AND f.sent_at < ? ORDER BY f.sent_at`)
      .bind(ago(3)).all<{ order_id: string; sent_at: string; seq: number; client_name: string | null }>(),
    countNewLeads(db),
    db.prepare(`SELECT id, COALESCE(NULLIF(name, ''), email) AS name, role, duties, last_seen_at FROM users WHERE kind = 'internal' AND status = 'active' ORDER BY name`)
      .all<{ id: string; name: string; role: string; duties: string | null; last_seen_at: string | null }>(),
    db.prepare(`SELECT m.user_id, COUNT(*) AS n FROM report_members m JOIN reports r ON r.id = m.report_id WHERE m.role = 'evaluator' AND ${OPEN} GROUP BY m.user_id`)
      .all<{ user_id: string; n: number }>(),
    db.prepare(`SELECT m.user_id, COUNT(*) AS n FROM report_members m JOIN reports r ON r.id = m.report_id WHERE m.role = 'evaluator' AND r.status = 'done' AND ${DONE_DATE} BETWEEN ? AND ? GROUP BY m.user_id`)
      .bind(m0, t).all<{ user_id: string; n: number }>(),
    db.prepare(`SELECT inspector_id AS user_id, COUNT(*) AS n FROM inspections WHERE status IN ('to_schedule', 'scheduled') AND glide_id IS NULL GROUP BY inspector_id`)
      .all<{ user_id: string; n: number }>(),
    db.prepare(`SELECT CASE WHEN source = 'bank' THEN COALESCE(NULLIF(upper(bank), ''), 'Alte bănci') ELSE source END AS k, COUNT(*) AS n
      FROM orders WHERE COALESCE(ordered_on, substr(created_at, 1, 10)) >= ? AND status <> 'cancelled' GROUP BY k ORDER BY n DESC`)
      .bind(addDays(t, -90)).all<{ k: string; n: number }>(),
  ]);

  // Open reports: working stage and deadline (same rules as the report page).
  const open: OpenReport[] = openRows.results.map((r) => ({
    id: r.id, number: r.number, label: r.label, client: r.client, evaluator_id: r.evaluator_id, evaluator: r.evaluator,
    stage: stageOf(r, { total: r.tasks, done: r.done, none: r.none }), due: dueOf(r, r.inspected?.slice(0, 10) ?? null),
  }));
  const soonEnd = addDays(t, 2);
  const late = open.filter((r) => r.due && r.due < t).sort((a, b) => a.due!.localeCompare(b.due!));
  const soon = open.filter((r) => r.due && r.due >= t && r.due <= soonEnd).sort((a, b) => a.due!.localeCompare(b.due!));
  const rep = (id: string, tab?: string) => `${base}/rapoarte/${id}${tab ? `?tab=${tab}` : ""}`;
  const name = (r: { number: string | null; label: string | null }) => (r.number ? `Nr. ${r.number}` : r.label ?? "Raport");
  const fmt = (iso: string) => iso.split("-").reverse().slice(0, 2).join(".");

  const alerts: Alert[] = [
    { key: "late", tone: "err", title: "Rapoarte cu termen depășit", hint: "termenul de predare a trecut", count: late.length, href: `${base}/rapoarte?termen=depasit`,
      items: late.slice(0, 4).map((r) => ({ label: `${name(r)} · ${r.client ?? r.label ?? ""}`, sub: `termen ${fmt(r.due!)}${r.evaluator ? ` · ${r.evaluator}` : ""}`, href: rep(r.id) })) },
    { key: "soon", tone: "warn", title: "Termen în următoarele 2 zile", hint: "de predat azi, mâine sau poimâine", count: soon.length, href: `${base}/rapoarte?termen=curand`,
      items: soon.slice(0, 4).map((r) => ({ label: `${name(r)} · ${r.client ?? r.label ?? ""}`, sub: `termen ${fmt(r.due!)}${r.evaluator ? ` · ${r.evaluator}` : ""}`, href: rep(r.id) })) },
    { key: "bank", tone: "warn", title: "Comenzi bănci neprocesate", hint: "din emailurile BCR / BRD, fără raport creat", count: bankOrders.results.length, href: `${base}/comenzi?tab=banci`,
      items: bankOrders.results.slice(0, 4).map((o) => ({ label: `${o.bank ?? "Bancă"} ${o.bank_ref ?? ""}`.trim(), sub: o.client_name ?? undefined, href: `${base}/comenzi/${o.id}` })) },
    { key: "offer", tone: "warn", title: "Comenzi fără ofertă trimisă", hint: "portal și site", count: noOffer.results.length, href: `${base}/comenzi?f=pending`,
      items: noOffer.results.slice(0, 4).map((o) => ({ label: `CO-${o.seq}`, sub: o.client_name ?? undefined, href: `${base}/comenzi/${o.id}` })) },
    { key: "waiting", tone: "info", title: "Oferte fără răspuns de 3+ zile", hint: "de reluat legătura cu clientul", count: waitingOffers.results.length, href: `${base}/comenzi`,
      items: waitingOffers.results.slice(0, 4).map((o) => ({ label: `CO-${o.seq}`, sub: `${o.client_name ?? ""} · trimisă ${fmt(o.sent_at.slice(0, 10))}`, href: `${base}/comenzi/${o.order_id}` })) },
    { key: "alloc", tone: "warn", title: "Inspecții nealocate", hint: "bunuri din rapoarte deschise, fără inspector", count: needAlloc.results.reduce((s, r) => s + r.n, 0),
      href: needAlloc.results[0] ? rep(needAlloc.results[0].id, "inspectii") : `${base}/rapoarte`,
      items: needAlloc.results.slice(0, 4).map((r) => ({ label: name(r), sub: `${r.n} ${r.n === 1 ? "bun" : "bunuri"} · ${r.label ?? ""}`, href: `${rep(r.id, "inspectii")}&alocare=1` })) },
    { key: "stale", tone: "info", title: "Inspecții neprogramate de 2+ zile", hint: "alocate, dar inspectorul nu le-a programat", count: staleTasks.results.length,
      href: staleTasks.results[0] ? rep(staleTasks.results[0].report_id, "inspectii") : `${base}/rapoarte`,
      items: staleTasks.results.slice(0, 4).map((i) => ({ label: i.inspector ?? "Inspector", sub: `${i.label ?? ""} · alocată ${fmt(i.assigned_at.slice(0, 10))}`, href: rep(i.report_id, "inspectii") })) },
    { key: "docs", tone: "info", title: "Documente lipsă", hint: "blochează predarea", count: missingDocs.results.length,
      href: missingDocs.results[0] ? rep(missingDocs.results[0].report_id, "documente") : `${base}/rapoarte`,
      items: missingDocs.results.slice(0, 4).map((d) => ({ label: d.filename, sub: d.label ?? undefined, href: rep(d.report_id, "documente") })) },
    { key: "leads", tone: "info", title: "Cereri noi de pe site", hint: "vânzări de pe valuefy.ro", count: leads, href: `${base}/comenzi?tab=site`, items: [] },
  ];

  // Pipeline: open reports per working stage.
  const pipeline = (["inspection", "drafting", "review"] as const).map((s) => ({ stage: s, n: open.filter((r) => r.stage === s).length, late: late.filter((r) => r.stage === s).length }));

  // Team: evaluators and inspectors with their load.
  const by = (rows: { user_id: string; n: number }[]) => new Map(rows.map((r) => [r.user_id, r.n]));
  const oMap = by(teamOpen.results), dMap = by(teamDone.results), iMap = by(teamInsp.results);
  const teamRows: TeamRow[] = team.results
    .filter((u) => dutiesOf(u).some((d) => d === "evaluator" || d === "inspector") || oMap.has(u.id) || iMap.has(u.id))
    .map((u) => ({
      id: u.id, name: u.name, role: dutiesOf(u).includes("evaluator") ? (dutiesOf(u).includes("inspector") ? "Evaluator · inspector" : "Evaluator") : "Inspector",
      ...presenceOf(u.last_seen_at), open: oMap.get(u.id) ?? 0, drafting: open.filter((r) => r.evaluator_id === u.id && r.stage !== "inspection").length,
      late: late.filter((r) => r.evaluator_id === u.id).length, delivered: dMap.get(u.id) ?? 0, inspections: iMap.get(u.id) ?? 0,
    }))
    .sort((a, b) => b.open + b.inspections - (a.open + a.inspections) || a.name.localeCompare(b.name));

  // 12 months, each with the same month a year earlier.
  const mm = new Map(monthly.results.map((r) => [r.ym, r]));
  const months: Month[] = Array.from({ length: 12 }, (_, i) => {
    const ym = monthStart(t, 11 - i).slice(0, 7);
    const prev = `${Number(ym.slice(0, 4)) - 1}${ym.slice(4)}`;
    return { ym, n: mm.get(ym)?.n ?? 0, fees: mm.get(ym)?.fees ?? 0, prevN: mm.get(prev)?.n ?? 0, prevFees: mm.get(prev)?.fees ?? 0 };
  });

  const src = new Map(orders.results.map((r) => [r.source, r]));
  const newOrders = { n: orders.results.reduce((s, r) => s + (r.n ?? 0), 0), pn: orders.results.reduce((s, r) => s + (r.pn ?? 0), 0),
    split: (["bank", "collab", "partner", "client", "site"] as const).map((k) => ({ k, n: src.get(k)?.n ?? 0 })).filter((x) => x.n) };

  return {
    today: t, monthStart: m0,
    delivered: { n: period?.n ?? 0, pn: period?.pn ?? 0, fees: period?.fees ?? 0, pfees: period?.pfees ?? 0 },
    newOrders, turnaround: { cur: turn?.cur ?? null, prev: turn?.prev ?? null },
    openCount: open.length, late: late.length, alerts, pipeline,
    visits: visits.results.map((v) => ({ ...v, ...presenceOf(v.last_seen_at), tomorrow: v.scheduled_at.slice(0, 10) !== t })),
    team: teamRows, months, sources: sources.results,
  };
}
export type Dashboard = Awaited<ReturnType<typeof dashboard>>;
