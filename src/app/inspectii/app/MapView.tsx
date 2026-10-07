"use client";

import { useCallback, useMemo, useState } from "react";
import type { Ctx } from "./InspApp";
import { dayKey, fmtWhen } from "./store";
import { mapsUrl, Pill, TopBar } from "./ui";
import { LeafletMap, type MapPoint } from "./LeafletMap";

type Filter = "active" | "today" | "toschedule" | "all";

export function MapView({ ctx }: { ctx: Ctx }) {
  const [filter, setFilter] = useState<Filter>("active");
  const [sel, setSel] = useState<string | null>(null);
  const today = dayKey(new Date());

  const items = useMemo(() => ctx.list.filter((i) => {
    const open = i.status !== "done" && i.status !== "cancelled" && i.local !== "sending" && i.local !== "sent";
    if (filter === "today") return open && i.status === "scheduled" && i.scheduled_at?.slice(0, 10) === today;
    if (filter === "toschedule") return open && i.status === "to_schedule";
    if (filter === "active") return open;
    return true;
  }), [ctx.list, filter, today]);

  const points = useMemo<MapPoint[]>(() => items.filter((i) => i.lat != null && i.lng != null).map((i) => ({
    id: i.id, lat: i.lat!, lng: i.lng!, label: i.property_label, sub: i.address,
    tone: i.status === "done" || i.local === "sent" ? "ok" : i.status === "to_schedule" ? "warn" : i.scheduled_at?.slice(0, 10) === today ? "acc" : "nav",
  })), [items, today]);
  const missing = items.length - points.length;
  const pick = useCallback((id: string) => setSel(id), []);
  const cur = items.find((i) => i.id === sel);

  const filters: [Filter, string][] = [["active", "Active"], ["today", "Azi"], ["toschedule", "De programat"], ["all", "Toate"]];
  return (
    <>
      <TopBar title="Hartă" sub={`${points.length} ${points.length === 1 ? "inspecție" : "inspecții"} pe hartă${missing ? ` · ${missing} fără coordonate` : ""}`} />
      <div className="iMapPage">
        <div className="iChips iMapFilters" role="group" aria-label="Filtru">
          {filters.map(([k, l]) => (
            <button key={k} type="button" className={`iChip${filter === k ? " on" : ""}`} aria-pressed={filter === k} onClick={() => { setFilter(k); setSel(null); }}>{l}</button>
          ))}
        </div>
        <LeafletMap key={filter} points={points} selected={sel} onPick={pick} height="100%" />
        <div className="iLegend"><i className="acc" />Azi <i className="nav" />Programate <i className="warn" />De programat <i className="ok" />Finalizate</div>
        {cur && (
          <div className="iMapCard">
            <div className="iCardHead"><span className="iTime small">{fmtWhen(cur.scheduled_at)}</span><Pill i={cur} /></div>
            <b>{cur.property_label}</b>
            <span className="muted">{cur.address}</span>
            <div className="iRow2">
              <a className="iBtn ghost" href={mapsUrl(cur)} target="_blank" rel="noreferrer">Navighează</a>
              <button type="button" className="iBtn" onClick={() => ctx.go(`#/i/${encodeURIComponent(cur.id)}`)}>Deschide</button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
