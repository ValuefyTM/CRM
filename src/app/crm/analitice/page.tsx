import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { staffPage } from "@/lib/guard";
import { periodLabel } from "@/lib/statements";
import { SRC_LABEL, yearAnalytics, type MonthRow, type Src } from "@/lib/analytics";
import { CrmShell } from "@/components/CrmShell";

export const metadata: Metadata = { title: "Analitice | CRM VALUEFY" };
export const dynamic = "force-dynamic";

const lei = (n: number) => `${n.toLocaleString("ro-RO", { maximumFractionDigits: 0 })} lei`;
const lei2 = (n: number) => `${n.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} lei`;
const short = (n: number) => (Math.abs(n) >= 1000 ? `${(n / 1000).toLocaleString("ro-RO", { maximumFractionDigits: 1 })}k` : `${Math.round(n)}`);
const MON = ["ian", "feb", "mar", "apr", "mai", "iun", "iul", "aug", "sep", "oct", "nov", "dec"];
const SRC_COLOR: Record<Src, string> = { direct: "#2a78d6", framework: "#eb6834", collab: "#1baf7a" };
const SRCS: Src[] = ["direct", "framework", "collab"];
const IN = "#1fa971", OUT = "#d0453f", NET = "#141414";

/** A clean upper bound for an axis: 1, 2, 2.5, 5 × 10^n. */
const niceMax = (v: number) => {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  return ([1, 2, 2.5, 5, 10].find((k) => k * p >= v) ?? 10) * p;
};

/** Revenue (green) and costs (red: collaborators + fixed) per month, with the owner's net as a line. */
function MonthsChart({ rows }: { rows: MonthRow[] }) {
  const W = 760, H = 260, L = 48, B = 26, T = 10;
  const max = niceMax(Math.max(...rows.map((r) => Math.max(r.revenue, r.paid + r.fixed, r.net)), 1));
  const min = Math.min(0, ...rows.map((r) => r.net));
  const lo = min < 0 ? -niceMax(-min) : 0;
  const y = (v: number) => T + (H - T - B) * (1 - (v - lo) / (max - lo));
  const step = (W - L) / 12, bw = Math.min(16, step / 3);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((k) => lo + (max - lo) * k);
  const pts = rows.map((r, i) => `${L + step * i + step / 2},${y(r.net)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="anChart" role="img" aria-label="Venituri, cheltuieli și net-ul pe luni">
      {ticks.map((t) => <g key={t}><line x1={L} x2={W} y1={y(t)} y2={y(t)} className="anGrid" /><text x={L - 6} y={y(t) + 3} className="anAxis" textAnchor="end">{short(t)}</text></g>)}
      {rows.map((r, i) => {
        const x = L + step * i + step / 2;
        return (
          <g key={r.m} className="anHit">
            <title>{`${periodLabel(r.m)}\nVenituri: ${lei(r.revenue)}\nColaboratori: ${lei(r.paid)}\nCheltuieli fixe: ${lei(r.fixed)}\nNet-ul tău: ${lei(r.net)}`}</title>
            <rect x={x - step / 2} y={T} width={step} height={H - T - B} fill="transparent" />
            <rect x={x - bw - 1} y={y(Math.max(r.revenue, 0))} width={bw} height={Math.max(0, y(0) - y(r.revenue))} rx={3} fill={IN} />
            <rect x={x + 1} y={y(r.paid + r.fixed)} width={bw} height={Math.max(0, y(0) - y(r.paid + r.fixed))} rx={3} fill={OUT} />
            <text x={x} y={H - 8} className="anAxis" textAnchor="middle">{MON[i]}</text>
          </g>
        );
      })}
      <polyline points={pts} fill="none" stroke={NET} strokeWidth={2} />
      {rows.map((r, i) => <circle key={r.m} cx={L + step * i + step / 2} cy={y(r.net)} r={4} fill={NET} stroke="#fff" strokeWidth={2}><title>{`${periodLabel(r.m)} · net-ul tău ${lei(r.net)}`}</title></circle>)}
    </svg>
  );
}

/** The revenue of each month by source, stacked. */
function SourcesChart({ rows }: { rows: MonthRow[] }) {
  const W = 480, H = 230, L = 40, B = 24, T = 10;
  const max = niceMax(Math.max(...rows.map((r) => r.revenue), 1));
  const y = (v: number) => T + (H - T - B) * (1 - v / max);
  const step = (W - L) / 12, bw = Math.min(22, step * 0.6);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="anChart" role="img" aria-label="Veniturile pe surse, pe luni">
      {[0, 0.5, 1].map((k) => <g key={k}><line x1={L} x2={W} y1={y(max * k)} y2={y(max * k)} className="anGrid" /><text x={L - 6} y={y(max * k) + 3} className="anAxis" textAnchor="end">{short(max * k)}</text></g>)}
      {rows.map((r, i) => {
        const x = L + step * i + step / 2;
        let acc = 0;
        return (
          <g key={r.m} className="anHit">
            <title>{`${periodLabel(r.m)}\n${SRCS.map((s) => `${SRC_LABEL[s]}: ${lei(r.bySrc[s])}`).join("\n")}\nTotal: ${lei(r.revenue)}`}</title>
            <rect x={x - step / 2} y={T} width={step} height={H - T - B} fill="transparent" />
            {SRCS.map((s) => {
              const v = r.bySrc[s];
              if (v <= 0) return null;
              const top = y(acc + v), h = y(acc) - top;
              acc += v;
              return <rect key={s} x={x - bw / 2} y={top} width={bw} height={Math.max(0, h - 2)} rx={2} fill={SRC_COLOR[s]} />;
            })}
            <text x={x} y={H - 8} className="anAxis" textAnchor="middle">{MON[i]}</text>
          </g>
        );
      })}
    </svg>
  );
}

/** A ranked list as horizontal bars: name, bar, amount, count. */
function Bars({ items, color, unit = "rapoarte", limit = 10 }: { items: { name: string; amount: number; n: number }[]; color: string; unit?: string; limit?: number }) {
  if (!items.length) return <p className="hint pad">Nimic în anul acesta.</p>;
  const max = Math.max(...items.map((x) => x.amount), 1);
  const shown = items.slice(0, limit), rest = items.slice(limit);
  const total = items.reduce((t, x) => t + x.amount, 0);
  return (
    <ul className="anBars">
      {shown.map((x) => (
        <li key={x.name} title={`${x.name}: ${lei2(x.amount)} · ${x.n} ${unit} · ${total ? Math.round(x.amount / total * 100) : 0}%`}>
          <span className="anBarName">{x.name}</span>
          <span className="anBarTrack"><i style={{ width: `${Math.max(1.5, x.amount / max * 100)}%`, background: color }} /></span>
          <b className="mono">{lei(x.amount)}</b>
          <small>{unit ? `${x.n} ${unit} · ` : ""}{total ? Math.round(x.amount / total * 100) : 0}%</small>
        </li>
      ))}
      {rest.length > 0 && <li className="anBarRest"><span className="anBarName">Altele ({rest.length})</span><span /><b className="mono">{lei(rest.reduce((t, x) => t + x.amount, 0))}</b><small>{rest.reduce((t, x) => t + x.n, 0)} {unit}</small></li>}
    </ul>
  );
}

/**
 * Analitice: the owner's dashboard — a year of the firm's profitability (revenue by source, collaborators, fixed costs,
 * the associates' cuts and the owner's net), month by month, and the detail by bank, framework contract,
 * collaboration, designated user, collaborator and associate. Only the firm's owner sees it.
 */
export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ an?: string }> }) {
  const { db, user, base } = await staffPage("statements");
  if (user.role !== "owner") notFound();
  const cur = new Date().getFullYear();
  const an = Number((await searchParams).an);
  const year = Number.isInteger(an) && an >= 2015 && an <= cur ? an : cur;
  const a = await yearAnalytics(db, year);
  const t = a.totals;
  const margin = t.revenue ? Math.round(t.profit / t.revenue * 100) : 0;
  const active = a.rows.filter((r) => r.revenue || r.paid || r.fixed);
  const best = [...active].sort((x, y) => y.net - x.net)[0];
  const here = `${base}/analitice`;
  return (
    <CrmShell user={user} base={base} active="analytics" title="Analitice" subtitle="Profitabilitatea firmei: pe luni, pe surse, pe bănci, colaborări, colaboratori și asociați · doar pentru proprietar">
      <div className="stMonth">
        <a className="btn btnGhost btnSm" href={`${here}?an=${year - 1}`} aria-label="Anul anterior">‹</a>
        <b>{year}</b>
        {year < cur ? <a className="btn btnGhost btnSm" href={`${here}?an=${year + 1}`} aria-label="Anul următor">›</a> : <span className="btn btnGhost btnSm" aria-disabled="true" style={{ opacity: 0.4 }}>›</span>}
        {year !== cur && <a className="link" href={here}>anul curent</a>}
        <span className="stMonthFill" />
        <a className="link" href={`${base}/borderouri`}>Borderouri lunare →</a>
      </div>

      <div className="dbKpis anKpis">
        <div className="dbKpi"><span className="dbKpiLabel"><i style={{ background: IN }} />Venituri {year}</span><b className="ctKpiMoney" style={{ color: "var(--ok-text)" }}>{lei(t.revenue)}</b><small className="ctKpiFoot">{t.reports} rapoarte · {SRCS.map((s) => `${SRC_LABEL[s].toLowerCase()} ${t.revenue ? Math.round(t.bySrc[s] / t.revenue * 100) : 0}%`).join(" · ")}</small></div>
        <div className="dbKpi"><span className="dbKpiLabel"><i style={{ background: OUT }} />Colaboratori</span><b className="ctKpiMoney" style={{ color: "var(--err)" }}>− {lei(t.paid)}</b><small className="ctKpiFoot">{t.revenue ? Math.round(t.paid / t.revenue * 100) : 0}% din venituri · {a.collaborators.length} oameni</small></div>
        <div className="dbKpi"><span className="dbKpiLabel"><i style={{ background: OUT }} />Cheltuieli fixe</span><b className="ctKpiMoney" style={{ color: "var(--err)" }}>− {lei(t.fixed)}</b><small className="ctKpiFoot">din care la tine {lei(t.fixedOwner)}</small></div>
        <div className="dbKpi"><span className="dbKpiLabel"><i style={{ background: "var(--muted)" }} />Profit firmă</span><b className="ctKpiMoney" style={{ color: t.profit >= 0 ? "var(--ok-text)" : "var(--err)" }}>{lei(t.profit)}</b><small className="ctKpiFoot">marjă {margin}%</small></div>
        <div className="dbKpi"><span className="dbKpiLabel"><i style={{ background: OUT }} />Cote asociați</span><b className="ctKpiMoney" style={{ color: "var(--err)" }}>− {lei(t.cuts)}</b><small className="ctKpiFoot">{a.associates.length ? a.associates.map((x) => `${x.name} ${x.pct}%`).join(", ") : "niciun asociat"}</small></div>
        <div className="dbKpi anNet"><span className="dbKpiLabel"><i style={{ background: NET }} />Net-ul tău {year}</span><b className="ctKpiMoney" style={{ color: t.net >= 0 ? "var(--ok-text)" : "var(--err)" }}>{lei(t.net)}</b><small className="ctKpiFoot">{best ? `cea mai bună lună: ${periodLabel(best.m)} (${lei(best.net)})` : "—"}</small></div>
      </div>

      <section className="card">
        <div className="cardHead"><h2>Pe luni · venituri, cheltuieli, net</h2>
          <span className="anLegend"><span><i style={{ background: IN }} />Venituri</span><span><i style={{ background: OUT }} />Colaboratori + fixe</span><span><i className="dot" style={{ background: NET }} />Net-ul tău</span></span></div>
        <MonthsChart rows={a.rows} />
      </section>

      <div className="anGrid2">
        <section className="card">
          <div className="cardHead"><h2>Veniturile pe surse</h2><span className="anLegend">{SRCS.map((s) => <span key={s}><i style={{ background: SRC_COLOR[s] }} />{SRC_LABEL[s]}</span>)}</span></div>
          <SourcesChart rows={a.rows} />
          <ul className="anSplit">{SRCS.map((s) => <li key={s}><i style={{ background: SRC_COLOR[s] }} /><span>{SRC_LABEL[s]}</span><b className="mono">{lei(t.bySrc[s])}</b><small>{t.revenue ? Math.round(t.bySrc[s] / t.revenue * 100) : 0}%</small></li>)}</ul>
        </section>
        <section className="card">
          <div className="cardHead"><h2>Pe utilizatori desemnați</h2><span className="muted">bănci și instituții, din toate sursele</span></div>
          <Bars items={a.banks} color="#2a78d6" />
        </section>
      </div>

      <div className="anGrid2">
        <section className="card">
          <div className="cardHead"><h2>Contracte cadru</h2><span className="muted">pe bancă și contract · {lei(t.bySrc.framework)}</span></div>
          <Bars items={a.contracts} color={SRC_COLOR.framework} />
        </section>
        <section className="card">
          <div className="cardHead"><h2>Contracte de colaborare</h2><span className="muted">partea VALUEFY, pe firmă · {lei(t.bySrc.collab)}</span></div>
          <Bars items={a.collabs} color={SRC_COLOR.collab} />
        </section>
      </div>

      <section className="card flush">
        <div className="cardHead"><h2>Colaboratori</h2><span className="muted">ce s-a plătit fiecăruia (cote evaluator / verificator, inspecții) și veniturile rapoartelor lor</span></div>
        {a.collaborators.length === 0 ? <p className="hint pad">Nicio plată în anul acesta.</p> : (
          <div className="tableWrap">
            <table className="table">
              <thead><tr><th>Colaborator</th><th style={{ textAlign: "right" }}>Rapoarte</th><th style={{ textAlign: "right" }}>Inspecții</th><th style={{ textAlign: "right" }}>Venituri pe ele</th><th style={{ textAlign: "right" }}>Plătit</th><th style={{ textAlign: "right" }}>% din venituri</th><th>Pe luni</th></tr></thead>
              <tbody>
                {a.collaborators.map((c) => {
                  const mx = Math.max(...c.byMonth, 1);
                  return (
                    <tr key={c.id}>
                      <td><a className="link" href={`${base}/utilizatori/${c.id}`}><b>{c.name}</b></a></td>
                      <td style={{ textAlign: "right" }}>{c.reports}</td><td style={{ textAlign: "right" }}>{c.inspections}</td>
                      <td style={{ textAlign: "right" }} className="mono">{lei(c.revenue)}</td>
                      <td style={{ textAlign: "right", color: "var(--err)" }} className="mono"><b>{lei(c.total)}</b></td>
                      <td style={{ textAlign: "right" }}>{c.revenue ? Math.round(c.total / c.revenue * 100) : 0}%</td>
                      <td><span className="anSpark" aria-label={`plătit pe luni: ${c.byMonth.map((v, i) => `${MON[i]} ${lei(v)}`).join(", ")}`}>{c.byMonth.map((v, i) => <i key={i} title={`${periodLabel(a.months[i])}: ${lei(v)}`} style={{ height: `${Math.max(v ? 8 : 2, v / mx * 100)}%`, background: v ? OUT : "var(--divider)" }} />)}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {a.associates.length > 0 && (
        <section className="card flush">
          <div className="cardHead"><h2>Asociați</h2><span className="muted">(venituri − colaboratori) × cotă − cheltuielile fixe aferente</span></div>
          <div className="tableWrap">
            <table className="table">
              <thead><tr><th>Asociat</th><th style={{ textAlign: "right" }}>Rapoarte</th><th style={{ textAlign: "right" }}>Venituri</th><th style={{ textAlign: "right" }}>− Colaboratori</th><th style={{ textAlign: "right" }}>= Bază</th><th style={{ textAlign: "right" }}>× Cotă</th><th style={{ textAlign: "right" }}>− Fixe</th><th style={{ textAlign: "right" }}>De primit</th></tr></thead>
              <tbody>
                {a.associates.map((x) => (
                  <tr key={x.id}>
                    <td><b>{x.name}</b></td><td style={{ textAlign: "right" }}>{x.reports}</td>
                    <td style={{ textAlign: "right", color: "var(--ok-text)" }} className="mono">{lei(x.revenue)}</td>
                    <td style={{ textAlign: "right", color: "var(--err)" }} className="mono">{lei(x.paid)}</td>
                    <td style={{ textAlign: "right" }} className="mono">{lei(x.base)}</td><td style={{ textAlign: "right" }}>{x.pct}%</td>
                    <td style={{ textAlign: "right", color: "var(--err)" }} className="mono">{lei(x.fixed)}</td>
                    <td style={{ textAlign: "right" }} className="mono"><b>{lei(x.cut)}</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <div className="anGrid2">
        <section className="card">
          <div className="cardHead"><h2>Pe tip de lucrare</h2></div>
          <Bars items={a.types} color="#6250d6" />
        </section>
        <section className="card">
          <div className="cardHead"><h2>Cheltuieli · structură {year}</h2></div>
          <Bars unit="" items={[
            { name: "Colaboratori", amount: t.paid, n: 0 }, { name: "Cheltuieli fixe", amount: t.fixed, n: 0 }, { name: "Cote asociați", amount: t.cuts, n: 0 },
          ].filter((x) => x.amount > 0).sort((x, y) => y.amount - x.amount)} color={OUT} />
        </section>
      </div>

      <section className="card flush">
        <div className="cardHead"><h2>Tabel pe luni · {year}</h2></div>
        <div className="tableWrap">
          <table className="table anTable">
            <thead><tr><th>Luna</th><th style={{ textAlign: "right" }}>Rapoarte</th>{SRCS.map((s) => <th key={s} style={{ textAlign: "right" }}>{SRC_LABEL[s]}</th>)}<th style={{ textAlign: "right" }}>Venituri</th><th style={{ textAlign: "right" }}>Colaboratori</th><th style={{ textAlign: "right" }}>Fixe</th><th style={{ textAlign: "right" }}>Profit firmă</th><th style={{ textAlign: "right" }}>Cote asociați</th><th style={{ textAlign: "right" }}>Net-ul tău</th></tr></thead>
            <tbody>
              {a.rows.map((r) => (
                <tr key={r.m}>
                  <td><a className="link" href={`${base}/borderouri?luna=${r.m}`}>{periodLabel(r.m)}</a></td><td style={{ textAlign: "right" }}>{r.reports}</td>
                  {SRCS.map((s) => <td key={s} style={{ textAlign: "right" }} className="mono">{r.bySrc[s] ? lei(r.bySrc[s]) : "—"}</td>)}
                  <td style={{ textAlign: "right", color: "var(--ok-text)" }} className="mono"><b>{lei(r.revenue)}</b></td>
                  <td style={{ textAlign: "right", color: "var(--err)" }} className="mono">{lei(r.paid)}</td>
                  <td style={{ textAlign: "right", color: "var(--err)" }} className="mono">{lei(r.fixed)}</td>
                  <td style={{ textAlign: "right" }} className="mono">{lei(r.profit)}</td>
                  <td style={{ textAlign: "right", color: "var(--err)" }} className="mono">{lei(r.cuts)}</td>
                  <td style={{ textAlign: "right", color: r.net >= 0 ? "var(--ok-text)" : "var(--err)" }} className="mono"><b>{lei(r.net)}</b></td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr><td><b>Total {year}</b></td><td style={{ textAlign: "right" }}><b>{t.reports}</b></td>{SRCS.map((s) => <td key={s} style={{ textAlign: "right" }} className="mono">{lei(t.bySrc[s])}</td>)}
              <td style={{ textAlign: "right" }} className="mono"><b>{lei(t.revenue)}</b></td><td style={{ textAlign: "right" }} className="mono">{lei(t.paid)}</td><td style={{ textAlign: "right" }} className="mono">{lei(t.fixed)}</td>
              <td style={{ textAlign: "right" }} className="mono">{lei(t.profit)}</td><td style={{ textAlign: "right" }} className="mono">{lei(t.cuts)}</td><td style={{ textAlign: "right" }} className="mono"><b>{lei(t.net)}</b></td></tr></tfoot>
          </table>
        </div>
        <p className="hint pad">Net-ul tău = venituri − colaboratori − cheltuielile fixe rămase la tine − cotele nete ale asociaților. Plățile: borderoul validat / emis când există, altfel calculate din cotele de azi.</p>
      </section>
    </CrmShell>
  );
}
