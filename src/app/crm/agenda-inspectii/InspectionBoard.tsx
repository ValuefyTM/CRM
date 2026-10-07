"use client";
// The team's inspections: filters, and a list, a week calendar or a map (linked on hover in the list + map view).
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { FilterSelect } from "@/components/FilterSelect";
import { Avatar } from "@/components/Avatar";
import type { BoardFilters, BoardRow } from "@/lib/inspections-board";
import { RegistryMap, type MapPoint } from "../proprietati/RegistryMap";

const STATE: Record<string, [string, string, string]> = {
  to_schedule: ["De programat", "pillWarn", "#e0931a"],
  scheduled: ["Programată", "pillInfo", "#111111"],
  done: ["Realizată", "pillOk", "#1fa971"],
  cancelled: ["Anulată", "pillErr", "#b3261e"],
};
const LATE = "#b3261e";
const DAYS = ["Lun", "Mar", "Mie", "Joi", "Vin", "Sâm", "Dum"];
const cap = (s: string | null) => (s ? s.charAt(0) + s.slice(1).toLowerCase() : "");
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const fmtDay = (iso: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join(".") : "—");
const fmtTime = (iso: string | null) => (iso && iso.length > 10 ? iso.slice(11, 16) : "");
const addDays = (iso: string, n: number) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

export function InspectionBoard(p: {
  base: string; current: BoardFilters & { vezi?: string }; rows: BoardRow[]; weekRows: BoardRow[]; week: string; today: string;
  people: { id: string; name: string; active: number }[]; states: [string, string][]; periods: [string, string][];
}) {
  const router = useRouter();
  const c = p.current;
  const view = c.vezi === "calendar" || c.vezi === "harta" ? c.vezi : "lista";
  const [q, setQ] = useState(c.q ?? "");
  const [hover, setHover] = useState<string | null>(null);

  const href = (change: Partial<BoardFilters & { vezi?: string }>) => {
    const next: Record<string, string | undefined> = { ...c, ...change };
    const qs = Object.entries(next).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&");
    return `${p.base}/agenda-inspectii${qs ? `?${qs}` : ""}`;
  };
  const go = (change: Partial<BoardFilters & { vezi?: string }>) => router.push(href(change), { scroll: false });
  const report = (r: BoardRow) => (r.report_id ? `${p.base}/rapoarte/${r.report_id}?tab=inspectii` : `${p.base}/rapoarte`);
  const color = (r: BoardRow) => (r.late ? LATE : STATE[r.status]?.[2] ?? "#7a7a7a");

  const points = useMemo<MapPoint[]>(() => p.rows.filter((r) => r.lat != null && r.lng != null).map((r) => ({
    id: r.id, lat: r.lat!, lng: r.lng!, cat: "", label: r.type ?? "Inspecție", address: r.address ?? "", value: null, date: r.scheduled_at, color: color(r),
    tip: `<b>${esc(cap(r.type) || "Inspecție")}</b> · ${esc(r.late ? "Întârziată" : STATE[r.status]?.[0] ?? r.status)}<br><small>${esc(r.address ?? "")}</small>`,
    popup: `<div class="rgPop"><span class="rgPopCat" style="--c:${color(r)}">${esc(r.late ? "Întârziată" : STATE[r.status]?.[0] ?? r.status)}</span>
      <b>${esc(cap(r.type) || "Inspecție")}</b><small>${esc(r.address ?? "")}</small>
      <span class="rgPopVal">${r.scheduled_at ? `${esc(fmtDay(r.scheduled_at))} ${esc(fmtTime(r.scheduled_at))}` : r.due_on ? `termen ${esc(fmtDay(r.due_on))}` : "neprogramată"}${r.inspector ? ` · ${esc(r.inspector)}` : ""}</span>
      <a href="${report(r)}">Deschide raportul →</a></div>`,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  })), [p.rows]);
  const onPick = useCallback((id: string) => setHover(id), []);

  const when = (r: BoardRow) => r.status === "done"
    ? <><b>{fmtDay(r.done_at)}</b><small>realizată {fmtTime(r.done_at)}</small></>
    : r.scheduled_at ? <><b>{fmtDay(r.scheduled_at)}</b><small>ora {fmtTime(r.scheduled_at)}{r.duration_min ? ` · ${r.duration_min} min` : ""}</small></>
    : <><b className="muted">neprogramată</b>{r.due_on && <small className={r.late ? "late" : ""}>termen {fmtDay(r.due_on)}</small>}</>;

  const pill = (r: BoardRow) => {
    const [l, cls] = STATE[r.status] ?? [r.status, ""];
    return <span className={`pill ${r.late ? "pillErr" : cls}`}><i />{r.late ? "Întârziată" : l}</span>;
  };
  const who = (r: BoardRow) => r.inspector
    ? <span className="ibWho"><Avatar id={r.inspector_id ?? r.inspector} name={r.inspector} size={24} presence={r.presence} photo={r.photo} title={`${r.inspector} · ${r.seen ?? ""}`} /><span>{r.inspector}</span></span>
    : <span className="muted">nealocată</span>;

  const list = (
    <div className="tableWrap">
      <table className="table ibTable">
        <thead><tr><th>Când</th><th>Proprietate</th><th>Inspector</th><th>Contact</th><th>Raport</th><th>Status</th></tr></thead>
        <tbody>
          {p.rows.map((r) => (
            <tr key={r.id} onMouseEnter={() => setHover(r.id)} onMouseLeave={() => setHover(null)} className={hover === r.id ? "hl" : ""}>
              <td className="ibWhen">{when(r)}</td>
              <td className="ibProp">
                <a href={report(r)}><b>{cap(r.type) || "Inspecție"}</b></a>
                <small>{r.address ?? "—"}</small>
              </td>
              <td>{who(r)}</td>
              <td>{r.contact_name ? <><span>{r.contact_name}</span>{r.contact_phone && <small className="block"><a href={`tel:${r.contact_phone.replace(/[^\d+]/g, "")}`}>{r.contact_phone}</a></small>}</> : <span className="muted">—</span>}</td>
              <td>{r.report_id ? <a className="ref" href={report(r)}>{r.report_number ?? "fără nr."}</a> : "—"}{r.report_label && <small className="block muted ibEll">{r.report_label}</small>}</td>
              <td>{pill(r)}{r.sheet_status === "draft" && r.status !== "done" && <small className="block muted">fișă în lucru</small>}{r.glide && <small className="block muted">din Glide</small>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  // Week calendar: Monday → Sunday, the visits of each day in order of time.
  const days = Array.from({ length: 7 }, (_, i) => addDays(p.week, i));
  const calendar = (
    <div className="ibCal">
      <div className="ibCalNav">
        <a className="btn btnGhost btnSm" href={href({ saptamana: addDays(p.week, -7) })}>← Săptămâna anterioară</a>
        <b>{fmtDay(days[0])} – {fmtDay(days[6])}</b>
        <span className="actions">
          {p.week !== weekOf(p.today) && <a className="btn btnGhost btnSm" href={href({ saptamana: undefined })}>Azi</a>}
          <a className="btn btnGhost btnSm" href={href({ saptamana: addDays(p.week, 7) })}>Săptămâna următoare →</a>
        </span>
      </div>
      <div className="ibWeek">
        {days.map((d, i) => {
          const items = p.weekRows.filter((r) => (r.scheduled_at ?? r.done_at ?? "").slice(0, 10) === d);
          return (
            <div key={d} className={`ibDay${d === p.today ? " today" : ""}${i >= 5 ? " weekend" : ""}`}>
              <div className="ibDayHead"><span>{DAYS[i]}</span><b>{d.slice(8, 10)}</b>{items.length > 0 && <small>{items.length}</small>}</div>
              <div className="ibDayItems">
                {items.length === 0 && <span className="ibFree">—</span>}
                {items.map((r) => (
                  <a key={r.id} href={report(r)} className={`ibEvent ${r.status}`} style={{ ["--c" as string]: color(r) }}>
                    <span className="t">{fmtTime(r.scheduled_at ?? r.done_at) || "—"}{r.duration_min ? <em> · {r.duration_min}′</em> : null}</span>
                    <b>{cap(r.type) || "Inspecție"}</b>
                    <small>{r.address ?? ""}</small>
                    {r.inspector && <span className="ibEvWho"><Avatar id={r.inspector_id ?? r.inspector} name={r.inspector} size={18} photo={r.photo} />{r.inspector.split(" ")[0]}</span>}
                  </a>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  const legend: [string, string][] = [["De programat", STATE.to_schedule[2]], ["Programată", STATE.scheduled[2]], ["Realizată", STATE.done[2]], ["Întârziată", LATE]];
  const map = (
    <div className="ibSplit">
      <div className="ibSide">
        {p.rows.map((r) => (
          <a key={r.id} href={report(r)} className={`ibCard${hover === r.id ? " hover" : ""}`} data-id={r.id}
            onMouseEnter={() => setHover(r.id)} onMouseLeave={() => setHover(null)} style={{ ["--c" as string]: color(r) }}>
            <span className="ibCardTop"><i />{r.late ? "Întârziată" : STATE[r.status]?.[0]}<span className="ibCardWhen">{r.scheduled_at ? `${fmtDay(r.scheduled_at)} ${fmtTime(r.scheduled_at)}` : r.due_on ? `termen ${fmtDay(r.due_on)}` : ""}</span></span>
            <b>{cap(r.type) || "Inspecție"}</b>
            <small>{r.address ?? "—"}</small>
            <span className="ibCardFoot">{who(r)}{r.lat == null && <span className="muted">fără localizare</span>}</span>
          </a>
        ))}
      </div>
      <div className="ibMap"><RegistryMap points={points} base={p.base} hover={hover} onPick={onPick} onHover={setHover} legend={legend} empty="Nicio inspecție cu localizare pentru filtrele alese." /></div>
    </div>
  );

  return (
    <section className="card">
      <form className="filterBar" onSubmit={(e) => { e.preventDefault(); go({ q: q.trim() || undefined }); }}>
        <span className="segment ibStates" role="group" aria-label="Stare">
          {p.states.map(([k, l]) => <a key={k || "active"} href={href({ stare: k || undefined })} aria-pressed={(c.stare ?? "") === k}>{l}</a>)}
        </span>
        <FilterSelect label="Inspector" value={c.inspector ?? ""} options={p.people.map((x) => [x.id, x.name, x.active])} onChange={(v) => go({ inspector: v || undefined })} all="Toți" />
        {view !== "calendar" && <FilterSelect label="Perioadă" value={c.perioada ?? ""} options={p.periods.filter(([k]) => k)} onChange={(v) => go({ perioada: v || undefined })} all="Oricând" />}
        <input className="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Caută adresă, localitate, nr. raport, contact… ↵" aria-label="Caută" />
      </form>
      <div className="resultLine">
        <span>{view === "calendar" ? <><b style={{ color: "var(--ink)" }}>{p.weekRows.length}</b> inspecții în săptămână</> : <><b style={{ color: "var(--ink)" }}>{p.rows.length}</b> inspecții{p.rows.length >= 300 ? " (primele 300)" : ""}</>}</span>
        <span className="segment rgViews" role="group" aria-label="Vizualizare">
          {([["lista", "Listă", "M4 6h16M4 12h16M4 18h16"], ["calendar", "Calendar", "M3 5h18v16H3zM3 10h18M8 3v4M16 3v4"], ["harta", "Hartă", "M9 4l-6 2v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14"]] as const).map(([k, l, d]) => (
            <a key={k} href={href({ vezi: k === "lista" ? undefined : k })} aria-pressed={view === k}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>{l}
            </a>
          ))}
        </span>
      </div>
      {view === "calendar" ? calendar : p.rows.length === 0 ? <div className="empty">Nicio inspecție pentru filtrele alese.</div> : view === "harta" ? map : list}
    </section>
  );
}

function weekOf(iso: string) { const d = new Date(`${iso}T12:00:00Z`); const w = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - w); return d.toISOString().slice(0, 10); }
