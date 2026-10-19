// Server-only: Monitorizare ANEVAR — the yearly activity report of a corporate member (Anexa 4), computed live from
// the finished reports issued by VALUEFY in its own name (the ones issued by partner firms are not ours to declare). Each report is put on a specialisation (1–5) and a kind of work (lines 7–17) from its data;
// the owner can leave one out or move it to another line (anevar_marks). When the year is reported, it is frozen:
// the declared set is kept (anevar_freezes), and the reports finished after that go into the next year.
import { now } from "./db";
import { audit } from "./auth";

export { SPECS, LINES, LINE_LABEL, SPEC_LABEL, SPEC_CODE } from "./anevar-lines";
import { LINE_LABEL, SPEC_LABEL, SPEC_CODE, SPECS, LINES } from "./anevar-lines";

export type Mark = { report_id: string; excluded: number; line: number | null; spec: number | null; note: string | null; updated_by: string | null; updated_at: string };
export type Freeze = { year: number; frozen_at: string; frozen_by: string | null; frozen_by_name: string | null; ids: Set<string>; summary: Totals | null; note: string | null };

type Raw = {
  id: string; number: string | null; label: string | null; report_date: string; fee: number | null; valuation_types: string | null; purpose: string | null;
  client_id: string | null; client: string | null; client_kind: string | null; bank: string | null; bank_kind: string | null; issuer: string | null;
  evaluator_id: string | null; evaluator: string | null; anevar_no: string | null; created_at: string;
};

/** A report as the ANEVAR report sees it. */
export type AnevarReport = Raw & {
  /** the report's year by its date, and the year it is declared in (the next one, when finished after the freeze) */
  year: number; declared: number; carried: boolean;
  spec: number; line: number; excluded: boolean; mark: Mark | null;
  /** the automatic classification, before the owner's override */
  autoSpec: number; autoLine: number;
  /** data missing for a sure classification */
  issues: string[];
  /** a public institution as client (question 9) */
  publicClient: boolean;
};

export type Count = { n: number; fee: number };
export type Totals = {
  total: Count; carried: Count; excluded: Count;
  specs: Record<number, Count>; lines: Record<number, Count>;
  publicShare: { n: number; fee: number };
  topClient: { name: string; share: number; fee: number } | null;
};

const add = (c: Count, r: { fee: number | null }) => { c.n++; c.fee += r.fee ?? 0; };
const count = (): Count => ({ n: 0, fee: 0 });

const isOwn = (issuer: string | null) => !issuer || /valuefy/i.test(issuer);
const PUBLIC_KINDS = new Set(["uat", "anaf"]);

function specOf(r: Raw): [number, string | null] {
  const t = (r.valuation_types ?? "").split(/[+,/ ]+/)[0]?.toUpperCase();
  if (t === "EPI") return [1, null];
  if (t === "EI") return [2, null];
  if (t === "EBM") return [3, null];
  if (t === "EIF") return [4, null];
  if (t === "VE") return [5, null];
  return [1, "fără tip de evaluare (pus la proprietăți imobiliare)"];
}

function lineOf(r: Raw, spec: number): [number, string | null] {
  const p = (r.purpose ?? "").toLowerCase();
  if (spec === 5) return [16, null];
  if (p.includes("raportare financiar")) return [7, null];
  if (p.includes("garantare")) return [8, null];
  if (p.includes("expertiz") || p.includes("litigiu") || p.includes("instan")) return [9, null];
  if (p.includes("fuziun") || p.includes("achizi") || p.includes("delist")) return [10, null];
  if (p.includes("impozit")) return [11, null];
  if (p.includes("expropri")) return [12, null];
  if (p.includes("insolven") || p.includes("faliment")) return [13, null];
  if (p.includes("datorii") || p.includes("eșalonare") || p.includes("esalonare")) return [15, null];
  if (PUBLIC_KINDS.has(r.client_kind ?? "") || r.bank_kind === "uat") return [14, null];
  if (!p) return [17, "fără scop (pus la alte tipuri de lucrări)"];
  return [17, null];
}

const yearOf = (d: string) => Number(d.slice(0, 4));

export async function getMarks(db: D1Database) {
  const { results } = await db.prepare("SELECT * FROM anevar_marks").all<Mark>().catch(() => ({ results: [] as Mark[] }));
  return new Map(results.map((m) => [m.report_id, m]));
}

export async function getFreezes(db: D1Database): Promise<Map<number, Freeze>> {
  const { results } = await db.prepare(`SELECT f.year, f.frozen_at, f.frozen_by, f.ids_json, f.summary_json, f.note, COALESCE(NULLIF(u.name, ''), u.email) AS frozen_by_name
      FROM anevar_freezes f LEFT JOIN users u ON u.id = f.frozen_by`).all<{ year: number; frozen_at: string; frozen_by: string | null; ids_json: string; summary_json: string | null; note: string | null; frozen_by_name: string | null }>()
    .catch(() => ({ results: [] }));
  const out = new Map<number, Freeze>();
  for (const f of results) {
    let ids: string[] = [], summary: Totals | null = null;
    try { ids = JSON.parse(f.ids_json) as string[]; } catch { /* empty */ }
    try { summary = f.summary_json ? (JSON.parse(f.summary_json) as Totals) : null; } catch { /* none */ }
    out.set(f.year, { year: f.year, frozen_at: f.frozen_at, frozen_by: f.frozen_by, frozen_by_name: f.frozen_by_name, ids: new Set(ids), summary, note: f.note });
  }
  return out;
}

const RAW = `SELECT r.id, r.number, r.label, r.report_date, r.fee, r.valuation_types, r.purpose, r.client_id, r.created_at, c.name AS client, c.kind AS client_kind,
    COALESCE(b.code, b.name) AS bank, b.kind AS bank_kind, i.name AS issuer,
    m.user_id AS evaluator_id, COALESCE(NULLIF(u.name, ''), u.email) AS evaluator, u.anevar_no
  FROM reports r LEFT JOIN entities c ON c.id = r.client_id LEFT JOIN entities b ON b.id = r.recipient_id LEFT JOIN entities i ON i.id = r.issuer_id
  LEFT JOIN report_members m ON m.report_id = r.id AND m.role = 'evaluator' AND m.rowid = (SELECT MIN(x.rowid) FROM report_members x WHERE x.report_id = r.id AND x.role = 'evaluator')
  LEFT JOIN users u ON u.id = m.user_id
  WHERE r.status = 'done' AND r.report_date IS NOT NULL`;

/**
 * The reports declared in `year`: those dated in it (all of them, or — once frozen — the declared set), plus the ones
 * dated in the year before but finished after that year was frozen. Marks (exclusions, moves) are applied on top.
 */
export async function anevarReports(db: D1Database, year: number, pre?: { marks: Map<string, Mark>; freezes: Map<number, Freeze> }) {
  const [marks, freezes] = pre ? [pre.marks, pre.freezes] : await Promise.all([getMarks(db), getFreezes(db)]);
  const frozen = freezes.get(year), before = freezes.get(year - 1);
  const { results } = await db.prepare(`${RAW} AND substr(r.report_date, 1, 4) IN (?1, ?2) ORDER BY r.report_date, r.number`).bind(String(year), String(year - 1)).all<Raw>();
  const out: AnevarReport[] = [];
  for (const r of results) {
    // only what VALUEFY issued in its own name: the reports issued by partner firms (collaborations) are theirs to declare
    if (!isOwn(r.issuer)) continue;
    const y = yearOf(r.report_date);
    let carried = false;
    if (frozen) {
      if (!frozen.ids.has(r.id)) continue;
      carried = y < year;
    } else if (y === year - 1) {
      // last year's report, finished after last year was reported: this year's
      if (!before || before.ids.has(r.id)) continue;
      carried = true;
    }
    const mark = marks.get(r.id) ?? null;
    const [autoSpec, specIssue] = specOf(r);
    const [autoLine, lineIssue] = lineOf(r, autoSpec);
    const issues = [specIssue, lineIssue, r.fee ? null : "fără onorariu", r.evaluator ? null : "fără evaluator principal"].filter((x): x is string => !!x);
    const spec = mark?.spec ?? autoSpec, line = mark?.line ?? autoLine;
    out.push({
      ...r, year: y, declared: year, carried, spec, line, autoSpec, autoLine, excluded: !!mark?.excluded, mark, issues,
      publicClient: (PUBLIC_KINDS.has(r.client_kind ?? "") || r.bank_kind === "uat") && line !== 11 && line !== 9 && !/^CEC/i.test(r.bank ?? ""),
    });
  }
  return out;
}

/** The numbers of the form, from the declared reports (the excluded ones only in `excluded`). */
export function totalsOf(list: AnevarReport[]): Totals {
  const t: Totals = { total: count(), carried: count(), excluded: count(), specs: {}, lines: {}, publicShare: { n: 0, fee: 0 }, topClient: null };
  for (const [n] of SPECS) t.specs[n] = count();
  for (const [n] of LINES) t.lines[n] = count();
  const pub = count();
  const byClient = new Map<string, { name: string; fee: number }>();
  for (const r of list) {
    if (r.excluded) { add(t.excluded, r); continue; }
    add(t.total, r);
    if (r.carried) add(t.carried, r);
    add(t.specs[r.spec], r); add(t.lines[r.line], r);
    if (r.publicClient) add(pub, r);
    if (r.client_id) {
      const c = byClient.get(r.client_id) ?? { name: r.client ?? "—", fee: 0 };
      c.fee += r.fee ?? 0; byClient.set(r.client_id, c);
    }
  }
  t.publicShare = { n: t.total.n ? Math.round((pub.n / t.total.n) * 1000) / 10 : 0, fee: t.total.fee ? Math.round((pub.fee / t.total.fee) * 1000) / 10 : 0 };
  const top = [...byClient.values()].sort((a, b) => b.fee - a.fee)[0];
  if (top && t.total.fee) t.topClient = { name: top.name, fee: top.fee, share: Math.round((top.fee / t.total.fee) * 1000) / 10 };
  return t;
}

/** The years with finished reports (for the year picker), newest first. */
export async function anevarYears(db: D1Database) {
  const { results } = await db.prepare("SELECT DISTINCT CAST(substr(report_date, 1, 4) AS INTEGER) AS y FROM reports WHERE status = 'done' AND report_date IS NOT NULL ORDER BY y DESC").all<{ y: number }>();
  return results.map((r) => r.y).filter((y) => y >= 2015);
}

/** Marks a report: left out of the ANEVAR report, or counted on another line / specialisation. */
export async function markReport(db: D1Database, actor: string, reportId: string, v: { excluded?: boolean; line?: number | null; spec?: number | null; note?: string | null }) {
  const cur = await db.prepare("SELECT * FROM anevar_marks WHERE report_id = ?").bind(reportId).first<Mark>();
  const excluded = v.excluded ?? !!cur?.excluded;
  const line = v.line === undefined ? cur?.line ?? null : v.line && LINE_LABEL[v.line] ? v.line : null;
  const spec = v.spec === undefined ? cur?.spec ?? null : v.spec && SPEC_LABEL[v.spec] ? v.spec : null;
  const note = v.note === undefined ? cur?.note ?? null : v.note?.trim().slice(0, 300) || null;
  const t = now();
  if (!excluded && line == null && spec == null && !note) {
    await db.prepare("DELETE FROM anevar_marks WHERE report_id = ?").bind(reportId).run();
  } else {
    await db.prepare(`INSERT INTO anevar_marks (report_id, excluded, line, spec, note, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(report_id) DO UPDATE SET excluded = excluded.excluded, line = excluded.line, spec = excluded.spec, note = excluded.note, updated_by = excluded.updated_by, updated_at = excluded.updated_at`)
      .bind(reportId, excluded ? 1 : 0, line, spec, note, actor, t).run();
  }
  const what = [excluded ? "exclus din raportarea ANEVAR" : "inclus în raportarea ANEVAR", line != null && `linia ${line}`, spec != null && `specializarea ${SPEC_CODE[spec]}`].filter(Boolean).join(" · ");
  await audit(db, `user:${actor}`, "anevar.mark", "report", reportId, what);
  return { excluded, line, spec, note };
}

/** Freezes a year: the reports declared now are kept as the year's set; what is finished later goes to the next year. */
export async function freezeYear(db: D1Database, actor: string, year: number, note: string | null) {
  const freezes = await getFreezes(db);
  if (freezes.has(year)) return { ok: false as const, error: `Anul ${year} este deja înghețat.` };
  const list = await anevarReports(db, year, { marks: await getMarks(db), freezes });
  const ids = list.filter((r) => !r.excluded).map((r) => r.id);
  const summary = totalsOf(list);
  await db.prepare("INSERT INTO anevar_freezes (year, frozen_at, frozen_by, ids_json, summary_json, note) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(year, now(), actor, JSON.stringify(ids), JSON.stringify(summary), note).run();
  await audit(db, `user:${actor}`, "anevar.freeze", "anevar", String(year), `${ids.length} rapoarte · ${Math.round(summary.total.fee).toLocaleString("ro-RO")} lei`);
  return { ok: true as const, n: ids.length };
}

export async function unfreezeYear(db: D1Database, actor: string, year: number) {
  const r = await db.prepare("DELETE FROM anevar_freezes WHERE year = ?").bind(year).run();
  if (!r.meta.changes) return { ok: false as const, error: "Anul nu era înghețat." };
  await audit(db, `user:${actor}`, "anevar.unfreeze", "anevar", String(year));
  return { ok: true as const };
}
