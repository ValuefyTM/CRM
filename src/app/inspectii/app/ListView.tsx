"use client";

import { useEffect, useMemo, useState } from "react";
import type { Ctx } from "./InspApp";
import { dayKey, fmtDay, fmtTime, pad, parseLocal } from "./store";
import { Icon, Pill, type Local } from "./ui";
import { sheetTypeLabel } from "@/lib/insp-forms";

type Tab = "azi" | "urmeaza" | "deprogramat" | "finalizate";

const ROLE: Record<string, string> = { inspector: "inspector", evaluator: "evaluator" };

export function groupFor(i: Local, today: string): Tab {
  if (i.status === "done" || i.local === "sent" || i.local === "sending" || i.status === "cancelled") return "finalizate";
  if (i.status !== "scheduled" || !i.scheduled_at) return "deprogramat";
  return i.scheduled_at.slice(0, 10) <= today ? "azi" : "urmeaza";
}

export function InspCard({ i, onOpen, now }: { i: Local; onOpen: () => void; now?: Date }) {
  const when = i.scheduled_at ? parseLocal(i.scheduled_at) : null;
  const mins = when && now ? Math.round((when.getTime() - now.getTime()) / 60000) : null;
  const soon = mins !== null && mins >= -30 && mins <= 120 && i.status === "scheduled" && !i.local;
  const late = when && now && i.status === "scheduled" && !i.local && dayKey(when) < dayKey(now);
  return (
    <button type="button" className={`iCard${soon ? " soon" : ""}`} onClick={onOpen}>
      <div className="iCardHead">
        <span className="iTime">{when ? (late ? `${pad(when.getDate())}.${pad(when.getMonth() + 1)} ${fmtTime(i.scheduled_at)}` : fmtTime(i.scheduled_at)) : "—"}</span>
        {soon ? <span className="iPill acc">{mins! > 0 ? `Urmează · ${mins} min` : "Acum"}</span> : late ? <span className="iPill err">Întârziată</span> : <Pill i={i} />}
      </div>
      <div className="iCardMain">
        <b>{i.property_label}</b>
        <span>{i.address}</span>
      </div>
      <div className="iTags">
        {i.report_number && <span className="iTag">Raport {i.report_number}{i.bank ? ` · ${i.bank}` : ""}</span>}
        {i.purpose && <span className="iTag">{i.purpose}</span>}
        <span className="iTag">Fișă {sheetTypeLabel(i.sheet_type).toLowerCase()}</span>
        {i.local === "scheduled_offline" && <span className="iTag warn">Programare netrimisă</span>}
      </div>
    </button>
  );
}

export function ListView({ ctx }: { ctx: Ctx }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 60_000); return () => clearInterval(t); }, []);
  const today = dayKey(now);
  const [tab, setTab] = useState<Tab>(() => {
    try { return (sessionStorage.getItem("insp-tab") as Tab) || "azi"; } catch { return "azi"; }
  });
  const [q, setQ] = useState("");
  useEffect(() => { try { sessionStorage.setItem("insp-tab", tab); } catch { /* private mode */ } }, [tab]);

  const groups = useMemo(() => {
    const g: Record<Tab, Local[]> = { azi: [], urmeaza: [], deprogramat: [], finalizate: [] };
    for (const i of ctx.list) g[groupFor(i, today)].push(i);
    g.finalizate.sort((a, b) => (b.done_at ?? b.scheduled_at ?? "").localeCompare(a.done_at ?? a.scheduled_at ?? ""));
    return g;
  }, [ctx.list, today]);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    const l = groups[tab];
    return s ? l.filter((i) => `${i.address} ${i.property_label} ${i.report_number ?? ""} ${i.client ?? ""} ${i.contact_name ?? ""} ${i.cf_number ?? ""}`.toLowerCase().includes(s)) : l;
  }, [groups, tab, q]);

  const todayCount = groups.azi.filter((i) => i.scheduled_at?.slice(0, 10) === today).length;
  const lateCount = groups.azi.length - todayCount;
  const first = ctx.me.name.split(/\s+/)[0];
  const title = !ctx.loaded ? "Se încarcă inspecțiile…"
    : todayCount ? `Azi ai ${todayCount === 1 ? "o inspecție" : `${todayCount} inspecții`}.`
    : groups.urmeaza.length ? `Bună, ${first}! Azi nu ai inspecții.` : `Bună, ${first}!`;

  const tabs: [Tab, string][] = [["azi", "Azi"], ["urmeaza", "Următoare"], ["deprogramat", "De programat"], ["finalizate", "Finalizate"]];
  const empty: Record<Tab, string> = {
    azi: "Nicio inspecție azi. Vezi „Următoare” sau programează una din „De programat”.",
    urmeaza: "Nicio inspecție programată în zilele următoare.",
    deprogramat: "Nu ai inspecții de programat.",
    finalizate: "Nicio inspecție finalizată în ultimele 45 de zile.",
  };

  return (
    <>
      <header className="iHero">
        <div className="iHeroTop">
          <div className="iBrand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon-insp-192.png" alt="" />
            <div>
              <span className="inspEyebrow">VALUEFY INSPECȚII</span>
              <span className="iMe">{ctx.me.name} · {ROLE[ctx.me.role] ?? ctx.me.role}</span>
            </div>
          </div>
          <details className="iMenu">
            <summary aria-label="Meniu">
              <span className={`iDot${ctx.online ? "" : " off"}`} />{ctx.syncing ? "Se sincronizează" : ctx.online ? "Online" : "Offline"}
            </summary>
            <div>
              <button type="button" onClick={() => ctx.sync()}><Icon.refresh />Sincronizează acum</button>
              <button type="button" onClick={() => ctx.logout()}>Ieși din cont</button>
            </div>
          </details>
        </div>
        <h1>{title}</h1>
        {lateCount > 0 && tab === "azi" && <p className="iHeroNote">{lateCount === 1 ? "O inspecție din zilele trecute nu are fișa trimisă." : `${lateCount} inspecții din zilele trecute nu au fișa trimisă.`}</p>}
        <div className="iTabs" role="tablist">
          {tabs.map(([k, label]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>
              {label} · {groups[k].length}
            </button>
          ))}
        </div>
      </header>

      <div className="iPad">
        {ctx.pending.count > 0 && (
          <a href="#/detrimis" className="iBanner">
            <span className="iBannerN">{ctx.pending.count}</span>
            <span>{ctx.online ? "Date care încă nu au ajuns la server." : "Date care așteaptă semnal ca să se trimită."}</span>
            <b>Vezi →</b>
          </a>
        )}
        {(groups[tab].length > 6 || q) && (
          <label className="iSearch">
            <Icon.search />
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Caută adresă, raport, client…" aria-label="Caută" />
          </label>
        )}
        {shown.map((i, n) => {
          const d = i.scheduled_at?.slice(0, 10);
          const prev = shown[n - 1]?.scheduled_at?.slice(0, 10);
          const showDay = tab === "urmeaza" && d && d !== prev;
          return (
            <div key={i.id} className="iStack">
              {showDay && <h2 className="iDay">{fmtDay(parseLocal(d)!)}</h2>}
              <InspCard i={i} now={now} onOpen={() => ctx.go(`#/i/${encodeURIComponent(i.id)}`)} />
            </div>
          );
        })}
        {ctx.loaded && !shown.length && <p className="iEmpty">{q ? "Nicio inspecție nu se potrivește căutării." : empty[tab]}</p>}
        {!ctx.loaded && <div className="iSkeleton" aria-hidden="true"><i /><i /><i /></div>}
      </div>
    </>
  );
}
