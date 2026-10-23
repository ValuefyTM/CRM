"use client";
// Home of the inspections app: the next visit, the day in numbers, what needs attention, and the inspector's list
// (or map). Inspections are created and assigned in the CRM; the phone only schedules and inspects them.

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Ctx } from "./InspApp";
import { dayKey, fmtDay, fmtTime, MONTHS, parseLocal, pad } from "./store";
import { groupFor } from "./ListView";
import { Icon, inRevision, mapsUrl, telUrl, type Local } from "./ui";
import { usePush } from "./PushCard";
import { LeafletMap, type MapPoint } from "./LeafletMap";
import type { SheetType } from "@/lib/insp-forms";

type Tab = "azi" | "urmeaza" | "deprogramat" | "finalizate";

const TYPE: Record<SheetType, [string, string]> = {
  apartament: ["APARTAMENT", "ap"], casa: ["CASĂ + TEREN", "casa"], teren: ["TEREN", "teren"], comercial: ["COMERCIAL", "com"], accesoriu: ["ACCESORIU", "acc"],
};
const WD = ["DUM", "LUN", "MAR", "MIE", "JOI", "VIN", "SÂM"];
const open = (i: Local) => `#/i/${encodeURIComponent(i.id)}`;
const isOpen = (i: Local) => inRevision(i) || i.status !== "done" && i.status !== "cancelled" && i.local !== "sending" && i.local !== "sent";

/** Status of a list row as short coloured text. */
function rowStatus(i: Local, today: string): [string, string] {
  if (inRevision(i)) return ["✎ Completări cerute", "err"];
  if (i.local === "sending") return ["↑ De trimis", "warn"];
  if (i.status === "done" || i.local === "sent") return ["✓ Finalizată", "ok"];
  if (i.status === "cancelled") return ["Anulată", "err"];
  if (i.draft) return ["◐ Fișă începută", "warn"];
  if (i.status === "to_schedule") return [i.due_on && i.due_on < today ? "○ Termen depășit" : "○ De programat", i.due_on && i.due_on < today ? "err" : "warn"];
  if (i.scheduled_at && i.scheduled_at.slice(0, 10) < today) return ["● Întârziată", "err"];
  return [i.contact_notified_at ? "● Programată" : "● Programată · contact neanunțat", i.contact_notified_at ? "ok" : "warn"];
}

function Row({ i, today }: { i: Local; today: string }) {
  const d = i.scheduled_at ? parseLocal(i.scheduled_at) : null;
  const k = d ? dayKey(d) : "";
  const tomorrow = dayKey(new Date(Date.now() + 864e5));
  const dayLabel = !d ? "—" : k === today ? "AZI" : k === tomorrow ? "MÂINE" : k < today ? `${pad(d.getDate())}.${pad(d.getMonth() + 1)}` : WD[d.getDay()];
  const [t, cls] = TYPE[i.sheet_type] ?? TYPE.apartament;
  const [st, stc] = rowStatus(i, today);
  return (
    <a href={open(i)} className="hRow">
      <span className={`hWhen${k === today ? " today" : ""}`}><small>{dayLabel}</small><b>{d ? fmtTime(i.scheduled_at) : "––:––"}</b></span>
      <span className="hRowMain">
        <span className="hRowTop"><span className={`hType ${cls}`}>{t}</span><span className={`hSt ${stc}`}>{st}</span></span>
        <b>{i.property_label}</b>
        <small>{[i.city ?? i.address, i.contact_name ?? i.client].filter(Boolean).join(" · ")}</small>
        {(i.hosted ?? []).length > 0 && <small className="hAcc">+ {(i.hosted ?? []).map((h) => h.label.toLowerCase()).join(", ")} · aceeași fișă</small>}
      </span>
    </a>
  );
}

export function HomeView({ ctx }: { ctx: Ctx }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 60_000); return () => clearInterval(t); }, []);
  const today = dayKey(now);
  const [view, setView] = useState<"list" | "map">(() => (typeof location !== "undefined" && location.hash.includes("harta") ? "map" : "list"));
  const [tab, setTab] = useState<Tab | null>(() => { try { return (sessionStorage.getItem("insp-tab") as Tab) || null; } catch { return null; } });
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  const push = usePush();

  // Accessories inspected on another property's sheet are shown with that property.
  const list = useMemo(() => ctx.list.filter((i) => !i.host_id || !ctx.list.some((x) => x.id === i.host_id)), [ctx.list]);
  const groups = useMemo(() => {
    const g: Record<Tab, Local[]> = { azi: [], urmeaza: [], deprogramat: [], finalizate: [] };
    for (const i of list) g[groupFor(i, today)].push(i);
    g.finalizate.sort((a, b) => (b.done_at ?? b.scheduled_at ?? "").localeCompare(a.done_at ?? a.scheduled_at ?? ""));
    g.deprogramat.sort((a, b) => (a.due_on ?? "9").localeCompare(b.due_on ?? "9"));
    return g;
  }, [list, today]);
  const cur: Tab = tab ?? (groups.azi.length ? "azi" : groups.urmeaza.length ? "urmeaza" : groups.deprogramat.length ? "deprogramat" : "azi");
  const pick = (t: Tab) => { setTab(t); setSel(null); try { sessionStorage.setItem("insp-tab", t); } catch { /* private mode */ } };

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    const l = groups[cur];
    return s ? l.filter((i) => `${i.address} ${i.property_label} ${i.report_number ?? ""} ${i.client ?? ""} ${i.contact_name ?? ""} ${i.cf_number ?? ""}`.toLowerCase().includes(s)) : l;
  }, [groups, cur, q]);

  // The next visit: the first scheduled from half an hour ago on (or a sheet started today).
  const next = useMemo(() => list
    .filter((i) => isOpen(i) && i.status === "scheduled" && i.scheduled_at && parseLocal(i.scheduled_at)!.getTime() >= now.getTime() - 90 * 60000)
    .sort((a, b) => a.scheduled_at!.localeCompare(b.scheduled_at!))[0], [list, now]);

  const weekEnd = dayKey(new Date(now.getTime() + 6 * 864e5));
  const month = today.slice(0, 7);
  const stats = [
    { n: list.filter((i) => isOpen(i) && i.scheduled_at?.slice(0, 10) === today).length, l: "azi" },
    { n: list.filter((i) => isOpen(i) && i.scheduled_at && i.scheduled_at.slice(0, 10) >= today && i.scheduled_at.slice(0, 10) <= weekEnd).length, l: "în 7 zile" },
    { n: ctx.pending.count, l: "de trimis", c: ctx.pending.count ? "err" : "" },
    { n: list.filter((i) => (i.status === "done" || i.local === "sent") && (i.done_at ?? i.scheduled_at ?? "").slice(0, 7) === month).length, l: `finalizate în ${MONTHS[now.getMonth()].slice(0, 3)}.`, c: "ok" },
  ];

  const alerts = useMemo(() => {
    const a: { t: string; d: string; cta: string; href: string; tone: string }[] = [];
    for (const i of list.filter(inRevision))
      a.push({ t: `Completări cerute · ${i.property_label}`, d: `${i.revision!.by ? `${i.revision!.by}: ` : ""}${i.revision!.note}`, cta: "Completează", href: open(i), tone: "err" });
    for (const i of list.filter((x) => x.draft && isOpen(x)).slice(0, 2))
      a.push({ t: `Fișă începută · ${i.property_label}`, d: i.address, cta: "Continuă", href: `${open(i)}/fisa`, tone: "acc" });
    if (ctx.pending.count) a.push({ t: `${ctx.pending.count} ${ctx.pending.count === 1 ? "element netrimis" : "elemente netrimise"}`, d: ctx.online ? "Se trimit acum" : "Se trimit automat când ai semnal", cta: "Vezi", href: "#/detrimis", tone: "err" });
    for (const i of list.filter((x) => isOpen(x) && x.status === "scheduled" && x.scheduled_at && x.scheduled_at.slice(0, 10) < today && !x.draft).slice(0, 2))
      a.push({ t: `Întârziată · ${i.property_label}`, d: `Programată ${fmtDay(parseLocal(i.scheduled_at!)!)} · fișa nu e trimisă`, cta: "Deschide", href: open(i), tone: "err" });
    for (const i of groups.deprogramat.filter((x) => x.status === "to_schedule" && !x.local).slice(0, 2))
      a.push({ t: `Neprogramată · ${i.address}`, d: [i.due_on && `Termen ${i.due_on.split("-").reverse().slice(0, 2).join(".")}`, i.contact_name && `Contact: ${i.contact_name}`].filter(Boolean).join(" · ") || i.property_label, cta: "Programează", href: `${open(i)}/programeaza`, tone: "mute" });
    return a.slice(0, 4);
  }, [list, groups, ctx.pending.count, ctx.online, today]);

  const points = useMemo<MapPoint[]>(() => shown.filter((i) => i.lat != null && i.lng != null).map((i) => ({
    id: i.id, lat: i.lat!, lng: i.lng!, label: i.property_label, sub: i.address,
    tone: i.status === "done" || i.local === "sent" ? "ok" : i.status === "to_schedule" ? "warn" : i.scheduled_at?.slice(0, 10) === today ? "acc" : "nav",
  })), [shown, today]);
  const onPick = useCallback((id: string) => setSel(id), []);
  const picked = shown.find((i) => i.id === sel);

  const first = ctx.me.name.split(/\s+/)[0];
  const initials = ctx.me.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const mins = next?.scheduled_at ? Math.round((parseLocal(next.scheduled_at)!.getTime() - now.getTime()) / 60000) : null;
  const eyebrow = mins === null ? "" : mins <= 0 ? "ACUM" : mins < 60 ? `URMĂTOAREA · ÎN ${mins} MIN` : next!.scheduled_at!.slice(0, 10) === today ? `URMĂTOAREA · AZI` : `URMĂTOAREA · ${fmtDay(parseLocal(next!.scheduled_at!)!).toUpperCase()}`;
  const tabs: [Tab, string][] = [["azi", "Azi"], ["urmeaza", "Următoare"], ["deprogramat", "Neprogramate"], ["finalizate", "Finalizate"]];

  return (
    <>
      <header className="hHead">
        <div className="hHello">
          <span><small>{fmtDay(now).replace(/^./, (c) => c.toUpperCase())}</small><b>Bună, {first}!</b></span>
          <span className="hHeadRight">
            <button type="button" className="hSync" onClick={() => ctx.sync()} aria-label="Sincronizează acum">
              <span className={`iDot${ctx.online ? "" : " off"}`} />{ctx.syncing ? "Se sincronizează" : ctx.online ? "Online" : "Offline"}
            </button>
            <a href="#/cont" className="hAvatar" aria-label="Contul meu">{initials}</a>
          </span>
        </div>
        {next ? (
          <div className="hNext">
            <a href={open(next)} className="hNextTop">
              <span className="hNextEyebrow"><small>{eyebrow}</small><span className={next.contact_notified_at ? "ok" : "err"}>{next.contact_notified_at ? "● Contact anunțat" : "○ Contact neanunțat"}</span></span>
              <span className="hNextMain">
                <span className="hNextTime"><b>{fmtTime(next.scheduled_at)}</b><small>{next.duration_min ?? 60} min</small></span>
                <span className="hNextText"><b>{next.property_label}</b><small>{[next.address, next.contact_name].filter(Boolean).join(" · ")}</small></span>
              </span>
            </a>
            <span className="hNextBtns">
              <a href={mapsUrl(next)} target="_blank" rel="noreferrer">Navighează</a>
              {next.contact_phone ? <a href={telUrl(next.contact_phone)}>Sună</a> : <a href={open(next)}>Detalii</a>}
              <a href={next.host_id ? `#/i/${encodeURIComponent(next.host_id)}/fisa` : `${open(next)}/fisa`} className="go">{next.draft ? "Continuă fișa" : "Începe fișa"}</a>
            </span>
          </div>
        ) : ctx.loaded ? (
          <div className="hNext empty"><b>Nicio inspecție programată.</b><small>{groups.deprogramat.length ? `Ai ${groups.deprogramat.length === 1 ? "o inspecție" : `${groups.deprogramat.length} inspecții`} de programat.` : "Inspecțiile noi îți sunt alocate din CRM."}</small></div>
        ) : null}
      </header>

      <div className="hStats">
        {stats.map((s) => <span key={s.l} className={s.c ?? ""}><b>{s.n}</b><small>{s.l}</small></span>)}
      </div>

      {push.state === "off" && (
        <div className="hBlock">
          <button type="button" className="hAlert hPush" onClick={push.enable}>
            <span className="hAlertDot acc" />
            <span className="hAlertText"><b>Activează notificările pe telefon</b><small>Afli imediat când evaluatorul îți cere completări la o fișă.</small></span>
            <span className="hAlertCta">Activează</span>
          </button>
        </div>
      )}
      {push.msg && push.state !== "on" && <p className="hint" style={{ margin: "0 16px" }}>{push.msg}</p>}

      {alerts.length > 0 && (
        <div className="hBlock">
          <small className="hEyebrow">NECESITĂ ATENȚIE</small>
          {alerts.map((a) => (
            <a key={a.t + a.href} href={a.href} className="hAlert">
              <span className={`hAlertDot ${a.tone}`} />
              <span className="hAlertText"><b>{a.t}</b><small>{a.d}</small></span>
              <span className="hAlertCta">{a.cta}</span>
            </a>
          ))}
        </div>
      )}

      <div className="hListHead">
        <b>Inspecțiile mele</b>
        <div className="hToggle" role="group" aria-label="Afișare">
          <button type="button" aria-pressed={view === "list"} onClick={() => setView("list")}>Listă</button>
          <button type="button" aria-pressed={view === "map"} onClick={() => { setView("map"); setSel(null); }}>Hartă</button>
        </div>
      </div>
      <div className="hFilters" role="group" aria-label="Filtru">
        {tabs.map(([k, l]) => (
          <button key={k} type="button" aria-pressed={cur === k} onClick={() => pick(k)}>{l}{groups[k].length ? ` · ${groups[k].length}` : ""}</button>
        ))}
      </div>

      {view === "list" ? (
        <div className="hList">
          {(groups[cur].length > 6 || q) && (
            <label className="iSearch">
              <Icon.search />
              <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Caută adresă, raport, client…" aria-label="Caută" />
            </label>
          )}
          {shown.map((i) => <Row key={i.id} i={i} today={today} />)}
          {ctx.loaded && !shown.length && <p className="iEmpty">{q ? "Nicio inspecție nu se potrivește căutării." : cur === "azi" ? "Nicio inspecție azi." : cur === "urmeaza" ? "Nicio inspecție programată în zilele următoare." : cur === "deprogramat" ? "Nu ai inspecții de programat." : "Nicio inspecție finalizată în ultimele 45 de zile."}</p>}
          {!ctx.loaded && <div className="iSkeleton" aria-hidden="true"><i /><i /><i /></div>}
        </div>
      ) : (
        <div className="hMap">
          <LeafletMap key={cur} points={points} selected={sel} onPick={onPick} height="100%" />
          {points.length < shown.length && <span className="hMapNote">{shown.length - points.length} fără coordonate</span>}
          {picked && (
            <a href={open(picked)} className="hMapCard">
              <span className="hWhen today"><small>{picked.scheduled_at ? fmtDay(parseLocal(picked.scheduled_at)!).slice(0, 3).toUpperCase() : "—"}</small><b>{fmtTime(picked.scheduled_at) || "––:––"}</b></span>
              <span className="hRowMain"><b>{picked.property_label}</b><small>{picked.address}</small></span>
              <span className="hAlertCta">Deschide →</span>
            </a>
          )}
        </div>
      )}
    </>
  );
}
