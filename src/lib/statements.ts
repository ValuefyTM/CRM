// Server-only: borderouri (statements), monthly. "payout": what the firm owes a collaborator (a user) — the shares
// as main evaluator / verifier on the reports delivered in the month, the inspection fees, a commission on the
// reports they brought, a fixed monthly amount. "receivable": what a bank (framework contract) or a collaborating
// firm owes for the reports delivered in the month. A rule per party says what counts and whether a statement
// opens every month. The current month is computed live; the owner validates (the lines freeze), adjusts with a
// reason (the person sees every adjustment), then issues it (numbered).
import { bucharestDay, now, uuid } from "./db";
import { audit } from "./auth";
import { dutySql, niceName } from "./labels";
import { xlsx, type Cell } from "./xlsx";

export type { Kind, Status, Basis, Recurrence, Source, Rule, Line, FixedCost } from "./statement-labels";
export { KIND_LABEL, STATUS_LABEL, BASIS_PICK, RECURRENCE_PICK, SOURCE_LABEL, EXPORT_FIELDS, DEFAULT_EXPORT, totalOf } from "./statement-labels";
import { DEFAULT_EXPORT, EXPORT_FIELDS, SOURCE_LABEL, totalOf, type Kind, type Status, type Basis, type Recurrence, type Rule, type Line, type FixedCost } from "./statement-labels";

export type Statement = {
  id: string; kind: Kind; party: string; period: string; number: string | null; issued_on: string | null; total: number | null; status: Status;
  user_id: string | null; contract_id: string | null; collaboration_id: string | null; validated_at: string | null; validated_by: string | null;
  issued_by: string | null; notes: string | null; criteria: string | null; created_at: string; updated_at: string | null;
  name: string; sub: string | null; validated_name: string | null; issued_name: string | null;
};

export const thisMonth = () => bucharestDay().slice(0, 7);
export const periodLabel = (p: string) => {
  const [y, m] = p.split("-").map(Number);
  return `${["ianuarie", "februarie", "martie", "aprilie", "mai", "iunie", "iulie", "august", "septembrie", "octombrie", "noiembrie", "decembrie"][m - 1]} ${y}`;
};
export const validPeriod = (p: unknown): p is string => typeof p === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(p);
const round2 = (n: number) => Math.round(n * 100) / 100;

// ---------- the party ----------

const PARTY_SQL = `COALESCE(u.name, ke.name, ce.name, '—') AS name,
  CASE WHEN u.id IS NOT NULL THEN COALESCE(NULLIF(u.email, ''), '') WHEN k.id IS NOT NULL THEN 'contract cadru nr. ' || COALESCE(k.number, '—') ELSE 'colaborare' || COALESCE(' nr. ' || c.number, '') END AS sub`;
const PARTY_JOINS = `LEFT JOIN users u ON u.id = x.user_id LEFT JOIN contracts k ON k.id = x.contract_id LEFT JOIN entities ke ON ke.id = k.client_id
  LEFT JOIN collaborations c ON c.id = x.collaboration_id LEFT JOIN entities ce ON ce.id = c.firm_id`;

/** "u:<id>" / "k:<id>" / "c:<id>" → the columns. */
export const partyCols = (party: string) => {
  const [t, id] = [party.slice(0, 1), party.slice(2)];
  if (!id || !["u", "k", "c"].includes(t)) return null;
  return { user_id: t === "u" ? id : null, contract_id: t === "k" ? id : null, collaboration_id: t === "c" ? id : null, kind: (t === "u" ? "payout" : "receivable") as Kind };
};

/** The parties a rule can be made for: the firm's evaluators (ticked as such, also without an active account), the open framework contracts, the collaborations. */
export async function partyChoices(db: D1Database) {
  const [users, contracts, collabs] = await Promise.all([
    db.prepare(`SELECT 'u:' || id AS party, COALESCE(NULLIF(name, ''), email) AS name,
        (CASE WHEN engagement = 'contractor' THEN 'colaborator extern' ELSE 'intern' END) || (CASE status WHEN 'active' THEN '' WHEN 'invited' THEN ' · cont neactivat' ELSE ' · cont inactiv' END) AS sub
      FROM users WHERE kind = 'internal' AND status <> 'deleted' AND ${dutySql("evaluator")} ORDER BY status <> 'active', name`).all<{ party: string; name: string; sub: string }>(),
    db.prepare(`SELECT 'k:' || k.id AS party, COALESCE(e.name, '—') AS name, 'contract cadru nr. ' || COALESCE(k.number, '—') AS sub FROM contracts k LEFT JOIN entities e ON e.id = k.client_id
      WHERE k.kind = 'framework' AND k.closed_on IS NULL ORDER BY e.name`).all<{ party: string; name: string; sub: string }>(),
    db.prepare(`SELECT 'c:' || c.id AS party, e.name, 'colaborare' || COALESCE(' nr. ' || c.number, '') AS sub FROM collaborations c JOIN entities e ON e.id = c.firm_id ORDER BY e.name`).all<{ party: string; name: string; sub: string }>(),
  ]);
  const fix = (r: { party: string; name: string; sub: string }) => ({ ...r, name: niceName(r.name) || r.name });
  return { users: users.results.map(fix), contracts: contracts.results.map(fix), collabs: collabs.results.map(fix) };
}

// ---------- rules ----------

export async function listRules(db: D1Database, kind?: Kind): Promise<Rule[]> {
  const { results } = await db.prepare(`SELECT x.*, ${PARTY_SQL} FROM statement_rules x ${PARTY_JOINS} ${kind ? "WHERE x.kind = ?1" : ""} ORDER BY x.kind, name`)
    .bind(...(kind ? [kind] : [])).all<Rule>();
  return results.map((r) => ({ ...r, name: niceName(r.name) || r.name }));
}
export async function ruleFor(db: D1Database, party: string): Promise<Rule | null> {
  const r = await db.prepare(`SELECT x.*, ${PARTY_SQL} FROM statement_rules x ${PARTY_JOINS} WHERE x.party = ?`).bind(party).first<Rule>();
  return r ? { ...r, name: niceName(r.name) || r.name } : null;
}

/** Creates or updates the rule of a party (the party cannot change: make another rule). */
export async function saveRule(db: D1Database, actor: string, b: Record<string, unknown>) {
  const party = typeof b.party === "string" ? b.party.trim() : "";
  const cols = partyCols(party);
  if (!cols) return { ok: false as const, error: "Alege pentru cine e borderoul." };
  const exists = cols.user_id ? await db.prepare("SELECT 1 AS x FROM users WHERE id = ?").bind(cols.user_id).first()
    : cols.contract_id ? await db.prepare("SELECT 1 AS x FROM contracts WHERE id = ? AND kind = 'framework'").bind(cols.contract_id).first()
    : await db.prepare("SELECT 1 AS x FROM collaborations WHERE id = ?").bind(cols.collaboration_id).first();
  if (!exists) return { ok: false as const, error: "Persoana / contractul nu există." };
  const num = (v: unknown, max: number) => { const n = typeof v === "string" ? Number(v.replace(",", ".")) : Number(v); return v === "" || v == null || !Number.isFinite(n) || n < 0 ? null : Math.min(max, round2(n)); };
  const recurrence: Recurrence = b.recurrence === "manual" ? "manual" : "monthly";
  const basis: Basis = b.basis === "collected" ? "collected" : "delivered";
  const on = (v: unknown) => (v === false || v === 0 || v === "0" ? 0 : 1);
  const fixed = cols.kind === "payout" ? num(b.fixed_amount, 1e7) : null;
  const t = now();
  const prev = await db.prepare("SELECT id FROM statement_rules WHERE party = ?").bind(party).first<{ id: string }>();
  const id = prev?.id ?? uuid();
  await db.prepare(`INSERT INTO statement_rules (id, kind, party, user_id, contract_id, collaboration_id, recurrence, basis, inc_evaluator, inc_verifier, inc_inspector, referral_pct, fixed_amount, fixed_label, active, notes, created_by, created_at, updated_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?18)
      ON CONFLICT(party) DO UPDATE SET recurrence = ?7, basis = ?8, inc_evaluator = ?9, inc_verifier = ?10, inc_inspector = ?11, referral_pct = ?12, fixed_amount = ?13, fixed_label = ?14, active = ?15, notes = ?16, updated_at = ?18`)
    .bind(id, cols.kind, party, cols.user_id, cols.contract_id, cols.collaboration_id, recurrence, basis, on(b.inc_evaluator), on(b.inc_verifier), on(b.inc_inspector),
      cols.kind === "payout" ? num(b.referral_pct, 100) : null, fixed, fixed != null ? (typeof b.fixed_label === "string" ? b.fixed_label.trim().slice(0, 120) : "") || "Sumă fixă lunară" : null,
      b.active === false ? 0 : 1, typeof b.notes === "string" ? b.notes.trim().slice(0, 1000) || null : null, actor, t).run();
  await audit(db, `user:${actor}`, prev ? "statement_rule.update" : "statement_rule.create", "statement_rule", id, party);
  return { ok: true as const, id };
}

export async function deleteRule(db: D1Database, actor: string, id: string) {
  const r = await db.prepare("SELECT party FROM statement_rules WHERE id = ?").bind(id).first<{ party: string }>();
  if (!r) return { ok: false as const, error: "Regula nu există." };
  await db.prepare("DELETE FROM statement_rules WHERE id = ?").bind(id).run();
  await audit(db, `user:${actor}`, "statement_rule.delete", "statement_rule", id, r.party);
  return { ok: true as const };
}

// ---------- the automatic lines ----------

type AutoLine = Omit<Line, "id" | "removed" | "reason" | "changed_by" | "changed_at" | "sort">;
const criteriaOf = (rule: Rule | null, cols: NonNullable<ReturnType<typeof partyCols>>) => ({
  basis: (rule?.basis ?? "delivered") as Basis, inc_evaluator: rule?.inc_evaluator ?? 1, inc_verifier: rule?.inc_verifier ?? 1, inc_inspector: rule?.inc_inspector ?? 1,
  referral_pct: rule?.referral_pct ?? null, fixed_amount: rule?.fixed_amount ?? null, fixed_label: rule?.fixed_label ?? null, ...cols,
});
type Criteria = ReturnType<typeof criteriaOf>;

// A report counts in a month by its delivery (the report's date) or by its collection (the "Achitat" tick or the paid invoice).
const DATE_OF: Record<Basis, string> = {
  delivered: "substr(COALESCE(r.report_date, r.delivered_at), 1, 10)",
  collected: "substr(COALESCE(r.collected_at, i.paid_at), 1, 10)",
};
const REPORT_BASE = `FROM reports r LEFT JOIN invoices i ON i.id = r.invoice_id LEFT JOIN entities cl ON cl.id = r.client_id LEFT JOIN entities b ON b.id = r.recipient_id
  LEFT JOIN crm_properties p ON p.id = (SELECT a.property_id FROM assets a WHERE a.report_id = r.id ORDER BY a.is_main DESC LIMIT 1)`;
const REPORT_COLS = `r.id, r.number, r.fee, r.label, COALESCE(cl.name, '') AS client, COALESCE(b.code, b.name) AS bank, p.type, COALESCE(p.full_address, p.city) AS address`;
type RepRow = { id: string; number: string | null; fee: number | null; label: string | null; client: string; bank: string | null; type: string | null; address: string | null; on_date: string | null };
const cap = (s: string | null) => (s ? s.charAt(0) + s.slice(1).toLowerCase() : "");
const repLabel = (r: RepRow) => `Raport ${r.number ? `nr. ${r.number}` : "fără număr"} · ${niceName(r.client) || r.label || "—"}`;
const repDetail = (r: RepRow) => [cap(r.type), r.address, r.bank].filter(Boolean).join(" · ") || null;

/** What the rule gives for a month, computed now (shares and fees as they are today). */
export async function autoLines(db: D1Database, c: Criteria, period: string): Promise<AutoLine[]> {
  const out: AutoLine[] = [];
  const done = `r.status = 'done' AND substr(${DATE_OF[c.basis]}, 1, 7) = ?2`;
  if (c.user_id) {
    const u = await db.prepare("SELECT share_evaluator, share_verifier, inspector_fee_kind, inspector_fee FROM users WHERE id = ?").bind(c.user_id)
      .first<{ share_evaluator: number | null; share_verifier: number | null; inspector_fee_kind: string | null; inspector_fee: number | null }>();
    if (!u) return out;
    const pctLines = async (role: "evaluator" | "verifier", pct: number | null) => {
      if (pct == null) return;
      const { results } = await db.prepare(`SELECT ${REPORT_COLS}, ${DATE_OF[c.basis]} AS on_date ${REPORT_BASE}
          WHERE ${done} AND EXISTS (SELECT 1 FROM report_members m WHERE m.report_id = r.id AND m.user_id = ?1 AND m.role = ?3) ORDER BY on_date, r.number`)
        .bind(c.user_id, period, role).all<RepRow>();
      for (const r of results) out.push({ key: `rep:${r.id}:${role}`, source: role, report_id: r.id, inspection_id: null, label: repLabel(r), detail: repDetail(r), on_date: r.on_date,
        base: r.fee, rate: `${pct}%`, auto_amount: r.fee != null ? round2(r.fee * pct / 100) : 0, amount: r.fee != null ? round2(r.fee * pct / 100) : 0, number: r.number });
    };
    if (c.inc_evaluator) await pctLines("evaluator", u.share_evaluator);
    if (c.inc_verifier) await pctLines("verifier", u.share_verifier);
    // Inspections done in the month, when the person only inspected (not also the main evaluator of the report).
    if (c.inc_inspector && u.inspector_fee != null) {
      const { results } = await db.prepare(`SELECT i.id AS insp_id, substr(i.done_at, 1, 10) AS on_date, ${REPORT_COLS} FROM inspections i JOIN reports r ON r.id = i.report_id
          LEFT JOIN entities cl ON cl.id = r.client_id LEFT JOIN entities b ON b.id = r.recipient_id LEFT JOIN assets a ON a.id = i.asset_id LEFT JOIN crm_properties p ON p.id = a.property_id
          WHERE i.inspector_id = ?1 AND i.status = 'done' AND substr(i.done_at, 1, 7) = ?2 AND r.status <> 'cancelled'
            AND NOT EXISTS (SELECT 1 FROM report_members m WHERE m.report_id = r.id AND m.user_id = ?1 AND m.role = 'evaluator') ORDER BY i.done_at`)
        .bind(c.user_id, period).all<RepRow & { insp_id: string }>();
      for (const r of results) {
        const pct = u.inspector_fee_kind === "pct";
        const amount = pct ? (r.fee != null ? round2(r.fee * u.inspector_fee! / 100) : 0) : u.inspector_fee!;
        out.push({ key: `insp:${r.insp_id}`, source: "inspector", report_id: r.id, inspection_id: r.insp_id, label: `Inspecție · ${repLabel(r)}`, detail: repDetail(r), on_date: r.on_date,
          base: pct ? r.fee : null, rate: pct ? `${u.inspector_fee}%` : `${u.inspector_fee} lei`, auto_amount: amount, amount, number: r.number });
      }
    }
    if (c.referral_pct) {
      const { results } = await db.prepare(`SELECT ${REPORT_COLS}, ${DATE_OF[c.basis]} AS on_date ${REPORT_BASE} WHERE ${done} AND r.referral_user_id = ?1 ORDER BY on_date, r.number`)
        .bind(c.user_id, period).all<RepRow>();
      for (const r of results) out.push({ key: `ref:${r.id}`, source: "referral", report_id: r.id, inspection_id: null, label: `Recomandare · ${repLabel(r)}`, detail: repDetail(r), on_date: r.on_date,
        base: r.fee, rate: `${c.referral_pct}%`, auto_amount: r.fee != null ? round2(r.fee * c.referral_pct / 100) : 0, amount: r.fee != null ? round2(r.fee * c.referral_pct / 100) : 0, number: r.number });
    }
    if (c.fixed_amount) out.push({ key: "fixed", source: "fixed", report_id: null, inspection_id: null, label: c.fixed_label || "Sumă fixă lunară", detail: null, on_date: null, base: null, rate: null, auto_amount: c.fixed_amount, amount: c.fixed_amount });
  } else if (c.contract_id) {
    const { results } = await db.prepare(`SELECT ${REPORT_COLS}, ${DATE_OF[c.basis]} AS on_date ${REPORT_BASE} WHERE ${done} AND r.contract_id = ?1 ORDER BY on_date, r.number`)
      .bind(c.contract_id, period).all<RepRow>();
    for (const r of results) out.push({ key: `rep:${r.id}:report`, source: "report", report_id: r.id, inspection_id: null, label: repLabel(r), detail: repDetail(r), on_date: r.on_date,
      base: r.fee, rate: null, auto_amount: r.fee ?? 0, amount: r.fee ?? 0, number: r.number });
  } else if (c.collaboration_id) {
    // What the collaborating firm owes: the firm's share of the fee (orders.fee_net), else the fee times the collaboration's share.
    const { results } = await db.prepare(`SELECT ${REPORT_COLS}, ${DATE_OF[c.basis]} AS on_date, o.fee_net, o.share, c.share AS cshare ${REPORT_BASE}
        JOIN orders o ON o.id = r.order_id JOIN collaborations c ON c.id = o.collaboration_id WHERE ${done} AND o.collaboration_id = ?1 ORDER BY on_date, r.number`)
      .bind(c.collaboration_id, period).all<RepRow & { fee_net: number | null; share: number | null; cshare: number | null }>();
    for (const r of results) {
      const share = r.share ?? r.cshare;
      const amount = r.fee_net ?? (r.fee != null && share != null ? round2(r.fee * share) : r.fee ?? 0);
      out.push({ key: `rep:${r.id}:report`, source: "report", report_id: r.id, inspection_id: null, label: repLabel(r), detail: repDetail(r), on_date: r.on_date,
        base: r.fee, rate: share != null ? `${Math.round(share * 100)}%` : null, auto_amount: amount, amount, number: r.number });
    }
  }
  return out;
}

// ---------- statements ----------

const ST_SELECT = `SELECT x.*, ${PARTY_SQL}, COALESCE(NULLIF(vu.name, ''), vu.email) AS validated_name, COALESCE(NULLIF(iu.name, ''), iu.email) AS issued_name
  FROM statements x ${PARTY_JOINS} LEFT JOIN users vu ON vu.id = x.validated_by LEFT JOIN users iu ON iu.id = x.issued_by`;
const fixSt = (s: Statement): Statement => ({ ...s, name: niceName(s.name) || s.name });

export async function getStatement(db: D1Database, id: string): Promise<Statement | null> {
  const s = await db.prepare(`${ST_SELECT} WHERE x.id = ?`).bind(id).first<Statement>();
  return s ? fixSt(s) : null;
}

/** The statements: of a month, of a kind, or of one person (what they see of their own). */
export async function listStatements(db: D1Database, f: { period?: string; kind?: Kind; userId?: string; limit?: number } = {}): Promise<Statement[]> {
  const w: string[] = ["x.party IS NOT NULL"], p: string[] = [];
  if (f.period) { w.push(`x.period = ?${p.length + 1}`); p.push(f.period); }
  if (f.kind) { w.push(`x.kind = ?${p.length + 1}`); p.push(f.kind); }
  if (f.userId) { w.push(`x.user_id = ?${p.length + 1}`); p.push(f.userId); }
  const { results } = await db.prepare(`${ST_SELECT} WHERE ${w.join(" AND ")} ORDER BY x.period DESC, x.kind, name LIMIT ${f.limit ?? 500}`).bind(...p).all<Statement>();
  return results.map(fixSt);
}

/** The statement of a party for a month: the existing one, else a new open one (when the party exists). */
export async function openStatement(db: D1Database, actor: string | null, party: string, period: string) {
  const cols = partyCols(party);
  if (!cols || !validPeriod(period)) return { ok: false as const, error: "Borderou necunoscut." };
  const cur = await db.prepare("SELECT id FROM statements WHERE party = ? AND period = ?").bind(party, period).first<{ id: string }>();
  if (cur) return { ok: true as const, id: cur.id, created: false };
  const rule = await ruleFor(db, party);
  if (!rule) {
    const ok = cols.user_id ? await db.prepare("SELECT 1 AS x FROM users WHERE id = ?").bind(cols.user_id).first()
      : cols.contract_id ? await db.prepare("SELECT 1 AS x FROM contracts WHERE id = ?").bind(cols.contract_id).first()
      : await db.prepare("SELECT 1 AS x FROM collaborations WHERE id = ?").bind(cols.collaboration_id).first();
    if (!ok) return { ok: false as const, error: "Persoana / contractul nu există." };
  }
  const id = uuid(), t = now();
  await db.prepare(`INSERT INTO statements (id, kind, party, period, user_id, contract_id, collaboration_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)`)
    .bind(id, cols.kind, party, period, cols.user_id, cols.contract_id, cols.collaboration_id, t, t).run();
  if (actor) await audit(db, `user:${actor}`, "statement.open", "statement", id, `${party} · ${period}`);
  return { ok: true as const, id, created: true };
}

/**
 * The lines of a statement. Open: the automatic lines computed now, with the adjustments stored over them (a line
 * removed, an amount changed) and the manual lines. Validated / issued: only what is stored (frozen).
 */
export async function linesOf(db: D1Database, s: Statement): Promise<Line[]> {
  const { results: stored } = await db.prepare(`SELECT l.*, COALESCE(NULLIF(u.name, ''), u.email) AS changed_name, r.number FROM statement_lines l
      LEFT JOIN users u ON u.id = l.changed_by LEFT JOIN reports r ON r.id = l.report_id WHERE l.statement_id = ? ORDER BY l.sort, l.created_at`).bind(s.id).all<Line>();
  if (s.status !== "open") return stored;
  const rule = await ruleFor(db, s.party);
  const auto = await autoLines(db, criteriaOf(rule, partyCols(s.party)!), s.period);
  const byKey = new Map(stored.filter((l) => l.key).map((l) => [l.key!, l]));
  const lines: Line[] = auto.map((a, i) => {
    const o = byKey.get(a.key!);
    // an adjusted automatic line keeps the adjustment; the computed amount follows today's data
    return o ? { ...o, auto_amount: a.auto_amount, base: a.base, rate: a.rate, on_date: a.on_date, label: a.label, detail: a.detail, number: a.number, amount: o.removed ? a.amount : o.amount, sort: i }
      : { ...a, id: null, removed: 0, reason: null, changed_by: null, changed_at: null, sort: i };
  });
  // adjustments of lines that are no longer computed (the report was reopened, say): shown as removed by the data
  for (const o of stored) {
    if (o.key && !auto.some((a) => a.key === o.key) && !o.removed) lines.push({ ...o, auto_amount: 0, detail: [o.detail, "nu mai intră în lună după datele de azi"].filter(Boolean).join(" · "), sort: 10_000 });
    if (!o.key) lines.push({ ...o, sort: 20_000 + o.sort });
  }
  return lines.sort((a, b) => a.sort - b.sort);
}

/** Validation freezes the lines as they are now; the owner can still adjust them until the statement is issued. */
export async function validateStatement(db: D1Database, actor: string, id: string) {
  const s = await getStatement(db, id);
  if (!s) return { ok: false as const, error: "Borderoul nu există." };
  if (s.status !== "open") return { ok: false as const, error: "Borderoul e deja validat." };
  const lines = await linesOf(db, s);
  const t = now();
  const stmts = lines.filter((l) => !l.id).map((l, i) => db.prepare(`INSERT INTO statement_lines (id, statement_id, key, source, report_id, inspection_id, label, detail, on_date, base, rate, auto_amount, amount, removed, sort, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`)
    .bind(uuid(), id, l.key, l.source, l.report_id, l.inspection_id, l.label, l.detail, l.on_date, l.base, l.rate, l.auto_amount, l.amount, i, t));
  // the adjusted automatic lines get today's computed amount and labels too
  for (const l of lines.filter((l) => l.id && l.key)) stmts.push(db.prepare("UPDATE statement_lines SET auto_amount = ?, base = ?, rate = ?, on_date = ?, label = ?, detail = ?, sort = ? WHERE id = ?")
    .bind(l.auto_amount, l.base, l.rate, l.on_date, l.label, l.detail, l.sort, l.id));
  const rule = await ruleFor(db, s.party);
  stmts.push(db.prepare("UPDATE statements SET status = 'validated', validated_at = ?, validated_by = ?, total = ?, criteria = ?, updated_at = ? WHERE id = ?")
    .bind(t, actor, totalOf(lines), JSON.stringify(criteriaOf(rule, partyCols(s.party)!)), t, id));
  await db.batch(stmts);
  await audit(db, `user:${actor}`, "statement.validate", "statement", id, `${lines.filter((l) => !l.removed).length} linii · ${totalOf(lines)} lei`);
  return { ok: true as const };
}

/** Issued: numbered (BP-<an>-<nr> for payouts, BI-<an>-<nr> for receivables), dated, locked. */
export async function issueStatement(db: D1Database, actor: string, id: string) {
  const s = await getStatement(db, id);
  if (!s) return { ok: false as const, error: "Borderoul nu există." };
  if (s.status === "issued") return { ok: false as const, error: "Borderoul e deja emis." };
  if (s.status === "open") return { ok: false as const, error: "Validează întâi borderoul." };
  const day = bucharestDay(), year = day.slice(0, 4), prefix = s.kind === "payout" ? "BP" : "BI";
  const total = totalOf(await linesOf(db, s));
  for (let attempt = 0; attempt < 5; attempt++) {
    const last = await db.prepare("SELECT MAX(CAST(substr(number, 9) AS INTEGER)) AS n FROM statements WHERE number LIKE ?").bind(`${prefix}-${year}-%`).first<{ n: number | null }>();
    const number = `${prefix}-${year}-${String((last?.n ?? 0) + 1).padStart(3, "0")}`;
    try {
      await db.prepare("UPDATE statements SET status = 'issued', number = ?, issued_on = ?, issued_by = ?, total = ?, updated_at = ? WHERE id = ? AND status = 'validated'")
        .bind(number, day, actor, total, now(), id).run();
      await audit(db, `user:${actor}`, "statement.issue", "statement", id, `${number} · ${total} lei`);
      return { ok: true as const, number };
    } catch (e) {
      if (!String(e).includes("UNIQUE")) throw e;
    }
  }
  return { ok: false as const, error: "Nu am putut lua numărul. Încearcă din nou." };
}

/** Back one step, with the reason: issued → validated (keeps the number), validated → open (the unadjusted lines are computed again). */
export async function reopenStatement(db: D1Database, actor: string, id: string, reason: string) {
  const s = await getStatement(db, id);
  if (!s) return { ok: false as const, error: "Borderoul nu există." };
  if (s.status === "open") return { ok: true as const };
  if (!reason) return { ok: false as const, error: "Scrie motivul." };
  const t = now();
  if (s.status === "issued") {
    await db.prepare("UPDATE statements SET status = 'validated', updated_at = ? WHERE id = ?").bind(t, id).run();
  } else {
    await db.batch([
      db.prepare("DELETE FROM statement_lines WHERE statement_id = ? AND key IS NOT NULL AND removed = 0 AND changed_at IS NULL").bind(id),
      db.prepare("UPDATE statements SET status = 'open', validated_at = NULL, validated_by = NULL, total = NULL, criteria = NULL, updated_at = ? WHERE id = ?").bind(t, id),
    ]);
  }
  await audit(db, `user:${actor}`, "statement.reopen", "statement", id, `${s.status === "issued" ? "emis → validat" : "validat → în curs"}: ${reason}`);
  return { ok: true as const };
}

export async function deleteStatement(db: D1Database, actor: string, id: string) {
  const s = await getStatement(db, id);
  if (!s) return { ok: false as const, error: "Borderoul nu există." };
  if (s.status === "issued") return { ok: false as const, error: "Un borderou emis nu se șterge; redeschide-l întâi." };
  await db.batch([db.prepare("DELETE FROM statement_lines WHERE statement_id = ?").bind(id), db.prepare("DELETE FROM statements WHERE id = ?").bind(id)]);
  await audit(db, `user:${actor}`, "statement.delete", "statement", id, `${s.party} · ${s.period}`);
  return { ok: true as const };
}

export async function setNotes(db: D1Database, actor: string, id: string, notes: string) {
  await db.prepare("UPDATE statements SET notes = ?, updated_at = ? WHERE id = ?").bind(notes.trim().slice(0, 2000) || null, now(), id).run();
  await audit(db, `user:${actor}`, "statement.notes", "statement", id);
  return { ok: true as const };
}

// ---------- adjustments ----------

const refreshTotal = async (db: D1Database, s: Statement) => {
  if (s.status === "open") return;
  await db.prepare("UPDATE statements SET total = ?, updated_at = ? WHERE id = ?").bind(totalOf(await linesOf(db, s)), now(), s.id).run();
};

/** A line added by hand (positive or negative), with the reason. */
export async function addLine(db: D1Database, actor: string, id: string, b: Record<string, unknown>) {
  const s = await getStatement(db, id);
  if (!s) return { ok: false as const, error: "Borderoul nu există." };
  if (s.status === "issued") return { ok: false as const, error: "Borderoul e emis: redeschide-l ca să îl modifici." };
  const label = typeof b.label === "string" ? b.label.trim().slice(0, 200) : "";
  const amount = typeof b.amount === "string" ? Number(b.amount.replace(",", ".")) : Number(b.amount);
  const reason = typeof b.reason === "string" ? b.reason.trim().slice(0, 500) : "";
  if (!label) return { ok: false as const, error: "Scrie ce reprezintă suma." };
  if (!Number.isFinite(amount) || amount === 0) return { ok: false as const, error: "Scrie suma (poate fi și negativă)." };
  const t = now();
  const sort = ((await db.prepare("SELECT MAX(sort) AS m FROM statement_lines WHERE statement_id = ?").bind(id).first<{ m: number | null }>())?.m ?? 0) + 1;
  await db.prepare(`INSERT INTO statement_lines (id, statement_id, key, source, label, detail, amount, auto_amount, reason, changed_by, changed_at, sort, created_at)
      VALUES (?, ?, NULL, 'manual', ?, NULL, ?, NULL, ?, ?, ?, ?, ?)`).bind(uuid(), id, label, round2(amount), reason || null, actor, t, sort, t).run();
  await refreshTotal(db, s);
  await audit(db, `user:${actor}`, "statement.line_add", "statement", id, `${label}: ${round2(amount)} lei${reason ? ` (${reason})` : ""}`);
  return { ok: true as const };
}

/** An automatic line removed / put back, or its amount changed — with the reason, kept on the line. */
export async function adjustLine(db: D1Database, actor: string, id: string, b: Record<string, unknown>) {
  const s = await getStatement(db, id);
  if (!s) return { ok: false as const, error: "Borderoul nu există." };
  if (s.status === "issued") return { ok: false as const, error: "Borderoul e emis: redeschide-l ca să îl modifici." };
  const reason = typeof b.reason === "string" ? b.reason.trim().slice(0, 500) : "";
  const key = typeof b.key === "string" ? b.key : null, lineId = typeof b.line === "string" ? b.line : null;
  const lines = await linesOf(db, s);
  const l = lines.find((x) => (lineId && x.id === lineId) || (key && x.key === key));
  if (!l) return { ok: false as const, error: "Linia nu există." };
  const t = now();
  const restore = b.restore === true;
  const removed = b.removed === true;
  const amount = b.amount == null || b.amount === "" ? null : typeof b.amount === "string" ? Number(b.amount.replace(",", ".")) : Number(b.amount);
  if (amount != null && !Number.isFinite(amount)) return { ok: false as const, error: "Suma nu e validă." };
  if (!restore && !reason) return { ok: false as const, error: "Scrie motivul modificării." };
  if (restore) {
    // back to the computed line: an automatic one is forgotten (computed again), a manual one cannot be restored
    if (!l.key) return { ok: false as const, error: "O linie manuală se șterge, nu se restaurează." };
    if (l.id) await db.prepare(s.status === "open" ? "DELETE FROM statement_lines WHERE id = ?" : "UPDATE statement_lines SET removed = 0, amount = auto_amount, reason = NULL, changed_by = NULL, changed_at = NULL WHERE id = ?").bind(l.id).run();
    await refreshTotal(db, s);
    await audit(db, `user:${actor}`, "statement.line_restore", "statement", id, l.label);
    return { ok: true as const };
  }
  const next = removed ? l.amount : amount ?? l.amount;
  if (l.id) {
    await db.prepare("UPDATE statement_lines SET removed = ?, amount = ?, reason = ?, changed_by = ?, changed_at = ? WHERE id = ?").bind(removed ? 1 : 0, round2(next), reason, actor, t, l.id).run();
  } else {
    await db.prepare(`INSERT INTO statement_lines (id, statement_id, key, source, report_id, inspection_id, label, detail, on_date, base, rate, auto_amount, amount, removed, reason, changed_by, changed_at, sort, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(uuid(), id, l.key, l.source, l.report_id, l.inspection_id, l.label, l.detail, l.on_date, l.base, l.rate, l.auto_amount, round2(next), removed ? 1 : 0, reason, actor, t, l.sort, t).run();
  }
  await refreshTotal(db, s);
  await audit(db, `user:${actor}`, removed ? "statement.line_remove" : "statement.line_change", "statement", id, `${l.label}${removed ? "" : `: ${l.amount} → ${round2(next)} lei`} (${reason})`);
  return { ok: true as const };
}

export async function deleteLine(db: D1Database, actor: string, id: string, lineId: string) {
  const s = await getStatement(db, id);
  if (!s) return { ok: false as const, error: "Borderoul nu există." };
  if (s.status === "issued") return { ok: false as const, error: "Borderoul e emis: redeschide-l ca să îl modifici." };
  const l = await db.prepare("SELECT label, key FROM statement_lines WHERE id = ? AND statement_id = ?").bind(lineId, id).first<{ label: string; key: string | null }>();
  if (!l || l.key) return { ok: false as const, error: "Doar liniile adăugate manual se șterg." };
  await db.prepare("DELETE FROM statement_lines WHERE id = ?").bind(lineId).run();
  await refreshTotal(db, s);
  await audit(db, `user:${actor}`, "statement.line_delete", "statement", id, l.label);
  return { ok: true as const };
}

/** The month's board: every active rule with its statement of the month (existing, or computed live), for the list. */
export async function monthBoard(db: D1Database, period: string, kind: Kind, member?: Set<string> | null) {
  const [rules, existing] = await Promise.all([listRules(db, kind), listStatements(db, { period, kind })]);
  const rows: { party: string; name: string; sub: string | null; statement: Statement | null; total: number; lines: number; rule: Rule | null }[] = [];
  const seen = new Set<string>();
  for (const s of existing) {
    seen.add(s.party);
    const lines = linesWith(await linesOf(db, s), member ?? null);
    // filtered by a team member: a statement with none of their reports is left out
    if (member && !lines.length) continue;
    rows.push({ party: s.party, name: s.name, sub: s.sub, statement: s, total: member || s.status === "open" ? totalOf(lines) : s.total ?? totalOf(lines), lines: lines.filter((l) => !l.removed).length, rule: rules.find((r) => r.party === s.party) ?? null });
  }
  for (const r of rules) {
    // a manual rule shows up only once its statement is opened
    if (seen.has(r.party) || !r.active || r.recurrence === "manual") continue;
    const auto = await autoLines(db, criteriaOf(r, partyCols(r.party)!), period);
    const lines = member ? auto.filter((l) => l.report_id && member.has(l.report_id)) : auto;
    if (member && !lines.length) continue;
    rows.push({ party: r.party, name: r.name, sub: r.sub, statement: null, total: round2(lines.reduce((s, l) => s + l.amount, 0)), lines: lines.length, rule: r });
  }
  return rows.sort((a, b) => a.name.localeCompare(b.name, "ro"));
}

export async function statementLog(db: D1Database, id: string) {
  const { results } = await db.prepare(`SELECT a.at, a.actor, a.action, a.details, COALESCE(NULLIF(u.name, ''), u.email) AS actor_name FROM audit_log a
      LEFT JOIN users u ON a.actor = 'user:' || u.id WHERE a.entity = 'statement' AND a.entity_id = ? ORDER BY a.at DESC LIMIT 60`).bind(id)
    .all<{ at: string; actor: string; action: string; details: string | null; actor_name: string | null }>();
  return results;
}

/**
 * The month's revenue: the fees of the reports delivered in the month — own work (direct clients, framework
 * contracts: the whole fee) and collaborations (the firm's share of the fee). For the profit / loss next to the
 * month's payouts.
 */
export async function monthRevenue(db: D1Database, period: string, memberId?: string | null) {
  const r = await db.prepare(`SELECT
      SUM(CASE WHEN o.collaboration_id IS NULL THEN 1 ELSE 0 END) AS own_n, SUM(CASE WHEN o.collaboration_id IS NULL THEN COALESCE(r.fee, 0) ELSE 0 END) AS own,
      SUM(CASE WHEN o.collaboration_id IS NOT NULL THEN 1 ELSE 0 END) AS collab_n,
      SUM(CASE WHEN o.collaboration_id IS NOT NULL THEN COALESCE(o.fee_net, r.fee * COALESCE(o.share, c.share), r.fee, 0) ELSE 0 END) AS collab
    FROM reports r LEFT JOIN orders o ON o.id = r.order_id LEFT JOIN collaborations c ON c.id = o.collaboration_id
    WHERE r.status = 'done' AND substr(COALESCE(r.report_date, r.delivered_at), 1, 7) = ?1
      AND (?2 = '' OR EXISTS (SELECT 1 FROM report_members m WHERE m.report_id = r.id AND m.user_id = ?2))`).bind(period, memberId ?? "")
    .first<{ own_n: number | null; own: number | null; collab_n: number | null; collab: number | null }>();
  const own = round2(r?.own ?? 0), collab = round2(r?.collab ?? 0);
  return { own, ownN: r?.own_n ?? 0, collab, collabN: r?.collab_n ?? 0, total: round2(own + collab) };
}

// ---------- fixed monthly costs ----------


type CostRow = Omit<FixedCost, "splits"> & { splits: string | null };
const costOf = (r: CostRow): FixedCost => {
  let splits: Record<string, number> = {};
  try { splits = r.splits ? (JSON.parse(r.splits) as Record<string, number>) : {}; } catch { splits = {}; }
  return { ...r, splits };
};

export const listFixedCosts = async (db: D1Database) =>
  (await db.prepare("SELECT id, label, amount, from_period, to_period, notes, splits FROM fixed_costs ORDER BY to_period IS NOT NULL, label").all<CostRow>()).results.map(costOf);

/**
 * The fixed costs running in a month and their sum; seen through an administrator, only the costs they share, each
 * with their percent of it.
 */
export async function monthFixedCosts(db: D1Database, period: string, memberId?: string | null) {
  const { results } = await db.prepare("SELECT id, label, amount, from_period, to_period, notes, splits FROM fixed_costs WHERE from_period <= ?1 AND (to_period IS NULL OR to_period >= ?1) ORDER BY label")
    .bind(period).all<CostRow>();
  const items = results.map(costOf).map((c) => {
    const pct = memberId ? c.splits[memberId] ?? 0 : 100;
    return { ...c, pct, share: round2(c.amount * pct / 100) };
  }).filter((c) => c.share > 0);
  return { items, total: round2(items.reduce((s, c) => s + c.share, 0)) };
}

export async function saveFixedCost(db: D1Database, actor: string, b: Record<string, unknown>) {
  const label = typeof b.label === "string" ? b.label.trim().slice(0, 120) : "";
  const amount = typeof b.amount === "string" ? Number(b.amount.replace(/\s/g, "").replace(",", ".")) : Number(b.amount);
  const from = typeof b.from_period === "string" ? b.from_period : "", to = typeof b.to_period === "string" && b.to_period ? b.to_period : null;
  if (!label) return { ok: false as const, error: "Scrie ce cheltuială e." };
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false as const, error: "Scrie suma lunară." };
  if (!validPeriod(from)) return { ok: false as const, error: "Alege luna de la care se aplică." };
  if (to && (!validPeriod(to) || to < from)) return { ok: false as const, error: "Luna de sfârșit e înaintea celei de început." };
  const id = typeof b.id === "string" && b.id ? b.id : uuid(), t = now();
  const notes = typeof b.notes === "string" ? b.notes.trim().slice(0, 500) || null : null;
  // the administrators' shares: percents between 0 and 100, together at most 100
  const splits: Record<string, number> = {};
  if (b.splits && typeof b.splits === "object") {
    const admins = new Set((await memberChoices(db)).map((a) => a.id));
    for (const [k, v] of Object.entries(b.splits as Record<string, unknown>)) {
      const n = typeof v === "string" ? Number(v.replace(",", ".")) : Number(v);
      if (admins.has(k) && Number.isFinite(n) && n > 0) splits[k] = Math.min(100, round2(n));
    }
  }
  if (Object.values(splits).reduce((a, n) => a + n, 0) > 100.001) return { ok: false as const, error: "Procentele administratorilor depășesc 100%." };
  const sp = Object.keys(splits).length ? JSON.stringify(splits) : null;
  const prev = await db.prepare("SELECT id FROM fixed_costs WHERE id = ?").bind(id).first();
  if (prev) await db.prepare("UPDATE fixed_costs SET label = ?, amount = ?, from_period = ?, to_period = ?, notes = ?, splits = ?, updated_at = ? WHERE id = ?").bind(label, round2(amount), from, to, notes, sp, t, id).run();
  else await db.prepare("INSERT INTO fixed_costs (id, label, amount, from_period, to_period, notes, splits, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(id, label, round2(amount), from, to, notes, sp, actor, t, t).run();
  await audit(db, `user:${actor}`, prev ? "fixed_cost.update" : "fixed_cost.create", "fixed_cost", id, `${label}: ${round2(amount)} lei/lună din ${from}${to ? ` până în ${to}` : ""}`);
  return { ok: true as const, id };
}

export async function deleteFixedCost(db: D1Database, actor: string, id: string) {
  const c = await db.prepare("SELECT label FROM fixed_costs WHERE id = ?").bind(id).first<{ label: string }>();
  if (!c) return { ok: false as const, error: "Cheltuiala nu există." };
  await db.prepare("DELETE FROM fixed_costs WHERE id = ?").bind(id).run();
  await audit(db, `user:${actor}`, "fixed_cost.delete", "fixed_cost", id, c.label);
  return { ok: true as const };
}

// ---------- the member filter ----------

/** The reports of a month's statements and revenue in which a user was in the team (any role). */
export const memberReports = async (db: D1Database, userId: string) =>
  new Set((await db.prepare("SELECT report_id FROM report_members WHERE user_id = ?").bind(userId).all<{ report_id: string }>()).results.map((r) => r.report_id));

/** Only the lines on reports the user was part of (manual and fixed lines have no report: left out). */
export const linesWith = (lines: Line[], reports: Set<string> | null) => (reports ? lines.filter((l) => l.report_id && reports.has(l.report_id)) : lines);

/** The filter's choices: the administrators (owner and admins) of the firm. */
export const memberChoices = async (db: D1Database) =>
  (await db.prepare(`SELECT u.id, COALESCE(NULLIF(u.name, ''), u.email) AS name FROM users u WHERE u.kind = 'internal' AND u.status <> 'deleted' AND u.role IN ('owner', 'admin') ORDER BY name`)
    .all<{ id: string; name: string }>()).results;

// ---------- export (XLSX) ----------

const exportKey = (userId: string) => `export_fields:statements:${userId}`;

/** The columns the user chose last time (else the default ones). */
export async function exportFields(db: D1Database, userId: string): Promise<string[]> {
  const row = await db.prepare("SELECT value FROM settings WHERE key = ?").bind(exportKey(userId)).first<{ value: string }>().catch(() => null);
  try {
    const v = row ? (JSON.parse(row.value) as unknown) : null;
    if (Array.isArray(v)) { const keys = v.filter((k): k is string => typeof k === "string" && EXPORT_FIELDS.some((f) => f.key === k)); if (keys.length) return keys; }
  } catch { /* the default */ }
  return DEFAULT_EXPORT;
}

export async function saveExportFields(db: D1Database, userId: string, keys: string[]) {
  const clean = EXPORT_FIELDS.map((f) => f.key).filter((k) => keys.includes(k));
  await db.prepare("INSERT INTO settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
    .bind(exportKey(userId), JSON.stringify(clean), now(), userId).run();
  return clean;
}

type RepExport = Record<string, string | number | null>;
/** The report data behind the lines, by report id. */
async function reportData(db: D1Database, ids: string[]) {
  const out = new Map<string, RepExport>();
  for (let i = 0; i < ids.length; i += 80) {
    const part = ids.slice(i, i + 80);
    const { results } = await db.prepare(`SELECT r.id, r.number, substr(r.report_date, 1, 10) AS report_date, substr(r.delivered_at, 1, 10) AS delivered_at, cl.name AS client, cl.cui AS client_cui,
        b.name AS recipient, r.bank_branch, o.bank_ref, k.number AS contract, r.purpose, r.report_type, r.value_type, r.fee, r.fee_gross,
        CASE WHEN r.collected = 1 OR iv.status = 'paid' THEN 'da' ELSE 'nu' END AS collected, CASE WHEN iv.id IS NOT NULL THEN iv.series || ' ' || iv.number END AS invoice,
        r.result_value, r.result_eur, p.type AS prop_type, COALESCE(p.full_address, p.city) AS address, p.city, p.county, p.cf_number, COALESCE(p.cad_building, p.cad_land) AS cad,
        p.usable_area, p.land_area,
        (SELECT group_concat(COALESCE(NULLIF(u.name, ''), u.email), ', ') FROM report_members m JOIN users u ON u.id = m.user_id WHERE m.report_id = r.id AND m.role = 'evaluator') AS evaluator,
        (SELECT group_concat(COALESCE(NULLIF(u.name, ''), u.email), ', ') FROM report_members m JOIN users u ON u.id = m.user_id WHERE m.report_id = r.id AND m.role = 'verifier') AS verifier,
        (SELECT group_concat(COALESCE(NULLIF(u.name, ''), u.email), ', ') FROM report_members m JOIN users u ON u.id = m.user_id WHERE m.report_id = r.id AND m.role = 'inspector') AS inspector,
        (SELECT COALESCE(NULLIF(u.name, ''), u.email) FROM users u WHERE u.id = r.referral_user_id) AS referral
      FROM reports r LEFT JOIN entities cl ON cl.id = r.client_id LEFT JOIN entities b ON b.id = r.recipient_id LEFT JOIN orders o ON o.id = r.order_id
        LEFT JOIN contracts k ON k.id = r.contract_id LEFT JOIN invoices iv ON iv.id = r.invoice_id
        LEFT JOIN crm_properties p ON p.id = (SELECT a.property_id FROM assets a WHERE a.report_id = r.id ORDER BY a.is_main DESC LIMIT 1)
      WHERE r.id IN (${part.map(() => "?").join(", ")})`).bind(...part).all<RepExport & { id: string }>();
    for (const r of results) out.set(r.id, { ...r, client: niceName(String(r.client ?? "")) || r.client, recipient: niceName(String(r.recipient ?? "")) || r.recipient, prop_type: r.prop_type ? String(r.prop_type).charAt(0) + String(r.prop_type).slice(1).toLowerCase() : null });
  }
  return out;
}

/** The statement as a spreadsheet, with the chosen columns, in the order of EXPORT_FIELDS. */
export async function exportStatement(db: D1Database, s: Statement, lines: Line[], keys: string[]) {
  const fields = EXPORT_FIELDS.filter((f) => keys.includes(f.key));
  const reps = await reportData(db, [...new Set(lines.map((l) => l.report_id).filter((x): x is string => !!x))]);
  const ymd = (d: string | null | undefined) => (d ? String(d).slice(0, 10).split("-").reverse().join(".") : null);
  const lineVal = (l: Line, i: number, k: string): Cell => {
    switch (k) {
      case "nr": return i + 1;
      case "line": return l.label;
      case "source": return SOURCE_LABEL[l.source];
      case "on_date": return ymd(l.on_date);
      case "base": return l.base;
      case "rate": return l.rate;
      case "auto_amount": return l.auto_amount;
      case "amount": return l.removed ? 0 : l.amount;
      case "adjust": return l.removed ? "scoasă" : !l.key ? "adăugată manual" : l.changed_at ? "modificată" : null;
      case "reason": return l.reason;
    }
    const r = l.report_id ? reps.get(l.report_id) : undefined;
    const v = r?.[k] ?? null;
    return k === "report_date" || k === "delivered_at" ? ymd(v as string | null) : v;
  };
  const rows = lines.map((l, i) => fields.map((f) => lineVal(l, i, f.key)));
  // the total row, under the amounts
  const at = fields.findIndex((f) => f.key === "amount");
  if (at >= 0) rows.push(fields.map((f, i) => (i === at ? totalOf(lines) : i === 0 ? "TOTAL" : null)));
  const widths = fields.map((f) => (["line", "address", "reason", "client", "recipient"].includes(f.key) ? 40 : f.key === "nr" ? 7 : 18));
  return xlsx(`${s.number ?? "Borderou"} ${s.period}`, fields.map((f) => f.label), rows, widths);
}
