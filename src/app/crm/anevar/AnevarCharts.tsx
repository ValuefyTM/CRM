"use client";
// The charts of the ANEVAR report: the months of the year against the year before, the kinds of work, the
// specialisations, the banks and the evaluators. Hover any mark for its numbers; click a bar to see its reports.
import { useState } from "react";

type Month = { m: number; n: number; fee: number; prevN: number; prevFee: number };
type Slice = { label: string; short?: string; n: number; fee: number };
const MONTHS = ["ian.", "feb.", "mar.", "apr.", "mai", "iun.", "iul.", "aug.", "sept.", "oct.", "nov.", "dec."];
/** categorical slots (validated for the cream surface) — one hue per specialisation, in a fixed order */
const PALETTE = ["#c77f0d", "#2a5fb4", "#1a8a60", "#8d4fd0", "#a8302a"];
const lei = (v: number) => `${Math.round(v).toLocaleString("ro-RO")} lei`;
const short = (v: number, money: boolean) => (money ? (v >= 1000 ? `${Math.round(v / 1000).toLocaleString("ro-RO")}k` : String(Math.round(v))) : String(v));
const niceMax = (v: number) => { if (v <= 0) return 4; const p = 10 ** Math.floor(Math.log10(v)); return [1, 2, 2.5, 5, 10].map((k) => k * p).find((x) => x >= v) ?? v; };
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 1000) / 10}%` : "0%");

export function AnevarCharts({ year, months, lines, specs, banks, evaluators }: { year: number; months: Month[]; lines: Slice[]; specs: Slice[]; banks: Slice[]; evaluators: Slice[] }) {
  const [mode, setMode] = useState<"n" | "fee">("n");
  const money = mode === "fee";
  const v = (s: { n: number; fee: number }) => (money ? s.fee : s.n);
  const fmt = (x: number) => (money ? lei(x) : `${x.toLocaleString("ro-RO")} ${x === 1 ? "raport" : "rapoarte"}`);
  const total = months.reduce((s, m) => s + v(m), 0), prevTotal = months.reduce((s, m) => s + (money ? m.prevFee : m.prevN), 0);
  return (
    <div className="anvCharts">
      <section className="card anvWide">
        <div className="dbChartHead">
          <div><b className="dbChartTotal">{money ? lei(total) : total.toLocaleString("ro-RO")}</b><span className="muted"> {money ? "onorarii" : "rapoarte"} declarate în {year}</span>
            {prevTotal > 0 && <span className="muted">· {year - 1}: {money ? lei(prevTotal) : prevTotal.toLocaleString("ro-RO")}</span>}</div>
          <div className="dbChartTools">
            <span className="dbLegend"><i className="cur" />{year}</span><span className="dbLegend"><i className="prev" />{year - 1}</span>
            <div className="segment" role="group" aria-label="Arată"><button type="button" aria-pressed={!money} onClick={() => setMode("n")}>Rapoarte</button><button type="button" aria-pressed={money} onClick={() => setMode("fee")}>Onorarii</button></div>
          </div>
        </div>
        <Monthly months={months} money={money} year={year} fmt={fmt} />
      </section>
      <section className="card">
        <div className="cardHead"><h2>Tipuri de lucrări</h2><span className="muted">{money ? "cifra de afaceri" : "rapoarte"} pe linie din Anexa 4</span></div>
        <HBars rows={lines.filter((l) => l.n > 0).map((l) => ({ ...l, label: l.short ?? l.label }))} money={money} color="#c77f0d" />
      </section>
      <section className="card">
        <div className="cardHead"><h2>Specializări</h2><span className="muted">ponderea fiecăreia</span></div>
        <Donut slices={specs} money={money} />
      </section>
      <section className="card">
        <div className="cardHead"><h2>Bănci și destinatari</h2><span className="muted">cui sunt adresate rapoartele</span></div>
        <HBars rows={banks} money={money} color="#2a5fb4" />
      </section>
      <section className="card">
        <div className="cardHead"><h2>Evaluatori</h2><span className="muted">rapoartele pe evaluator principal</span></div>
        <HBars rows={evaluators} money={money} color="#1a8a60" />
      </section>
    </div>
  );
}

/** The twelve months, this year next to the year before. */
function Monthly({ months, money, year, fmt }: { months: Month[]; money: boolean; year: number; fmt: (x: number) => string }) {
  const [hover, setHover] = useState<number | null>(null);
  const val = (m: Month) => (money ? m.fee : m.n), prev = (m: Month) => (money ? m.prevFee : m.prevN);
  const max = niceMax(Math.max(...months.map((m) => Math.max(val(m), prev(m)))));
  const W = 760, H = 230, L = 44, B = 26, T = 10;
  const cw = (W - L) / 12;
  const y = (x: number) => T + (H - T - B) * (1 - x / max);
  const h = hover != null ? months[hover] : null;
  return (
    <div className="dbChartBox" onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Rapoarte pe luni în ${year}`} preserveAspectRatio="none">
        {[0, 0.25, 0.5, 0.75, 1].map((k) => <g key={k}><line x1={L} x2={W} y1={y(max * k)} y2={y(max * k)} className="grid" /><text x={L - 8} y={y(max * k) + 4} textAnchor="end" className="axis">{short(max * k, money)}</text></g>)}
        {months.map((m, i) => {
          const x = L + i * cw, bw = Math.min(18, cw * 0.3), cx = x + cw / 2;
          return (
            <g key={m.m}>
              <rect x={x} y={T} width={cw} height={H - T - B} className={`hit${hover === i ? " on" : ""}`} onMouseEnter={() => setHover(i)} />
              <rect x={cx - bw - 1} y={y(prev(m))} width={bw} height={Math.max(0, H - B - y(prev(m)))} rx="3" className="bar prev" pointerEvents="none" />
              <rect x={cx + 1} y={y(val(m))} width={bw} height={Math.max(0, H - B - y(val(m)))} rx="3" className="bar cur" pointerEvents="none" />
              <text x={cx} y={H - 8} textAnchor="middle" className={`axis${hover === i ? " strong" : ""}`}>{MONTHS[i]}</text>
            </g>
          );
        })}
      </svg>
      {h && hover != null && (
        <div className="dbTip" style={{ left: `${((L + hover * cw + cw / 2) / W) * 100}%` }}>
          <b>{MONTHS[hover]} {year}</b>
          <span><i className="cur" />{fmt(val(h))}</span>
          <span><i className="prev" />{fmt(prev(h))} <small>({MONTHS[hover]} {year - 1})</small></span>
          {!money && h.n > 0 && <span className="muted">onorarii {lei(h.fee)}</span>}
        </div>
      )}
    </div>
  );
}

/** Horizontal bars, one hue (a magnitude), direct labels. */
function HBars({ rows, money, color }: { rows: Slice[]; money: boolean; color: string }) {
  const [hover, setHover] = useState<number | null>(null);
  if (!rows.length) return <div className="empty">Nimic de arătat.</div>;
  const v = (s: Slice) => (money ? s.fee : s.n);
  const max = Math.max(...rows.map(v), 1), sum = rows.reduce((s, r) => s + v(r), 0);
  return (
    <ul className="anvHb" onMouseLeave={() => setHover(null)}>
      {rows.map((r, i) => (
        <li key={r.label} className={hover === i ? "on" : undefined} onMouseEnter={() => setHover(i)} title={`${r.n} rapoarte · ${lei(r.fee)}`}>
          <span className="anvHbLabel">{r.label}</span>
          <span className="anvHbTrack"><i style={{ width: `${(v(r) / max) * 100}%`, background: color }} /></span>
          <span className="anvHbVal mono">{money ? lei(v(r)) : v(r).toLocaleString("ro-RO")} <small>{pct(v(r), sum)}</small></span>
        </li>
      ))}
    </ul>
  );
}

/** A donut of the specialisations, with a legend that carries the numbers. */
function Donut({ slices, money }: { slices: Slice[]; money: boolean }) {
  const [hover, setHover] = useState<number | null>(null);
  const v = (s: Slice) => (money ? s.fee : s.n);
  const sum = slices.reduce((s, x) => s + v(x), 0);
  if (!sum) return <div className="empty">Nimic de arătat.</div>;
  const R = 54, r = 36, C = 64;
  let a0 = -Math.PI / 2;
  const arcs = slices.map((s, i) => {
    const frac = v(s) / sum, a1 = a0 + frac * Math.PI * 2;
    const big = frac > 0.5 ? 1 : 0;
    const p = (ang: number, rad: number) => [C + rad * Math.cos(ang), C + rad * Math.sin(ang)];
    const [x0, y0] = p(a0, R), [x1, y1] = p(a1, R), [x2, y2] = p(a1, r), [x3, y3] = p(a0, r);
    const d = frac >= 0.9999 ? `M ${C + R} ${C} A ${R} ${R} 0 1 1 ${C - R} ${C} A ${R} ${R} 0 1 1 ${C + R} ${C} L ${C + r} ${C} A ${r} ${r} 0 1 0 ${C - r} ${C} A ${r} ${r} 0 1 0 ${C + r} ${C} Z`
      : `M ${x0} ${y0} A ${R} ${R} 0 ${big} 1 ${x1} ${y1} L ${x2} ${y2} A ${r} ${r} 0 ${big} 0 ${x3} ${y3} Z`;
    a0 = a1;
    return { d, i, frac };
  });
  const h = hover != null ? slices[hover] : null;
  return (
    <div className="anvDonut" onMouseLeave={() => setHover(null)}>
      <svg viewBox="0 0 128 128" role="img" aria-label="Specializări">
        {arcs.filter((a) => a.frac > 0).map((a) => <path key={a.i} d={a.d} fill={PALETTE[a.i]} stroke="var(--cream)" strokeWidth="2" opacity={hover == null || hover === a.i ? 1 : 0.35} onMouseEnter={() => setHover(a.i)} />)}
        <text x="64" y="60" textAnchor="middle" className="anvDonutBig">{h ? pct(v(h), sum) : money ? short(sum, true) : sum.toLocaleString("ro-RO")}</text>
        <text x="64" y="76" textAnchor="middle" className="anvDonutSmall">{h ? h.label.split(" · ")[0] : money ? "lei" : "rapoarte"}</text>
      </svg>
      <ul className="anvLegend">
        {slices.map((s, i) => (
          <li key={s.label} className={hover === i ? "on" : s.n ? undefined : "dim"} onMouseEnter={() => setHover(i)}>
            <i style={{ background: PALETTE[i] }} /><span>{s.label}</span><b className="mono">{money ? lei(s.fee) : s.n.toLocaleString("ro-RO")}</b><small>{pct(v(s), sum)}</small>
          </li>
        ))}
      </ul>
    </div>
  );
}
