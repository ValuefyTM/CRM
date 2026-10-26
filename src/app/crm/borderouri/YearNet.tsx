"use client";

import { useEffect, useState } from "react";

type Ytd = { total: number; months: number };
// one request per month shown, shared by the card and the line under the result
const asked = new Map<string, Promise<Ytd | null>>();
const load = (period: string) => {
  if (!asked.has(period)) asked.set(period, fetch(`/api/crm/statements/ytd?luna=${period}`).then((r) => (r.ok ? (r.json() as Promise<Ytd>) : null)).catch(() => null));
  return asked.get(period)!;
};
const lei2 = (n: number) => `${n.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} lei`;

/** The owner's net of the year so far, loaded after the page shows: ` · 2026 până acum: …` in the card's foot. */
export function YearNetFoot({ period }: { period: string }) {
  const [v, setV] = useState<Ytd | null | undefined>(undefined);
  useEffect(() => { let off = false; load(period).then((x) => { if (!off) setV(x); }); return () => { off = true; }; }, [period]);
  if (v === null) return null;
  return <> · {period.slice(0, 4)} până acum: {v ? lei2(v.total) : <span className="muted">se calculează…</span>}</>;
}

/** The line under the month's result: the net (or profit) from January to this month. */
export function YearNetRow({ period, label, month }: { period: string; label: string; month: string }) {
  const [v, setV] = useState<Ytd | null | undefined>(undefined);
  useEffect(() => { let off = false; load(period).then((x) => { if (!off) setV(x); }); return () => { off = true; }; }, [period]);
  if (v === null) return null;
  return (
    <dl className="stCalc stYtd">
      <div className="stSumTotal stNet"><dt>{label} în {period.slice(0, 4)}, ianuarie – {month} {v && <small className="muted">({v.months} {v.months === 1 ? "lună" : "luni"}, aceleași calcule lună de lună)</small>}</dt>
        <dd className="mono" style={v ? { color: v.total >= 0 ? "var(--ok-text)" : "var(--err)" } : undefined}>{v ? lei2(v.total) : <span className="muted">se calculează…</span>}</dd></div>
    </dl>
  );
}
