import type { Metadata } from "next";
import { fmtDate, staffPage } from "@/lib/guard";
import { can } from "@/lib/perms";
import {
  autoLines, KIND_LABEL, listStatements, memberChoices, memberReports, monthBoard, monthFixedCosts, monthRevenue, partyChoices, periodLabel, ruleFor, STATUS_LABEL, thisMonth, validPeriod, type Kind,
} from "@/lib/statements";
import { MemberFilter } from "./MemberFilter";
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
type Row = Awaited<ReturnType<typeof monthBoard>>[number];

export default async function StatementsPage({ searchParams }: { searchParams: Promise<{ luna?: string; evaluator?: string }> }) {
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

  // Seen through one administrator: only the reports they were in the team of (revenue and statement lines alike).
  const admins = await memberChoices(db);
  const who = admins.find((a) => a.id === sp.evaluator) ?? null;
  const member = who ? await memberReports(db, who.id) : null;
  const [payouts, receivables, issued, choices, rev, costs] = await Promise.all([
    monthBoard(db, period, "payout", member), monthBoard(db, period, "receivable", member), listStatements(db, { limit: 80 }), partyChoices(db), monthRevenue(db, period, who?.id), monthFixedCosts(db, period),
  ]);
  const past = issued.filter((s) => s.period !== period && s.status !== "open");
  const sum = (rows: Row[]) => rows.reduce((s, r) => s + r.total, 0);
  const paid = sum(payouts), due = sum(receivables), fixed = who ? 0 : costs.total, profit = Math.round((rev.total - paid - fixed) * 100) / 100;
  const q = who ? `&evaluator=${who.id}` : "";
  const link = (p: string) => `${here}?luna=${p}${q}`;
  const group = (kind: Kind, rows: Row[]) => (
    <section className="card flush" id={kind}>
      <div className="cardHead"><h2>{TABS.find(([k]) => k === kind)![1]} · {periodLabel(period)}</h2><span className="muted">{TABS.find(([k]) => k === kind)![2]} · <b>{lei2(sum(rows))}</b></span></div>
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
                  <td>{r.statement ? <a className="btn btnGhost btnSm" href={`${here}/${r.statement.id}${who ? `?evaluator=${who.id}` : ""}`}>Deschide</a> : can(user, "statements.A") ? <OpenStatement party={r.party} period={period} base={here} /> : null}</td>
                </>;
                return r.statement ? <ClickRow key={r.party} href={`${here}/${r.statement.id}${who ? `?evaluator=${who.id}` : ""}`}>{cells}</ClickRow> : <tr key={r.party}>{cells}</tr>;
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
  return (
    <CrmShell user={user} base={base} active="statements" title="Borderouri" subtitle="Lunar: ce plătește firma colaboratorilor și ce încasează de la bănci și firmele colaboratoare; în curs până la validare, apoi înghețate și emise"
      actions={<><a href={`${here}/cheltuieli`} className="btn btnGhost btnSm">Cheltuieli fixe</a><a href={`${here}/reguli`} className="btn btnGhost btnSm">Reguli</a><NewStatement period={period} base={here} {...choices} /></>}>
      <div className="stMonth">
        <a className="btn btnGhost btnSm" href={link(shift(period, -1))} aria-label="Luna anterioară">‹</a>
        <b>{periodLabel(period)}</b>
        <a className="btn btnGhost btnSm" href={link(shift(period, 1))} aria-label="Luna următoare">›</a>
        {period !== thisMonth() && <a className="link" href={link(thisMonth())}>luna curentă</a>}
        <span className="stMonthFill" />
        <MemberFilter value={who?.id ?? ""} choices={admins} period={period} here={here} />
      </div>
      {who && <div className="note"><b>Filtrat după {who.name}.</b> Veniturile și borderourile de mai jos cuprind doar rapoartele în care a fost în echipă; borderourile fără niciun astfel de raport nu apar, iar cele cu linii fixe sau manuale le arată doar pe cele legate de rapoarte. Cheltuielile fixe nu se împart pe persoane, așa că profitul de aici nu le scade.</div>}
      <div className="dbKpis stKpis">
        <div className="dbKpi" title="Onorariile rapoartelor predate în lună: lucrările proprii (clienți direcți, contracte cadru) cu tot onorariul, colaborările cu partea firmei"><span className="dbKpiLabel"><i style={{ background: "var(--ink)" }} />Venituri lună</span><b className="ctKpiMoney">{lei2(rev.total)}</b><small className="ctKpiFoot">proprii {lei2(rev.own)} ({rev.ownN}) · colaborări {lei2(rev.collab)} ({rev.collabN})</small></div>
        <a className="dbKpi" href="#receivable"><span className="dbKpiLabel"><i style={{ background: "var(--acc)" }} />De încasat pe borderouri</span><b className="ctKpiMoney">{lei2(due)}</b><small className="ctKpiFoot">{receivables.length} borderouri · bănci și colaborări</small></a>
        <a className="dbKpi" href="#payout"><span className="dbKpiLabel"><i style={{ background: "var(--err)" }} />Plăți colaboratori</span><b className="ctKpiMoney">{lei2(paid)}</b><small className="ctKpiFoot">{payouts.length} borderouri</small></a>
        <a className="dbKpi" href={`${here}/cheltuieli`} style={who ? { opacity: 0.6 } : undefined}><span className="dbKpiLabel"><i style={{ background: "var(--muted)" }} />Cheltuieli fixe</span><b className="ctKpiMoney">{lei2(costs.total)}</b><small className="ctKpiFoot">{costs.items.length ? costs.items.map((c) => c.label).join(", ") : "nicio cheltuială setată"}</small></a>
        <div className="dbKpi"><span className="dbKpiLabel"><i style={{ background: profit >= 0 ? "var(--ok, #2e8b57)" : "var(--err)" }} />{profit >= 0 ? "Profit" : "Pierdere"}</span><b className="ctKpiMoney" style={profit < 0 ? { color: "var(--err)" } : undefined}>{lei2(profit)}</b><small className="ctKpiFoot">venituri − plăți{who ? "" : " − cheltuieli fixe"}{rev.total ? ` · marjă ${Math.round(profit / rev.total * 100)}%` : ""}</small></div>
      </div>

      {group("payout", payouts)}
      {group("receivable", receivables)}

      <section className="card flush">
        <div className="cardHead"><h2>Borderouri anterioare</h2><span className="muted">validate sau emise, din alte luni</span></div>
        {past.length === 0 ? <p className="hint pad">Niciunul încă.</p> : (
          <div className="tableWrap">
            <table className="table">
              <thead><tr><th>Luna</th><th>Fel</th><th>Pentru</th><th>Stare</th><th>Număr</th><th>Emis</th><th style={{ textAlign: "right" }}>Total</th></tr></thead>
              <tbody>
                {past.map((s) => { const [l, c] = STATUS_LABEL[s.status]; return (
                  <ClickRow key={s.id} href={`${here}/${s.id}`}>
                    <td><b>{periodLabel(s.period)}</b></td><td>{KIND_LABEL[s.kind]}</td><td>{s.name}{s.sub && <div className="muted">{s.sub}</div>}</td><td><span className={`pill ${c}`}><i />{l}</span></td>
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
