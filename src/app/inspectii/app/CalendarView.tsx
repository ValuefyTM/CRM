"use client";

import { useMemo, useState } from "react";
import type { Ctx } from "./InspApp";
import { dayKey, fmtDay, MONTHS, parseLocal } from "./store";
import { Icon, TopBar } from "./ui";
import { InspCard } from "./ListView";

const WD = ["L", "Ma", "Mi", "J", "V", "S", "D"];

/** Month view of the scheduled visits; tapping a day lists its visits. */
export function CalendarView({ ctx }: { ctx: Ctx }) {
  const today = new Date();
  const [month, setMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [sel, setSel] = useState(() => dayKey(today));

  const byDay = useMemo(() => {
    const m = new Map<string, typeof ctx.list>();
    for (const i of ctx.list) {
      const at = i.status === "done" ? i.done_at ?? i.scheduled_at : i.scheduled_at;
      if (!at || i.status === "cancelled") continue;
      const k = at.slice(0, 10);
      m.set(k, [...(m.get(k) ?? []), i]);
    }
    for (const l of m.values()) l.sort((a, b) => (a.scheduled_at ?? "").localeCompare(b.scheduled_at ?? ""));
    return m;
  }, [ctx.list]);

  const cells = useMemo(() => {
    const start = new Date(month);
    start.setDate(1 - ((month.getDay() + 6) % 7)); // Monday first
    return Array.from({ length: 42 }, (_, n) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + n));
  }, [month]);
  const rows = cells[35].getMonth() !== month.getMonth() ? cells.slice(0, 35) : cells;

  const shift = (n: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1));
  const items = byDay.get(sel) ?? [];
  const toSchedule = ctx.list.filter((i) => i.status === "to_schedule" && !i.local).length;

  return (
    <>
      <TopBar title="Calendar" sub={`${MONTHS[month.getMonth()]} ${month.getFullYear()}`}
        right={<button type="button" className="iTextBtn" onClick={() => { setMonth(new Date(today.getFullYear(), today.getMonth(), 1)); setSel(dayKey(today)); }}>Azi</button>} />
      <div className="iPad">
        <section className="iCal" aria-label="Luna">
          <div className="iCalHead">
            <button type="button" className="iIconBtn light" onClick={() => shift(-1)} aria-label="Luna anterioară"><Icon.back /></button>
            <b>{MONTHS[month.getMonth()].replace(/^./, (c) => c.toUpperCase())} {month.getFullYear()}</b>
            <button type="button" className="iIconBtn light flip" onClick={() => shift(1)} aria-label="Luna următoare"><Icon.back /></button>
          </div>
          <div className="iCalGrid">
            {WD.map((d) => <span key={d} className="iCalWd">{d}</span>)}
            {rows.map((d) => {
              const k = dayKey(d);
              const list = byDay.get(k) ?? [];
              const out = d.getMonth() !== month.getMonth();
              return (
                <button key={k} type="button" onClick={() => setSel(k)}
                  className={`iCalDay${out ? " out" : ""}${k === dayKey(today) ? " today" : ""}${k === sel ? " sel" : ""}`}
                  aria-label={`${fmtDay(d)}${list.length ? `, ${list.length} inspecții` : ""}`} aria-pressed={k === sel}>
                  <span>{d.getDate()}</span>
                  {list.length > 0 && (
                    <span className="iCalDots">
                      {list.slice(0, 3).map((i) => <i key={i.id} className={i.status === "done" || i.local ? "ok" : "acc"} />)}
                      {list.length > 3 && <em>+{list.length - 3}</em>}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </section>
        <h2 className="iDay">{fmtDay(parseLocal(sel)!).replace(/^./, (c) => c.toUpperCase())} · {items.length ? `${items.length} ${items.length === 1 ? "inspecție" : "inspecții"}` : "liber"}</h2>
        {items.map((i) => <InspCard key={i.id} i={i} now={new Date()} onOpen={() => ctx.go(`#/i/${encodeURIComponent(i.id)}`)} />)}
        {toSchedule > 0 && (
          <a className="iBanner soft" href="#/" onClick={() => { try { sessionStorage.setItem("insp-tab", "deprogramat"); } catch { /* ignore */ } }}>
            <span className="iBannerN">{toSchedule}</span><span>{toSchedule === 1 ? "inspecție așteaptă" : "inspecții așteaptă"} să fie programate.</span><b>Vezi →</b>
          </a>
        )}
      </div>
    </>
  );
}
