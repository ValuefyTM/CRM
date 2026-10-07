"use client";
// Comparables: the map (property being valued, search radius, comparables) next to the table; hover links them.
import { useCallback, useMemo, useState } from "react";
import type { Comparable } from "@/lib/comparables";
import { RegistryMap, type MapPoint } from "../../RegistryMap";

const cap = (s: string | null) => (s ? s.charAt(0) + s.slice(1).toLowerCase() : "");
const n0 = (v: number | null | undefined) => (v == null ? "—" : Math.round(v).toLocaleString("ro-RO"));
const dist = (k: number) => (k < 1 ? `${Math.round(k * 1000)} m` : `${k.toFixed(1).replace(".", ",")} km`);
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function CompView({ rows, subject, base, median, p25, p75 }: {
  rows: Comparable[]; subject: { lat: number; lng: number; radiusKm: number; label: string }; base: string; median: number | null; p25: number | null; p75: number | null;
}) {
  const [hover, setHover] = useState<string | null>(null);
  // Colour by value per m² against the median: below the 25th percentile, inside the middle half, above the 75th.
  const tone = (s: number | null) => (s == null || median == null ? "#7a7a7a" : p25 != null && s < p25 ? "#1fa971" : p75 != null && s > p75 ? "#b3261e" : "#e9a227");
  const points = useMemo<MapPoint[]>(() => rows.map((r) => ({
    id: r.id, lat: r.lat, lng: r.lng, cat: r.category ?? "", label: r.type ?? "", address: r.full_address ?? "", value: r.value, date: r.last_date, color: tone(r.sqm),
    tip: `<b>${esc(cap(r.type))}</b> · ${n0(r.sqm)} lei/m²<br><small>${esc(r.full_address ?? "")} · ${dist(r.km)}</small>`,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  })), [rows]);
  const subj = useMemo(() => subject, [subject.lat, subject.lng, subject.radiusKm, subject.label]); // eslint-disable-line react-hooks/exhaustive-deps
  const onPick = useCallback((id: string) => setHover(id), []);
  const maxSqm = Math.max(1, ...rows.map((r) => r.sqm ?? 0));

  return (
    <div className="cpSplit">
      <div className="cpMap">
        <RegistryMap points={points} base={base} hover={hover} onHover={setHover} onPick={onPick} subject={subj}
          legend={[["Sub P25", "#1fa971"], ["Între P25 și P75", "#e9a227"], ["Peste P75", "#b3261e"], ["Proprietatea evaluată", "#111111"]]} />
      </div>
      <div className="cpTableBox">
        <table className="table cpTable">
          <thead><tr><th>Distanță</th><th>Proprietate</th><th className="r">Supr.</th><th>Evaluare</th><th className="r">Valoare</th><th>Lei / m²</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={hover === r.id ? "hl" : ""} onMouseEnter={() => setHover(r.id)} onMouseLeave={() => setHover(null)}>
                <td className="mono">{dist(r.km)}</td>
                <td className="cpProp">
                  <a href={`${base}/proprietati/${r.id}`}><b>{cap(r.type) || "Proprietate"}</b></a>
                  <small>{r.full_address ?? r.city ?? "—"}{r.year_built ? ` · ${r.year_built}` : ""}</small>
                </td>
                <td className="r">{r.usable_area ? `${r.usable_area.toLocaleString("ro-RO")} m²` : "—"}</td>
                <td>{r.report_id ? <a className="ref" href={`${base}/rapoarte/${r.report_id}`}>{r.report_number ?? "raport"}</a> : null}<small className="block muted">{r.last_date?.split("-").reverse().join(".")}</small></td>
                <td className="r mono">{n0(r.value)}</td>
                <td className="cpSqm">
                  <span className="cpBar"><i style={{ width: `${((r.sqm ?? 0) / maxSqm) * 100}%`, background: tone(r.sqm) }} />{median != null && <em style={{ left: `${(median / maxSqm) * 100}%` }} title="mediana" />}</span>
                  <b className="mono">{n0(r.sqm)}</b>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
