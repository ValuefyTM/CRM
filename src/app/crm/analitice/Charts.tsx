"use client";

import { useEffect, useRef, useState } from "react";

const lei = (n: number) => `${n.toLocaleString("ro-RO", { maximumFractionDigits: 0 })} lei`;
const short = (n: number) => (Math.abs(n) >= 1000 ? `${(n / 1000).toLocaleString("ro-RO", { maximumFractionDigits: 1 })}k` : `${Math.round(n)}`);
const pct = (v: number, t: number) => (t ? `${Math.round(v / t * 100)}%` : "0%");

/** A clean upper bound for an axis: 1, 2, 2.5, 5 × 10^n. */
const niceMax = (v: number) => {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  return ([1, 2, 2.5, 5, 10].find((k) => k * p >= v) ?? 10) * p;
};

/** The width of the box the chart is in (charts are drawn at their real size: text stays crisp, height stays fixed). */
function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

export type Month = { m: string; label: string; short: string; revenue: number; costs: number; paid: number; fixed: number; cuts: number; net: number };

const IN = "#1fa971", OUT = "#d0453f", NET = "#141414";

/** Revenue and costs per month as bars, the owner's net as a line; series switched on/off from the legend, details on hover. */
export function MonthsChart({ rows, height = 190 }: { rows: Month[]; height?: number }) {
  const [ref, W] = useWidth();
  const [on, setOn] = useState({ revenue: true, costs: true, net: true });
  const [hover, setHover] = useState<number | null>(null);
  const H = height, L = 44, R = 8, B = 22, T = 8;
  const vals = rows.flatMap((r) => [on.revenue ? r.revenue : 0, on.costs ? r.costs : 0, on.net ? r.net : 0]);
  const max = niceMax(Math.max(...vals, 1));
  const min = Math.min(0, ...(on.net ? rows.map((r) => r.net) : [0]));
  const lo = min < 0 ? -niceMax(-min) : 0;
  const y = (v: number) => T + (H - T - B) * (1 - (v - lo) / (max - lo));
  const step = Math.max(1, (W - L - R) / rows.length);
  const both = on.revenue && on.costs;
  const bw = Math.max(4, Math.min(18, step / (both ? 3.2 : 2)));
  const x = (i: number) => L + step * i + step / 2;
  // the negative end only when it is far enough from 0 for both labels to fit
  const ticks = lo < 0 && -lo > (max - lo) * 0.15 ? [lo, 0, max / 2, max] : [0, max / 2, max];
  const series: [keyof typeof on, string, string][] = [["revenue", "Venituri", IN], ["costs", "Colaboratori + fixe", OUT], ["net", "Net-ul tău", NET]];
  const h = hover != null ? rows[hover] : null;
  return (
    <div className="anChartBox">
      <div className="anLegend anToggles" role="group" aria-label="Serii afișate">
        {series.map(([k, l, c]) => (
          <button key={k} type="button" aria-pressed={on[k]} onClick={() => setOn((s) => ({ ...s, [k]: !s[k] }))}>
            <i className={k === "net" ? "dot" : ""} style={{ background: on[k] ? c : "transparent", borderColor: c }} />{l}
          </button>
        ))}
      </div>
      <div ref={ref} className="anPlot" style={{ height: H }} onMouseLeave={() => setHover(null)}>
        {W > 0 && (
          <svg width={W} height={H} role="img" aria-label="Venituri, cheltuieli și net-ul pe luni">
            {ticks.map((t) => <g key={t}><line x1={L} x2={W - R} y1={y(t)} y2={y(t)} className={t === 0 && lo < 0 ? "anZero" : "anGridLine"} /><text x={L - 6} y={y(t) + 3} className="anAxis" textAnchor="end">{short(t)}</text></g>)}
            {hover != null && <rect x={x(hover) - step / 2} y={T} width={step} height={H - T - B} className="anBand" />}
            {rows.map((r, i) => {
              const cx = x(i);
              const bars: [number, string][] = [...(on.revenue ? [[r.revenue, IN] as [number, string]] : []), ...(on.costs ? [[r.costs, OUT] as [number, string]] : [])];
              return (
                <g key={r.m}>
                  {bars.map(([v, c], k) => {
                    const bx = bars.length === 2 ? (k === 0 ? cx - bw - 1 : cx + 1) : cx - bw / 2;
                    return <rect key={c} x={bx} y={y(Math.max(v, 0))} width={bw} height={Math.max(0, y(0) - y(Math.max(v, 0)))} rx={3} fill={c} opacity={hover == null || hover === i ? 1 : 0.45} />;
                  })}
                  <text x={cx} y={H - 6} className="anAxis" textAnchor="middle">{r.short}</text>
                </g>
              );
            })}
            {on.net && <polyline points={rows.map((r, i) => `${x(i)},${y(r.net)}`).join(" ")} fill="none" stroke={NET} strokeWidth={2} strokeLinejoin="round" />}
            {on.net && rows.map((r, i) => <circle key={r.m} cx={x(i)} cy={y(r.net)} r={hover === i ? 5 : 3.5} fill={NET} stroke="#fff" strokeWidth={2} />)}
            {rows.map((r, i) => <rect key={r.m} x={x(i) - step / 2} y={0} width={step} height={H} fill="transparent" onMouseEnter={() => setHover(i)} onClick={() => setHover(i)} />)}
          </svg>
        )}
        {h && (
          <div className="anTip" style={{ left: Math.min(Math.max(x(hover!) - 105, 0), Math.max(0, W - 210)) }}>
            <b>{h.label}</b>
            <span><i style={{ background: IN }} />Venituri<em>{lei(h.revenue)}</em></span>
            <span><i style={{ background: OUT }} />Colaboratori<em>{lei(h.paid)}</em></span>
            <span><i style={{ background: OUT }} />Cheltuieli fixe<em>{lei(h.fixed)}</em></span>
            {h.cuts !== 0 && <span><i style={{ background: "#6250d6" }} />Cote asociați<em>{lei(h.cuts)}</em></span>}
            <span className="anTipNet"><i className="dot" style={{ background: NET }} />Net-ul tău<em>{lei(h.net)}</em></span>
          </div>
        )}
      </div>
    </div>
  );
}

export type Slice = { name: string; value: number; color: string; sub?: string };

/** A donut with its legend: hover (or tap) a slice or a legend row to see its value and share in the middle. */
export function Donut({ items, total: shownTotal, center = "Total", size = 132 }: { items: Slice[]; total?: number; center?: string; size?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const list = items.filter((x) => x.value > 0);
  const total = list.reduce((t, x) => t + x.value, 0);
  if (!total) return <p className="hint">Nimic în anul acesta.</p>;
  const r = size / 2, rIn = r * 0.62, gap = list.length > 1 ? 0.012 : 0;
  let a0 = -Math.PI / 2;
  const arcs = list.map((x) => {
    const a = (x.value / total) * Math.PI * 2;
    const s = a0 + gap, e = a0 + Math.max(a - gap, gap * 0.5) ;
    a0 += a;
    const big = e - s > Math.PI ? 1 : 0;
    const p = (rad: number, ang: number) => `${r + rad * Math.cos(ang)},${r + rad * Math.sin(ang)}`;
    // a whole circle (one slice) is drawn as two halves
    const d = list.length === 1
      ? `M${p(r, -Math.PI / 2)}A${r},${r} 0 1 1 ${p(r, Math.PI / 2 - 0.0001)}A${r},${r} 0 1 1 ${p(r, -Math.PI / 2 - 0.0001)}L${p(rIn, -Math.PI / 2)}A${rIn},${rIn} 0 1 0 ${p(rIn, Math.PI / 2)}A${rIn},${rIn} 0 1 0 ${p(rIn, -Math.PI / 2)}Z`
      : `M${p(r, s)}A${r},${r} 0 ${big} 1 ${p(r, e)}L${p(rIn, e)}A${rIn},${rIn} 0 ${big} 0 ${p(rIn, s)}Z`;
    return { ...x, d };
  });
  const h = hover != null ? list[hover] : null;
  return (
    <div className="anDonut">
      <div className="anDonutPie" style={{ width: size, height: size }} onMouseLeave={() => setHover(null)}>
        <svg width={size} height={size} role="img" aria-label={list.map((x) => `${x.name} ${pct(x.value, total)}`).join(", ")}>
          {arcs.map((x, i) => (
            <path key={x.name} d={x.d} fill={x.color} opacity={hover == null || hover === i ? 1 : 0.35}
              transform={hover === i ? `translate(${r} ${r}) scale(1.04) translate(${-r} ${-r})` : undefined}
              onMouseEnter={() => setHover(i)} onClick={() => setHover(hover === i ? null : i)} style={{ cursor: "pointer", transition: "opacity .15s" }} />
          ))}
        </svg>
        <span className="anDonutMid">
          {h ? <><small>{h.name}</small><b>{pct(h.value, total)}</b><small>{lei(h.value)}</small></> : <><small>{center}</small><b>{short(shownTotal ?? total)}</b><small>lei</small></>}
        </span>
      </div>
      <ul className="anDonutLeg">
        {list.map((x, i) => (
          <li key={x.name} className={hover === i ? "on" : ""} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            <i style={{ background: x.color }} /><span title={x.name}>{x.name}</span><small>{pct(x.value, total)}</small>
            <b className="mono">{lei(x.value)}{x.sub && <em> · {x.sub}</em>}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}

export type SrcMonth = { label: string; short: string; parts: { name: string; value: number; color: string }[] };

/** The revenue of each month by source, stacked, compact; details on hover. */
export function StackChart({ rows, height = 150 }: { rows: SrcMonth[]; height?: number }) {
  const [ref, W] = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const H = height, L = 40, R = 6, B = 20, T = 6;
  const max = niceMax(Math.max(...rows.map((r) => r.parts.reduce((t, p) => t + p.value, 0)), 1));
  const y = (v: number) => T + (H - T - B) * (1 - v / max);
  const step = Math.max(1, (W - L - R) / rows.length), bw = Math.max(5, Math.min(22, step * 0.55));
  const x = (i: number) => L + step * i + step / 2;
  const h = hover != null ? rows[hover] : null;
  return (
    <div ref={ref} className="anPlot" style={{ height: H }} onMouseLeave={() => setHover(null)}>
      {W > 0 && (
        <svg width={W} height={H} role="img" aria-label="Veniturile pe surse, pe luni">
          {[0, 0.5, 1].map((k) => <g key={k}><line x1={L} x2={W - R} y1={y(max * k)} y2={y(max * k)} className="anGridLine" /><text x={L - 6} y={y(max * k) + 3} className="anAxis" textAnchor="end">{short(max * k)}</text></g>)}
          {hover != null && <rect x={x(hover) - step / 2} y={T} width={step} height={H - T - B} className="anBand" />}
          {rows.map((r, i) => {
            let acc = 0;
            return (
              <g key={r.label} opacity={hover == null || hover === i ? 1 : 0.5}>
                {r.parts.map((p) => {
                  if (p.value <= 0) return null;
                  const top = y(acc + p.value), hh = y(acc) - top;
                  acc += p.value;
                  return <rect key={p.name} x={x(i) - bw / 2} y={top} width={bw} height={Math.max(0, hh - 2)} rx={2} fill={p.color} />;
                })}
                <text x={x(i)} y={H - 5} className="anAxis" textAnchor="middle">{r.short}</text>
              </g>
            );
          })}
          {rows.map((r, i) => <rect key={r.label} x={x(i) - step / 2} y={0} width={step} height={H} fill="transparent" onMouseEnter={() => setHover(i)} onClick={() => setHover(i)} />)}
        </svg>
      )}
      {h && (
        <div className="anTip" style={{ left: Math.min(Math.max(x(hover!) - 85, 0), Math.max(0, W - 170)) }}>
          <b>{h.label}</b>
          {h.parts.map((p) => <span key={p.name}><i style={{ background: p.color }} />{p.name}<em>{lei(p.value)}</em></span>)}
          <span className="anTipNet">Total<em>{lei(h.parts.reduce((t, p) => t + p.value, 0))}</em></span>
        </div>
      )}
    </div>
  );
}
