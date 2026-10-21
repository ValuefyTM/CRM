// Server-only: the owner's analytics — a year of the firm's profitability, month by month, computed straight from the
// data (the same rules as the statements: revenue by source, the collaborators' shares, one paid inspection per report,
// the fixed costs and their splits, the associates' cuts). A validated / issued payout statement counts with its total.
import { niceName } from "./labels";
import { monthFixedCosts } from "./statements";

const round2 = (n: number) => Math.round(n * 100) / 100;
export type Src = "direct" | "framework" | "collab";
export const SRC_LABEL: Record<Src, string> = { direct: "Lucrări directe", framework: "Contracte cadru", collab: "Colaborări" };

type Rep = {
  id: string; m: string; fee: number | null; collab_id: string | null; firm: string | null; amount: number; fw: number | null; contract_id: string | null;
  contract_no: string | null; contract_bank: string | null; bank: string | null; report_type: string | null;
};
type Member = { report_id: string; user_id: string; role: string };
type Insp = { id: string; report_id: string; inspector_id: string; m: string; is_main: number | null; done_at: string };
type User = { id: string; name: string; role: string; pay_mode: string | null; share_evaluator: number | null; share_verifier: number | null;
  inspector_fee_kind: string | null; inspector_fee: number | null; profit_share: number | null };

export type MonthRow = { m: string; revenue: number; bySrc: Record<Src, number>; reports: number; paid: number; fixed: number; fixedOwner: number; profit: number; cuts: number; net: number };

export async function yearAnalytics(db: D1Database, year: number) {
  const from = `${year}-01`, to = `${year}-12`;
  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
  const DATE = "substr(COALESCE(r.report_date, r.delivered_at), 1, 7)";
  const [reps, users, stored] = await Promise.all([
    db.prepare(`SELECT r.id, ${DATE} AS m, r.fee, o.collaboration_id AS collab_id, cf.name AS firm, r.report_type,
        CASE WHEN o.collaboration_id IS NOT NULL THEN COALESCE(o.fee_net, r.fee * COALESCE(o.share, c.share), r.fee, 0) ELSE COALESCE(r.fee, 0) END AS amount,
        k.kind = 'framework' AS fw, k.id AS contract_id, k.number AS contract_no, kb.name AS contract_bank, b.name AS bank
      FROM reports r LEFT JOIN orders o ON o.id = r.order_id LEFT JOIN collaborations c ON c.id = o.collaboration_id LEFT JOIN entities cf ON cf.id = c.firm_id
        LEFT JOIN contracts k ON k.id = r.contract_id LEFT JOIN entities kb ON kb.id = k.client_id LEFT JOIN entities b ON b.id = r.recipient_id
      WHERE r.status = 'done' AND ${DATE} BETWEEN ?1 AND ?2`).bind(from, to).all<Rep>(),
    db.prepare(`SELECT id, COALESCE(NULLIF(name, ''), email) AS name, role, pay_mode, share_evaluator, share_verifier, inspector_fee_kind, inspector_fee, profit_share
      FROM users WHERE kind = 'internal'`).all<User>(),
    db.prepare("SELECT user_id, period, total FROM statements WHERE kind = 'payout' AND status <> 'open' AND period BETWEEN ?1 AND ?2 AND user_id IS NOT NULL")
      .bind(from, to).all<{ user_id: string; period: string; total: number | null }>(),
  ]);
  const R = reps.results;
  const byId = new Map(R.map((r) => [r.id, r]));
  const U = new Map(users.results.map((u) => [u.id, u]));
  const ids = R.map((r) => r.id);
  // the team of the year's reports, and the inspections done in the year
  const members: Member[] = [];
  for (let i = 0; i < ids.length; i += 90) {
    const part = ids.slice(i, i + 90);
    const ph = part.map((_, j) => `?${j + 1}`).join(", ");
    members.push(...(await db.prepare(`SELECT report_id, user_id, role FROM report_members WHERE report_id IN (${ph})`).bind(...part).all<Member>()).results);
  }
  const insp = (await db.prepare(`SELECT i.id, i.report_id, i.inspector_id, substr(i.done_at, 1, 7) AS m, a.is_main, i.done_at FROM inspections i
      JOIN reports r ON r.id = i.report_id LEFT JOIN assets a ON a.id = i.asset_id
      WHERE i.status = 'done' AND r.status <> 'cancelled' AND i.inspector_id IS NOT NULL AND substr(i.done_at, 1, 7) BETWEEN ?1 AND ?2`).bind(from, to).all<Insp & { fee?: number }>()).results;

  const src = (r: Rep): Src => (r.collab_id ? "collab" : r.fw ? "framework" : "direct");
  // who is paid on the statement: not the owner, not who is paid with a share of the profit
  const paidUser = (u: User | undefined) => !!u && u.role !== "owner" && u.pay_mode !== "profit";

  // payouts, computed: [user, month, report, amount]
  const pay: { user: string; m: string; report: string; amount: number; kind: "evaluator" | "verifier" | "inspector" }[] = [];
  const evaluatorOf = new Map<string, Set<string>>();
  for (const x of members) if (x.role === "evaluator") (evaluatorOf.get(x.report_id) ?? evaluatorOf.set(x.report_id, new Set()).get(x.report_id)!).add(x.user_id);
  for (const x of members) {
    const r = byId.get(x.report_id), u = U.get(x.user_id);
    if (!r || !paidUser(u) || r.fee == null) continue;
    const pct = x.role === "evaluator" ? u!.share_evaluator : x.role === "verifier" ? u!.share_verifier : null;
    if (pct != null) pay.push({ user: x.user_id, m: r.m, report: r.id, amount: round2(r.fee * pct / 100), kind: x.role as "evaluator" | "verifier" });
  }
  // one inspection per report and inspector (the main asset's), when they are not also its main evaluator
  const firstInsp = new Map<string, Insp>();
  for (const i of insp) {
    const k = `${i.inspector_id}:${i.report_id}`, cur = firstInsp.get(k);
    if (!cur || (i.is_main ?? 0) > (cur.is_main ?? 0) || ((i.is_main ?? 0) === (cur.is_main ?? 0) && i.done_at < cur.done_at)) firstInsp.set(k, i);
  }
  const feeOf = new Map((await (async () => {
    const need = [...new Set([...firstInsp.values()].map((i) => i.report_id).filter((id) => !byId.has(id)))];
    const out: [string, number | null][] = [];
    for (let i = 0; i < need.length; i += 90) {
      const part = need.slice(i, i + 90);
      out.push(...(await db.prepare(`SELECT id, fee FROM reports WHERE id IN (${part.map((_, j) => `?${j + 1}`).join(", ")})`).bind(...part).all<{ id: string; fee: number | null }>()).results.map((x) => [x.id, x.fee] as [string, number | null]));
    }
    return out;
  })()));
  for (const i of firstInsp.values()) {
    const u = U.get(i.inspector_id);
    if (!paidUser(u) || u!.inspector_fee == null || evaluatorOf.get(i.report_id)?.has(i.inspector_id)) continue;
    const fee = byId.get(i.report_id)?.fee ?? feeOf.get(i.report_id) ?? null;
    const amount = u!.inspector_fee_kind === "pct" ? (fee != null ? round2(fee * u!.inspector_fee / 100) : 0) : u!.inspector_fee;
    pay.push({ user: i.inspector_id, m: i.m, report: i.report_id, amount, kind: "inspector" });
  }
  // a validated / issued statement counts with its own total (adjustments included)
  const storedTotal = new Map(stored.results.map((s) => [`${s.user_id}:${s.period}`, s.total ?? 0]));
  const paidUM = new Map<string, number>();
  for (const p of pay) paidUM.set(`${p.user}:${p.m}`, round2((paidUM.get(`${p.user}:${p.m}`) ?? 0) + p.amount));
  for (const [k, v] of storedTotal) paidUM.set(k, v);
  const paidOnReport = new Map<string, number>();
  for (const p of pay) paidOnReport.set(p.report, round2((paidOnReport.get(p.report) ?? 0) + p.amount));

  // fixed costs month by month, with each associate's split
  const fixed = await Promise.all(months.map((m) => monthFixedCosts(db, m)));
  const associates = users.results.filter((u) => u.role !== "owner" && u.pay_mode === "profit" && (u.profit_share ?? 0) > 0);
  const teamOf = new Map<string, Set<string>>();
  for (const x of members) (teamOf.get(x.user_id) ?? teamOf.set(x.user_id, new Set()).get(x.user_id)!).add(x.report_id);

  const assoc = associates.map((a) => {
    const mine = teamOf.get(a.id) ?? new Set<string>();
    const byMonth = months.map((m, i) => {
      const revenue = round2(R.filter((r) => r.m === m && mine.has(r.id)).reduce((t, r) => t + r.amount, 0));
      const paid = round2([...mine].filter((id) => byId.get(id)?.m === m).reduce((t, id) => t + (paidOnReport.get(id) ?? 0), 0));
      const fx = round2(fixed[i].items.reduce((t, c) => t + c.month * (c.splits[a.id] ?? 0) / 100, 0));
      const base = round2(revenue - paid), gross = round2(base * a.profit_share! / 100);
      return { m, revenue, paid, fixed: fx, base, gross, cut: round2(gross - fx) };
    });
    const sum = (k: "revenue" | "paid" | "fixed" | "base" | "gross" | "cut") => round2(byMonth.reduce((t, x) => t + x[k], 0));
    return { id: a.id, name: a.name, pct: a.profit_share!, reports: R.filter((r) => mine.has(r.id)).length, byMonth,
      revenue: sum("revenue"), paid: sum("paid"), fixed: sum("fixed"), base: sum("base"), gross: sum("gross"), cut: sum("cut") };
  });

  const rows: MonthRow[] = months.map((m, i) => {
    const mr = R.filter((r) => r.m === m);
    const bySrc = { direct: 0, framework: 0, collab: 0 } as Record<Src, number>;
    for (const r of mr) bySrc[src(r)] = round2(bySrc[src(r)] + r.amount);
    const revenue = round2(mr.reduce((t, r) => t + r.amount, 0));
    const paid = round2([...paidUM].filter(([k]) => k.endsWith(`:${m}`)).reduce((t, [, v]) => t + v, 0));
    const fx = fixed[i].total;
    const assocFixed = round2(assoc.reduce((t, a) => t + a.byMonth[i].fixed, 0));
    const cuts = round2(assoc.reduce((t, a) => t + a.byMonth[i].cut, 0));
    const profit = round2(revenue - paid - fx);
    return { m, revenue, bySrc, reports: mr.length, paid, fixed: fx, fixedOwner: round2(fx - assocFixed), profit, cuts, net: round2(revenue - paid - (fx - assocFixed) - cuts) };
  });

  // the sources in detail: each bank (framework contract), each collaborating firm, the designated users, the report types
  const group = <K extends string>(items: Rep[], key: (r: Rep) => K | null) => {
    const out = new Map<K, { amount: number; n: number }>();
    for (const r of items) { const k = key(r); if (!k) continue; const g = out.get(k) ?? { amount: 0, n: 0 }; g.amount = round2(g.amount + r.amount); g.n++; out.set(k, g); }
    return [...out].map(([k, v]) => ({ name: k, ...v })).sort((a, b) => b.amount - a.amount);
  };
  const nm = (s: string | null) => (s ? niceName(s) || s : null);
  const contracts = group(R.filter((r) => src(r) === "framework"), (r) => `${nm(r.contract_bank) ?? "—"}${r.contract_no ? ` · nr. ${r.contract_no}` : ""}`);
  const collabs = group(R.filter((r) => src(r) === "collab"), (r) => nm(r.firm) ?? "—");
  const banks = group(R, (r) => nm(r.bank) ?? "Doar clientul (fără bancă)");
  const types = group(R, (r) => r.report_type || "Fără tip setat");

  // the collaborators: what each was paid, on how many reports, and the revenue of those reports
  const collaborators = [...new Set(pay.map((p) => p.user).concat([...storedTotal.keys()].map((k) => k.split(":")[0])))].map((id) => {
    const u = U.get(id);
    const total = round2(months.reduce((t, m) => t + (paidUM.get(`${id}:${m}`) ?? 0), 0));
    const reports = new Set(pay.filter((p) => p.user === id).map((p) => p.report));
    const rev = round2([...reports].reduce((t, rid) => t + (byId.get(rid)?.amount ?? 0), 0));
    return { id, name: u?.name ?? "—", total, reports: reports.size, inspections: pay.filter((p) => p.user === id && p.kind === "inspector").length, revenue: rev,
      byMonth: months.map((m) => paidUM.get(`${id}:${m}`) ?? 0) };
  }).filter((c) => c.total > 0).sort((a, b) => b.total - a.total);

  const sum = (k: keyof Omit<MonthRow, "m" | "bySrc">) => round2(rows.reduce((t, r) => t + (r[k] as number), 0));
  const totals = { revenue: sum("revenue"), reports: sum("reports"), paid: sum("paid"), fixed: sum("fixed"), fixedOwner: sum("fixedOwner"), profit: sum("profit"), cuts: sum("cuts"), net: sum("net"),
    bySrc: { direct: round2(rows.reduce((t, r) => t + r.bySrc.direct, 0)), framework: round2(rows.reduce((t, r) => t + r.bySrc.framework, 0)), collab: round2(rows.reduce((t, r) => t + r.bySrc.collab, 0)) } };
  return { year, months, rows, totals, contracts, collabs, banks, types, collaborators, associates: assoc };
}
