import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { staffPage } from "@/lib/guard";
import { periodLabel } from "@/lib/statements";
import { SRC_LABEL, yearAnalytics, type Src } from "@/lib/analytics";
import { CrmShell } from "@/components/CrmShell";
import { Donut, MonthsChart, StackChart, type Slice } from "./Charts";

export const metadata: Metadata = { title: "Analitice | CRM VALUEFY" };
export const dynamic = "force-dynamic";

const lei = (n: number) => `${n.toLocaleString("ro-RO", { maximumFractionDigits: 0 })} lei`;
const lei2 = (n: number) => `${n.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} lei`;
const MON = ["ian", "feb", "mar", "apr", "mai", "iun", "iul", "aug", "sep", "oct", "nov", "dec"];
const SRC_COLOR: Record<Src, string> = { direct: "#2a78d6", framework: "#eb6834", collab: "#1baf7a" };
const SRCS: Src[] = ["direct", "framework", "collab"];
const IN = "#1fa971", OUT = "#d0453f", NET = "#141414";
// categorical slots, in fixed order; "Altele" is neutral
const CAT = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4"], REST = "#b5b3ab";

/** The first five by amount, then the rest together. */
const top5 = (items: { name: string; amount: number; n: number }[], unit = true): Slice[] => {
  const s = [...items].sort((a, b) => b.amount - a.amount);
  const rest = s.slice(5);
  return [
    ...s.slice(0, 5).map((x, i) => ({ name: x.name, value: x.amount, color: CAT[i], sub: unit ? `${x.n} rap.` : undefined })),
    ...(rest.length ? [{ name: `Altele (${rest.length})`, value: rest.reduce((t, x) => t + x.amount, 0), color: REST }] : []),
  ];
};

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
  const months = a.rows.map((r) => ({ m: r.m, label: periodLabel(r.m), short: MON[Number(r.m.slice(5)) - 1], revenue: r.revenue, costs: r.paid + r.fixed, paid: r.paid, fixed: r.fixed, cuts: r.cuts, net: r.net }));
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

      <div className="anGrid31">
        <section className="card">
          <div className="cardHead"><h2>Pe luni · venituri, cheltuieli, net</h2><span className="muted">trece cu mouse-ul peste o lună · apasă pe legendă ca să ascunzi o serie</span></div>
          <MonthsChart rows={months} />
        </section>
        <section className="card">
          <div className="cardHead"><h2>Unde merg veniturile</h2><span className="muted">{year}</span></div>
          <Donut center="Venituri" total={t.revenue} items={[
            { name: "Colaboratori", value: t.paid, color: OUT },
            { name: "Cheltuieli fixe (la tine)", value: t.fixedOwner, color: "#eda100" },
            { name: "Cote asociați", value: t.cuts, color: "#6250d6" },
            { name: "Net-ul tău", value: t.net, color: IN },
          ]} />
        </section>
      </div>

      <div className="anGrid3">
        <section className="card">
          <div className="cardHead"><h2>Venituri pe surse</h2></div>
          <Donut center="Venituri" items={SRCS.map((s) => ({ name: SRC_LABEL[s], value: t.bySrc[s], color: SRC_COLOR[s] }))} />
        </section>
        <section className="card">
          <div className="cardHead"><h2>Utilizatori desemnați</h2><span className="muted">top 5</span></div>
          <Donut center="Venituri" items={top5(a.banks)} />
        </section>
        <section className="card">
          <div className="cardHead"><h2>Tip de lucrare</h2><span className="muted">top 5</span></div>
          <Donut center="Venituri" items={top5(a.types)} />
        </section>
      </div>

      <div className="anGrid2">
        <section className="card">
          <div className="cardHead"><h2>Veniturile pe surse, pe luni</h2><span className="anLegend">{SRCS.map((s) => <span key={s}><i style={{ background: SRC_COLOR[s] }} />{SRC_LABEL[s]}</span>)}</span></div>
          <StackChart rows={a.rows.map((r) => ({ label: periodLabel(r.m), short: MON[Number(r.m.slice(5)) - 1], parts: SRCS.map((s) => ({ name: SRC_LABEL[s], value: r.bySrc[s], color: SRC_COLOR[s] })) }))} />
        </section>
        <section className="card">
          <div className="cardHead"><h2>Pe utilizatori desemnați</h2><span className="muted">bănci și instituții, din toate sursele</span></div>
          <Bars items={a.banks} color="#2a78d6" limit={6} />
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
