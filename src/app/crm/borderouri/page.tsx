import type { Metadata } from "next";
import { fmtDate, staffPage } from "@/lib/guard";
import { can } from "@/lib/perms";
import {
  autoLines, criteriaOf, KIND_LABEL, listStatements, memberChoices, monthBoard, associateCut, monthResult, partyCols, periodLabel, profitShares, STATUS_LABEL, thisMonth, validPeriod, type RevSource,
} from "@/lib/statements";
import { MemberFilter } from "./MemberFilter";
import { ExportXlsx } from "./ExportXlsx";
import { CostAdjust } from "./CostAdjust";
import { CrmShell } from "@/components/CrmShell";
import { ClickRow } from "@/components/ClickRow";
import { OpenStatement } from "./StatementActions";
import { LinesTable, lei2 } from "./LinesTable";

export const metadata: Metadata = { title: "Borderouri | CRM VALUEFY" };
export const dynamic = "force-dynamic";

const SOURCES: [RevSource, string, string][] = [["direct", "Lucrări directe", "clienții direcți: tot onorariul"], ["framework", "Contracte cadru", "pe fiecare bancă: tot onorariul"],
  ["collab", "Colaborări", "pe fiecare firmă: partea VALUEFY din onorariu"]];
const shift = (p: string, n: number) => { const [y, m] = p.split("-").map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return d.toISOString().slice(0, 7); };

/**
 * Borderouri, made by themselves every month (no rules): the revenue — one statement per source (direct clients, each
 * framework contract, each collaboration) — and the payouts of everyone who worked in the month (the shares on their
 * user page), then the fixed costs and the month's result, with the cut of who has a share of the profit. Computed
 * live until validated. A person with "Doar al lui" sees their own: the current month live and the past statements.
 */
type Row = Awaited<ReturnType<typeof monthBoard>>[number];

export default async function StatementsPage({ searchParams }: { searchParams: Promise<{ luna?: string; evaluator?: string }> }) {
  const { db, user, base } = await staffPage("statements");
  const sp = await searchParams;
  const period = validPeriod(sp.luna) ? sp.luna : thisMonth();
  const here = `${base}/borderouri`;
  const all = can(user, "statements.all");
  // "Profitabilitatea lui": the month's figures, always filtered on the user's own reports, read-only.
  const self = !all && can(user, "statements.lead");

  if (!all && !self) {
    // one's own: the current month, live, and the statements already opened / validated / issued
    const mine = await listStatements(db, { userId: user.id, limit: 60 });
    const cur = mine.find((s) => s.period === thisMonth());
    const live = cur ? null : await autoLines(db, criteriaOf(partyCols(`u:${user.id}`)!), thisMonth());
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
  const admins = self ? [] : await memberChoices(db);
  const who = self ? { id: user.id, name: user.name || user.email } : admins.find((a) => a.id === sp.evaluator) ?? null;
  const owner = user.role === "owner";
  const [res, issued] = await Promise.all([monthResult(db, period, who), listStatements(db, { limit: 80 })]);
  const { payouts, receivables, costs, revenue, paid, fixed, profit } = res;
  // the shares of the profit: seen only by the owner (set on each administrator's page) — the filtered one's, or all of them
  const shares = owner ? (who ? null : await profitShares(db, period)) : null;
  const pshare = who && owner ? (await db.prepare("SELECT profit_share FROM users WHERE id = ?").bind(who.id).first<{ profit_share: number | null }>())?.profit_share ?? null : null;
  // an associate: (their revenue − the payouts on their reports) × percent − their fixed costs
  const cut = pshare != null && pshare > 0 ? { pct: pshare, ...associateCut(revenue, paid, fixed, pshare) } : null;
  // the month's adjustments of the fixed costs: who sees and changes every statement
  const editCosts = !self && all && can(user, "statements.E");
  const past = issued.filter((s) => s.period !== period && s.status !== "open");
  const sum = (rows: Row[]) => Math.round(rows.reduce((s, r) => s + r.total, 0) * 100) / 100;
  const q = who ? `&evaluator=${who.id}` : "";
  const link = (p: string) => `${here}?luna=${p}${q}`;
  const rowsOf = (rows: Row[]) => rows.map((r) => {
    const [l, c] = r.statement ? STATUS_LABEL[r.statement.status] : ["În curs", "pillInfo"];
    const href = r.statement ? `${here}/${r.statement.id}${who ? `?evaluator=${who.id}` : ""}` : null;
    const cells = <>
      <td><b>{r.name}</b>{r.sub && <div className="muted">{r.sub}</div>}</td>
      <td><span className={`pill ${c}`}><i />{l}</span>{!r.statement && <div className="muted" style={{ fontSize: 11.5 }}>calculat automat</div>}</td>
      <td>{r.lines}</td>
      <td className="mono">{r.statement?.number ?? "—"}</td>
      <td style={{ textAlign: "right", whiteSpace: "nowrap" }} className="mono"><b>{lei2(r.total)}</b></td>
      <td>{href ? <a className="btn btnGhost btnSm" href={href}>Deschide</a> : !self && can(user, "statements.A") ? <OpenStatement party={r.party} period={period} base={here} /> : null}</td>
    </>;
    return href ? <ClickRow key={r.party} href={href}>{cells}</ClickRow> : <tr key={r.party}>{cells}</tr>;
  });
  // a source of revenue: its statement, unfolding into the designated users (banks / institutions) and their reports
  const incomeRows = (rows: Row[]) => rows.map((r) => {
    const [l, c] = r.statement ? STATUS_LABEL[r.statement.status] : ["În curs", "pillInfo"];
    const href = r.statement ? `${here}/${r.statement.id}${who ? `?evaluator=${who.id}` : ""}` : null;
    return (
      <tr key={r.party}>
        <td>
          <details className="stSrc">
            <summary><b>{r.name}</b>{r.sub && <span className="muted"> · {r.sub}</span>}<small className="stSrcHint">{r.banks.length} {r.banks.length === 1 ? "utilizator" : "utilizatori"} desemnați ▾</small></summary>
            <ul className="stBanks">
              {r.banks.map((b) => (
                <li key={b.bank}>
                  <details>
                    <summary><span>{b.bank}</span><span className="muted">{b.lines.length} {b.lines.length === 1 ? "raport" : "rapoarte"}</span><span className="mono">{lei2(b.total)}</span></summary>
                    <ul>{b.lines.map((x) => <li key={x.report_id}><a className="link" href={`${base}/rapoarte/${x.report_id}`}>{x.label}</a><span className="muted">{x.on_date ? x.on_date.split("-").reverse().join(".") : ""}</span><span className="mono">{lei2(x.amount)}</span></li>)}</ul>
                  </details>
                </li>
              ))}
            </ul>
          </details>
        </td>
        <td><span className={`pill ${c}`}><i />{l}</span></td>
        <td>{r.lines}</td>
        <td className="mono">{r.statement?.number ?? "—"}</td>
        <td style={{ textAlign: "right", whiteSpace: "nowrap" }} className="mono"><b>{lei2(r.total)}</b></td>
        <td>{href ? <a className="btn btnGhost btnSm" href={href}>Deschide</a> : !self && can(user, "statements.A") ? <OpenStatement party={r.party} period={period} base={here} /> : null}</td>
      </tr>
    );
  });
  const head = <thead><tr><th>Pentru</th><th>Stare</th><th>Linii</th><th>Număr</th><th style={{ textAlign: "right" }}>Total</th><th /></tr></thead>;
  return (
    <CrmShell user={user} base={base} active="statements" title="Borderouri" subtitle="Generate automat în fiecare lună: veniturile pe surse și plățile colaboratorilor care au lucrat în lună; în curs până la validare, apoi înghețate și emise"
      actions={self ? <ExportXlsx period={period} label="Export Excel lună" /> : <><ExportXlsx period={period} evaluator={who?.id ?? null} label="Export Excel lună" /><a href={`${here}/cheltuieli`} className="btn btnGhost btnSm">Cheltuieli fixe</a></>}>
      <div className="stMonth">
        <a className="btn btnGhost btnSm" href={link(shift(period, -1))} aria-label="Luna anterioară">‹</a>
        <b>{periodLabel(period)}</b>
        <a className="btn btnGhost btnSm" href={link(shift(period, 1))} aria-label="Luna următoare">›</a>
        {period !== thisMonth() && <a className="link" href={link(thisMonth())}>luna curentă</a>}
        <span className="stMonthFill" />
        {!self && <MemberFilter value={who?.id ?? ""} choices={admins} period={period} here={here} />}
      </div>
      {who && <div className="note"><b>Filtrat după {who.name}.</b> Veniturile și plățile de mai jos cuprind doar rapoartele în care a fost în echipă. Cheltuielile fixe intră cu partea lui (splitul setat la fiecare cheltuială).</div>}
      <div className="dbKpis stKpis">
        <a className="dbKpi" href="#venituri"><span className="dbKpiLabel"><i style={{ background: "var(--acc)" }} />Venituri</span><b className="ctKpiMoney">{lei2(revenue)}</b><small className="ctKpiFoot">{SOURCES.map(([k, l]) => `${l.toLowerCase()} ${lei2(res.bySource(k))}`).join(" · ")}</small></a>
        <a className="dbKpi" href="#cheltuieli"><span className="dbKpiLabel"><i style={{ background: "var(--err)" }} />Plăți colaboratori</span><b className="ctKpiMoney">{lei2(paid)}</b><small className="ctKpiFoot">{payouts.length} {payouts.length === 1 ? "colaborator" : "colaboratori"}</small></a>
        <a className="dbKpi" href="#fixe"><span className="dbKpiLabel"><i style={{ background: "var(--muted)" }} />Cheltuieli fixe{who ? " (partea lui)" : ""}</span><b className="ctKpiMoney">{lei2(fixed)}</b><small className="ctKpiFoot">{costs.items.length ? costs.items.map((c) => c.label).join(", ") : "nicio cheltuială"}</small></a>
        <a className="dbKpi" href="#rezultat"><span className="dbKpiLabel"><i style={{ background: profit >= 0 ? "var(--ok, #2e8b57)" : "var(--err)" }} />{profit >= 0 ? "Profit" : "Pierdere"}</span><b className="ctKpiMoney" style={profit < 0 ? { color: "var(--err)" } : undefined}>{lei2(profit)}</b><small className="ctKpiFoot">venituri − plăți − cheltuieli fixe{revenue ? ` · marjă ${Math.round(profit / revenue * 100)}%` : ""}</small></a>
      </div>

      <section className="card flush" id="venituri">
        <div className="cardHead"><h2>Venituri · {periodLabel(period)}</h2><span className="muted">un borderou de încasat pe fiecare sursă · <b>{lei2(revenue)}</b></span></div>
        {receivables.length === 0 ? <p className="hint pad">Niciun raport predat în luna aceasta{who ? " cu el în echipă" : ""}.</p> : (
          <div className="tableWrap">
            <table className="table stGrouped">
              {head}
              {SOURCES.map(([k, l, sub]) => {
                const rows = receivables.filter((r) => r.source === k);
                return rows.length ? (
                  <tbody key={k}>
                    <tr className="stSrcHead"><td colSpan={4}><b>{l}</b><span>{sub} · {rows.length} {rows.length === 1 ? "borderou" : "borderouri"}</span></td><td style={{ textAlign: "right" }} className="mono"><b>{lei2(sum(rows))}</b></td><td /></tr>
                    {incomeRows(rows)}
                  </tbody>
                ) : null;
              })}
              <tfoot><tr><td colSpan={4} style={{ textAlign: "right" }}><b>Total venituri</b></td><td style={{ textAlign: "right" }} className="mono"><b>{lei2(revenue)}</b></td><td /></tr></tfoot>
            </table>
          </div>
        )}
      </section>

      <section className="card flush" id="cheltuieli">
        <div className="cardHead"><h2>Cheltuieli · colaboratori · {periodLabel(period)}</h2><span className="muted">cine a lucrat în lună (evaluator, verificator, inspecții), cu cotele din fișa lui · <b>{lei2(paid)}</b></span></div>
        {payouts.length === 0 ? <p className="hint pad">Nimic de plătit în luna aceasta. Cotele (evaluator, verificator, tarif inspecție) se setează în fișa fiecărui utilizator.</p> : (
          <div className="tableWrap">
            <table className="table">
              {head}
              <tbody>{rowsOf(payouts)}</tbody>
              <tfoot><tr><td colSpan={4} style={{ textAlign: "right" }}><b>Total plăți colaboratori</b></td><td style={{ textAlign: "right" }} className="mono"><b>{lei2(paid)}</b></td><td /></tr></tfoot>
            </table>
          </div>
        )}
      </section>

      <section className="card flush" id="fixe">
        <div className="cardHead"><h2>Cheltuieli fixe · {periodLabel(period)}</h2><span className="muted">{who ? `partea lui ${who.name}` : "toată firma"} · <b>{lei2(costs.total)}</b>{!self && <> · <a className="link" href={`${here}/cheltuieli`}>setează</a></>}</span></div>
        {costs.items.length === 0 ? <p className="hint pad">{who ? "Nicio cheltuială fixă împărțită cu acest administrator în luna aceasta." : "Nicio cheltuială fixă în luna aceasta."}</p> : (
          <div className="tableWrap">
            <table className="table">
              <thead><tr><th>Cheltuială</th><th style={{ textAlign: "right" }}>Lunar</th><th style={{ textAlign: "right" }}>Ajustare (+ / −)</th><th>Explicație</th><th style={{ textAlign: "right" }}>Total lună</th>{who && <th style={{ textAlign: "right" }}>Split</th>}<th style={{ textAlign: "right" }}>{who ? "Partea lui" : "Se scade"}</th></tr></thead>
              <tbody>
                {costs.items.map((c) => (
                  <tr key={c.id} className={c.adjust ? "stChanged" : undefined}>
                    <td><b>{c.label}</b>{c.notes && <div className="muted">{c.notes}</div>}</td>
                    <td style={{ textAlign: "right" }} className="mono">{lei2(c.amount)}</td>
                    {editCosts ? <CostAdjust id={c.id} period={period} adjust={c.adjust} note={c.adjust_note} /> : <>
                      <td style={{ textAlign: "right" }} className="mono">{c.adjust ? `${c.adjust > 0 ? "+" : ""}${lei2(c.adjust)}` : "—"}</td>
                      <td className="muted">{c.adjust_note ?? ""}</td>
                    </>}
                    <td style={{ textAlign: "right" }} className="mono">{lei2(c.month)}{c.adjust_by && <div className="muted" style={{ fontSize: 11 }}>ajustat de {c.adjust_by}</div>}</td>
                    {who && <td style={{ textAlign: "right" }}>{c.pct}%</td>}
                    <td style={{ textAlign: "right" }} className="mono"><b>{lei2(c.share)}</b></td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr><td colSpan={who ? 6 : 5} style={{ textAlign: "right" }}><b>Total cheltuieli fixe</b></td><td style={{ textAlign: "right" }} className="mono"><b>{lei2(costs.total)}</b></td></tr></tfoot>
            </table>
          </div>
        )}
      </section>

      <section className="card stSummary" id="rezultat">
        <h2>Rezultatul lunii{who ? ` · ${who.name}` : ""}</h2>
        <dl className="stCalc">
          {SOURCES.map(([k, l]) => <div key={k} className="stIn"><dt>+ {l}</dt><dd className="mono">{lei2(res.bySource(k))}</dd></div>)}
          <div className="stIn stSub"><dt>Venituri {who ? "(rapoartele unde a fost în echipă)" : ""}</dt><dd className="mono">{lei2(revenue)}</dd></div>
          <div className="stOut"><dt>− Plăți colaboratori ({payouts.length})</dt><dd className="mono">{lei2(paid)}</dd></div>
          {cut != null ? <>
            <div className="stSumTotal"><dt>Bază (venituri − plăți)</dt><dd className="mono">{lei2(cut.base)}</dd></div>
            <div className="stIn"><dt>× {cut.pct}% cota asociatului</dt><dd className="mono">{lei2(cut.gross)}</dd></div>
            <div className="stOut"><dt>− Cheltuieli fixe aferente (partea lui)</dt><dd className="mono">{lei2(fixed)}</dd></div>
            <div className="stSumTotal stNet"><dt>De primit · {who!.name}</dt><dd className="mono" style={{ color: cut.cut >= 0 ? "var(--ok-text)" : "var(--err)" }}>{lei2(cut.cut)}</dd></div>
          </> : <>
            <div className="stOut"><dt>− Cheltuieli fixe{who ? " (partea lui)" : ""}</dt><dd className="mono">{lei2(fixed)}</dd></div>
            <div className="stSumTotal"><dt>{profit >= 0 ? "Profit net" : "Pierdere"}</dt><dd className="mono" style={{ color: profit >= 0 ? "var(--ok-text)" : "var(--err)" }}>{lei2(profit)}</dd></div>
          </>}
          {shares && shares.length > 0 && (() => {
            const r2 = (n: number) => Math.round(n * 100) / 100;
            // the fixed costs: the associates carry their split, the owner what is left
            const allocated = r2(shares.reduce((t, x) => t + x.fixed, 0));
            const mine = r2(fixed - allocated);
            const base = r2(revenue - paid);
            const net = r2(base - shares.reduce((t, x) => t + x.gross, 0) - mine);
            return <>
              <div className="stCalcHead"><dt>Net-ul tău · calculul</dt><dd /></div>
              <div className="stSumTotal"><dt>Bază (venituri − plăți)</dt><dd className="mono">{lei2(base)}</dd></div>
              {shares.map((x) => <div key={x.id} className="stOut"><dt>− Cota brută asociat {x.name} ({lei2(x.base)} × {x.pct}%)</dt><dd className="mono">{lei2(x.gross)}</dd></div>)}
              <div className="stOut"><dt>− Cheltuieli fixe rămase la tine ({lei2(fixed)} total − {lei2(allocated)} alocate asociaților)</dt><dd className="mono">{lei2(mine)}</dd></div>
              <div className="stSumTotal stNet"><dt>Net-ul tău (proprietar)</dt><dd className="mono" style={{ color: net >= 0 ? "var(--ok-text)" : "var(--err)" }}>{lei2(net)}</dd></div>
            </>;
          })()}
        </dl>
        {cut != null && <p className="hint" style={{ margin: "8px 0 0" }}>Cota din profit o vezi doar tu; se setează din fișa utilizatorului (Cum e plătit → Procent din profitul net).</p>}
        {shares && shares.length > 0 && (
          <div className="stShares">
            <h3>Cotele asociaților · calculul</h3>
            <div className="tableWrap">
              <table className="table">
                <thead><tr><th>Asociat</th><th style={{ textAlign: "right" }}>Venituri (rapoartele lui)</th><th style={{ textAlign: "right" }}>− Plăți colaboratori</th><th style={{ textAlign: "right" }}>= Bază</th><th style={{ textAlign: "right" }}>× Cotă</th><th style={{ textAlign: "right" }}>= Cotă brută</th><th style={{ textAlign: "right" }}>− Cheltuieli aferente</th><th style={{ textAlign: "right" }}>De primit</th></tr></thead>
                <tbody>
                  {shares.map((x) => (
                    <ClickRow key={x.id} href={`${here}?luna=${period}&evaluator=${x.id}`}>
                      <td><b>{x.name}</b></td><td style={{ textAlign: "right" }} className="mono">{lei2(x.revenue)}</td><td style={{ textAlign: "right" }} className="mono">{lei2(x.paid)}</td>
                      <td style={{ textAlign: "right" }} className="mono">{lei2(x.base)}</td><td style={{ textAlign: "right" }}>{x.pct}%</td><td style={{ textAlign: "right" }} className="mono">{lei2(x.gross)}</td>
                      <td style={{ textAlign: "right" }} className="mono">{lei2(x.fixed)}</td>
                      <td style={{ textAlign: "right", color: x.cut < 0 ? "var(--err)" : undefined }} className="mono"><b>{lei2(x.cut)}</b></td>
                    </ClickRow>
                  ))}
                </tbody>
                <tfoot><tr><td colSpan={7} style={{ textAlign: "right" }}><b>Total cote asociați</b></td><td style={{ textAlign: "right" }} className="mono"><b>{lei2(Math.round(shares.reduce((t, x) => t + x.cut, 0) * 100) / 100)}</b></td></tr></tfoot>
              </table>
            </div>
            <p className="hint" style={{ margin: "6px 0 0" }}>Cota asociatului: (veniturile din rapoartele în care e în echipă − plățile colaboratorilor implicați în ele) × procentul lui − cheltuielile fixe aferente lui (splitul de la cheltuieli). Le vezi doar tu.</p>
          </div>
        )}
      </section>

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
