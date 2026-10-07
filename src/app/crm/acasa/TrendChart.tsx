"use client";
// 12 months of delivered reports (or fees), each month next to the same month a year earlier. Hover for the numbers,
// click a month to open its reports.
import { useState } from "react";

type Month = { ym: string; n: number; fees: number; prevN: number; prevFees: number };
const MONTHS = ["ian.", "feb.", "mar.", "apr.", "mai", "iun.", "iul.", "aug.", "sept.", "oct.", "nov.", "dec."];
const lei = (v: number) => `${Math.round(v).toLocaleString("ro-RO")} lei`;
const short = (v: number, money: boolean) => (money ? (v >= 1000 ? `${Math.round(v / 1000).toLocaleString("ro-RO")}k` : String(Math.round(v))) : String(v));

/** A rounded top for the axis: 1, 2, 5 × 10^k. */
function niceMax(v: number) {
  if (v <= 0) return 4;
  const p = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 2.5, 5, 10].map((k) => k * p).find((x) => x >= v) ?? v;
}

export function TrendChart({ months, money, base }: { months: Month[]; money: boolean; base: string }) {
  const [mode, setMode] = useState<"n" | "fees">("n");
  const [hover, setHover] = useState<number | null>(null);
  const val = (m: Month) => (mode === "n" ? m.n : m.fees);
  const prev = (m: Month) => (mode === "n" ? m.prevN : m.prevFees);
  const max = niceMax(Math.max(...months.map((m) => Math.max(val(m), prev(m)))));
  const W = 760, H = 240, L = 44, B = 28, T = 12;
  const cw = (W - L) / months.length;
  const y = (v: number) => T + (H - T - B) * (1 - v / max);
  const total = months.reduce((s, m) => s + val(m), 0), totalPrev = months.reduce((s, m) => s + prev(m), 0);
  const delta = totalPrev ? Math.round(((total - totalPrev) / totalPrev) * 100) : null;
  const h = hover != null ? months[hover] : null;
  const fmt = (v: number) => (mode === "fees" ? lei(v) : `${v} ${v === 1 ? "raport" : "rapoarte"}`);

  return (
    <div className="dbChart">
      <div className="dbChartHead">
        <div>
          <b className="dbChartTotal">{mode === "fees" ? lei(total) : total.toLocaleString("ro-RO")}</b>
          <span className="muted"> {mode === "fees" ? "onorarii" : "rapoarte predate"} în ultimele 12 luni</span>
          {delta != null && <span className={`dbDelta ${delta >= 0 ? "up" : "down"}`}>{delta >= 0 ? "↑" : "↓"} {Math.abs(delta)}% față de anul anterior</span>}
        </div>
        <div className="dbChartTools">
          <span className="dbLegend"><i className="cur" />Ultimele 12 luni</span>
          <span className="dbLegend"><i className="prev" />Cu un an în urmă</span>
          {money && (
            <div className="segment" role="group" aria-label="Arată">
              <button type="button" aria-pressed={mode === "n"} onClick={() => setMode("n")}>Rapoarte</button>
              <button type="button" aria-pressed={mode === "fees"} onClick={() => setMode("fees")}>Onorarii</button>
            </div>
          )}
        </div>
      </div>
      <div className="dbChartBox" onMouseLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Evoluție lunară: ${fmt(total)} în 12 luni`} preserveAspectRatio="none">
          {[0, 0.25, 0.5, 0.75, 1].map((k) => (
            <g key={k}>
              <line x1={L} x2={W} y1={y(max * k)} y2={y(max * k)} className="grid" />
              <text x={L - 8} y={y(max * k) + 4} textAnchor="end" className="axis">{short(max * k, mode === "fees")}</text>
            </g>
          ))}
          {months.map((m, i) => {
            const x = L + i * cw, bw = Math.min(18, cw * 0.3);
            const cx = x + cw / 2;
            const yr = m.ym.slice(0, 4);
            return (
              <a key={m.ym} href={`${base}/rapoarte?status=done&year=${yr}`} aria-label={`${MONTHS[Number(m.ym.slice(5)) - 1]} ${yr}: ${fmt(val(m))}`}>
                <rect x={x} y={T} width={cw} height={H - T - B} className={`hit${hover === i ? " on" : ""}`} onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} />
                <rect x={cx - bw - 2} y={y(prev(m))} width={bw} height={Math.max(0, H - B - y(prev(m)))} rx="4" className="bar prev" pointerEvents="none" />
                <rect x={cx + 2} y={y(val(m))} width={bw} height={Math.max(0, H - B - y(val(m)))} rx="4" className={`bar cur${i === months.length - 1 ? " now" : ""}`} pointerEvents="none" />
                <text x={cx} y={H - 8} textAnchor="middle" className={`axis${hover === i ? " strong" : ""}`}>{MONTHS[Number(m.ym.slice(5)) - 1]}</text>
              </a>
            );
          })}
        </svg>
        {h && hover != null && (
          <div className="dbTip" style={{ left: `${((L + hover * cw + cw / 2) / W) * 100}%` }}>
            <b>{MONTHS[Number(h.ym.slice(5)) - 1]} {h.ym.slice(0, 4)}</b>
            <span><i className="cur" />{fmt(val(h))}</span>
            <span><i className="prev" />{fmt(prev(h))} <small>({MONTHS[Number(h.ym.slice(5)) - 1]} {Number(h.ym.slice(0, 4)) - 1})</small></span>
            {mode === "n" && money && h.n > 0 && <span className="muted">onorarii {lei(h.fees)}</span>}
          </div>
        )}
      </div>
    </div>
  );
}
