import type { Metadata } from "next";
import { fmtDate, staffPage } from "@/lib/guard";
import { can } from "@/lib/perms";
import {
  autoLines, KIND_LABEL, listStatements, monthBoard, partyChoices, periodLabel, ruleFor, STATUS_LABEL, thisMonth, validPeriod, type Kind,
} from "@/lib/statements";
import { CrmShell } from "@/components/CrmShell";
import { ClickRow } from "@/components/ClickRow";
import { NewStatement, OpenStatement } from "./StatementActions";
import { LinesTable, lei2 } from "./LinesTable";

export const metadata: Metadata = { title: "Borderouri | CRM VALUEFY" };
export const dynamic = "force-dynamic";

const TABS: [Kind, string, string][] = [["payout", "Plăți colaboratori", "ce datorează firma persoanelor: cote, tarife de inspecție, comisioane"], ["receivable", "De încasat", "ce datorează băncile (contracte cadru) și firmele colaboratoare"]];
const shift = (p: string, n: number) => { const [y, m] = p.split("-").map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return d.toISOString().slice(0, 7); };

/**
 * Borderouri: per month, the statements of every party with a rule (computed live until validated), the ones
 * opened by hand, and the issued ones. A person with "Doar al lui" sees their own: the current month live and
 * the past statements, with every adjustment the firm made.
 */
export default async function StatementsPage({ searchParams }: { searchParams: Promise<{ tab?: string; luna?: string }> }) {
  const { db, user, base } = await staffPage("statements");
  const sp = await searchParams;
  const period = validPeriod(sp.luna) ? sp.luna : thisMonth();
  const here = `${base}/borderouri`;
  const all = can(user, "statements.all");

  if (!all) {
    // one's own: the current month, live, and the statements already opened / validated / issued
    const mine = await listStatements(db, { userId: user.id, limit: 60 });
    const cur = mine.find((s) => s.period === thisMonth());
    const rule = await ruleFor(db, `u:${user.id}`);
    const live = cur ? null : await autoLines(db, { basis: rule?.basis ?? "delivered", inc_evaluator: rule?.inc_evaluator ?? 1, inc_verifier: rule?.inc_verifier ?? 1, inc_inspector: rule?.inc_inspector ?? 1,
      referral_pct: rule?.referral_pct ?? null, fixed_amount: rule?.fixed_amount ?? null, fixed_label: rule?.fixed_label ?? null, user_id: user.id, contract_id: null, collaboration_id: null, kind: "payout" }, thisMonth());
    return (
      <CrmShell user={user} base={base} active="statements" title="Borderoul meu" subtitle="Situația lunii în curs și borderourile validate / emise de firmă">
        <section className="card flush">
          <div className="cardHead"><h2>{periodLabel(thisMonth())} · în curs</h2>{cur && <a className="link" href={`${here}/${cur.id}`}>deschide →</a>}</div>
          {cur ? <p className="hint pad">Borderoul lunii este {STATUS_LABEL[cur.status][0].toLowerCase()}: <a className="link" href={`${here}/${cur.id}`}>vezi liniile</a>.</p>
            : <LinesTable lines={(live ?? []).map((l) => ({ ...l, id: null, removed: 0, reason: null, changed_by: null, changed_at: null, sort: 0 }))} base={base} statement="" canEdit={false} />}
          <p className="hint pad">Se calculează din rapoartele predate și inspecțiile făcute în lună, cu cotele tale. La final de lună firma îl validează și îl emite; ajustările apar cu motivul lor.</p>
        </section>
        <section className="card flush">
          <div className="cardHead"><h2>Borderourile mele</h2></div>
          {mine.filter((s) => s.id !== cur?.id).length === 0 ? <p className="hint pad">Niciun borderou anterior.</p> : (
            <div className="tableWrap"><table className="table"><thead><tr><th>Luna</th><th>Număr</th><th>Stare</th><th>Emis</th><th style={{ textAlign: "right" }}>Total</th></tr></thead><tbody>
              {mine.filter((s) => s.id !== cur?.id).map((s) => { const [l, c] = STATUS_LABEL[s.status]; return (
                <ClickRow key={s.id} href={`${here}/${s.id}`}><td><b>{periodLabel(s.period)}</b></td><td className="mono">{s.number ?? "—"}</td><td><span className={`pill ${c}`}><i />{l}</span></td><td>{s.issued_on ? fmtDate(s.issued_on) : "—"}</td><td style={{ textAlign: "right" }} className="mono">{lei2(s.total)}</td></ClickRow>
              ); })}
            </tbody></table></div>
          )}
        </section>
      </CrmShell>
    );
  }

  const tab: Kind = TABS.some(([k]) => k === sp.tab) ? (sp.tab as Kind) : "payout";
  const [rows, issued, choices] = await Promise.all([monthBoard(db, period, tab), listStatements(db, { kind: tab, limit: 60 }), partyChoices(db)]);
  const past = issued.filter((s) => s.period !== period && s.status !== "open");
  const sum = (f: (r: (typeof rows)[number]) => boolean) => rows.filter(f).reduce((s, r) => s + r.total, 0);
  const link = (p: string) => `${here}?tab=${tab}&luna=${p}`;
  return (
    <CrmShell user={user} base={base} active="statements" title="Borderouri" subtitle="Lunar: ce plătește firma colaboratorilor și ce încasează de la bănci și firmele colaboratoare; în curs până la validare, apoi înghețate și emise"
      actions={<><a href={`${here}/reguli`} className="btn btnGhost btnSm">Reguli</a><NewStatement period={period} base={here} {...choices} /></>}>
      <nav className="pillTabs" aria-label="Felul borderoului">
        {TABS.map(([k, l, t]) => <a key={k} href={`${here}?tab=${k}&luna=${period}`} aria-current={tab === k ? "page" : undefined} title={t}>{l}</a>)}
      </nav>
      <div className="stMonth">
        <a className="btn btnGhost btnSm" href={link(shift(period, -1))} aria-label="Luna anterioară">‹</a>
        <b>{periodLabel(period)}</b>
        <a className="btn btnGhost btnSm" href={link(shift(period, 1))} aria-label="Luna următoare">›</a>
        {period !== thisMonth() && <a className="link" href={link(thisMonth())}>luna curentă</a>}
      </div>
      <div className="dbKpis ibKpis">
        <div className="dbKpi"><span className="dbKpiLabel"><i style={{ background: "var(--info)" }} />În curs</span><b className="ctKpiMoney">{lei2(sum((r) => !r.statement || r.statement.status === "open"))}</b><small className="ctKpiFoot">{rows.filter((r) => !r.statement || r.statement.status === "open").length} borderouri</small></div>
        <div className="dbKpi"><span className="dbKpiLabel"><i style={{ background: "var(--warn, #d9a21b)" }} />Validate</span><b className="ctKpiMoney">{lei2(sum((r) => r.statement?.status === "validated"))}</b><small className="ctKpiFoot">{rows.filter((r) => r.statement?.status === "validated").length} borderouri</small></div>
        <div className="dbKpi"><span className="dbKpiLabel"><i style={{ background: "var(--ok, #2e8b57)" }} />Emise</span><b className="ctKpiMoney">{lei2(sum((r) => r.statement?.status === "issued"))}</b><small className="ctKpiFoot">{rows.filter((r) => r.statement?.status === "issued").length} borderouri</small></div>
        <div className="dbKpi"><span className="dbKpiLabel"><i style={{ background: "var(--ink)" }} />Total lună</span><b className="ctKpiMoney">{lei2(sum(() => true))}</b><small className="ctKpiFoot">{KIND_LABEL[tab].toLowerCase()}</small></div>
      </div>

      <section className="card flush">
        <div className="cardHead"><h2>{TABS.find(([k]) => k === tab)![1]} · {periodLabel(period)}</h2><span className="muted">{TABS.find(([k]) => k === tab)![2]}</span></div>
        {rows.length === 0 ? <p className="hint pad">Nimic pentru luna aceasta. Adaugă reguli (cine primește borderou, pe ce criterii) din „Reguli”, sau deschide unul din „+ Borderou nou”.</p> : (
          <div className="tableWrap">
            <table className="table">
              <thead><tr><th>Pentru</th><th>Stare</th><th>Linii</th><th>Număr</th><th style={{ textAlign: "right" }}>Total</th><th /></tr></thead>
              <tbody>
                {rows.map((r) => {
                  const [l, c] = r.statement ? STATUS_LABEL[r.statement.status] : ["În curs", "pillInfo"];
                  const cells = <>
                    <td><b>{r.name}</b>{r.sub && <div className="muted">{r.sub}</div>}</td>
                    <td><span className={`pill ${c}`}><i />{l}</span>{!r.statement && <div className="muted" style={{ fontSize: 11.5 }}>calculat din regulă</div>}</td>
                    <td>{r.lines}</td>
                    <td className="mono">{r.statement?.number ?? "—"}</td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }} className="mono"><b>{lei2(r.total)}</b></td>
                    <td>{r.statement ? <a className="btn btnGhost btnSm" href={`${here}/${r.statement.id}`}>Deschide</a> : can(user, "statements.A") ? <OpenStatement party={r.party} period={period} base={here} /> : null}</td>
                  </>;
                  return r.statement ? <ClickRow key={r.party} href={`${here}/${r.statement.id}`}>{cells}</ClickRow> : <tr key={r.party}>{cells}</tr>;
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card flush">
        <div className="cardHead"><h2>Borderouri anterioare</h2><span className="muted">validate sau emise, din alte luni</span></div>
        {past.length === 0 ? <p className="hint pad">Niciunul încă.</p> : (
          <div className="tableWrap">
            <table className="table">
              <thead><tr><th>Luna</th><th>Pentru</th><th>Stare</th><th>Număr</th><th>Emis</th><th style={{ textAlign: "right" }}>Total</th></tr></thead>
              <tbody>
                {past.map((s) => { const [l, c] = STATUS_LABEL[s.status]; return (
                  <ClickRow key={s.id} href={`${here}/${s.id}`}>
                    <td><b>{periodLabel(s.period)}</b></td><td>{s.name}{s.sub && <div className="muted">{s.sub}</div>}</td><td><span className={`pill ${c}`}><i />{l}</span></td>
                    <td className="mono">{s.number ?? "—"}</td><td>{s.issued_on ? fmtDate(s.issued_on) : "—"}</td><td style={{ textAlign: "right" }} className="mono">{lei2(s.total)}</td>
                  </ClickRow>
                ); })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </CrmShell>
  );
}
