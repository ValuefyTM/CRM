"use client";
// The map of prices: the valuations of the last 12 months in a grid of cells over Timișoara, each cell coloured by the
// median €/m² of its valuations (one hue, light → dark, in six classes by the selection's own quantiles), by type of
// property. A click on a cell lists its valuations; the dots show each one. The table under the map holds every value.
import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useRef, useState } from "react";
import type * as Leaflet from "leaflet";
import type { PricePoint, PriceType } from "@/lib/price-map";

// the sequential ramp (one hue, light → dark), six classes
const RAMP = ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#104281"];
const CENTRE: [number, number] = [45.7537, 21.2257];
const BASES = {
  harta: { label: "Hartă", url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png", attr: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' },
  satelit: { label: "Satelit", url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", attr: "&copy; Esri" },
} as const;
const eur = (n: number) => `${Math.round(n).toLocaleString("ro-RO")} €`;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const q = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); const i = (s.length - 1) * p; const lo = Math.floor(i); return s[lo] + (s[Math.ceil(i)] - s[lo]) * (i - lo); };
const day = (d: string) => d.split("-").reverse().join(".");

type Cell = { key: string; s: number; w: number; n: number; e: number; med: number; lo: number; hi: number; pts: PricePoint[] };

export function PriceMap({ points, types, base }: { points: PricePoint[]; types: { k: PriceType; label: string; n: number }[]; base: string }) {
  const [type, setType] = useState<PriceType | "">(types[0]?.k ?? "");
  const [zone, setZone] = useState<"oras" | "metro">("oras");
  const [size, setSize] = useState(500);
  const [dots, setDots] = useState(false);
  const [bg, setBg] = useState<keyof typeof BASES>("harta");
  const [cellOn, setCellOn] = useState<string | null>(null);

  const shown = useMemo(() => points.filter((p) => (!type || p.type === type) && (zone === "metro" || p.inCity)), [points, type, zone]);
  // the grid: cells of `size` metres, south-west corner at a fixed origin (the same cells whatever the filter)
  const cells = useMemo(() => {
    const dLat = size / 111320, dLng = size / (111320 * Math.cos((CENTRE[0] * Math.PI) / 180));
    const m = new Map<string, PricePoint[]>();
    for (const p of shown) { const k = `${Math.floor((p.lat - 45) / dLat)}:${Math.floor((p.lng - 21) / dLng)}`; m.set(k, [...(m.get(k) ?? []), p]); }
    return [...m.entries()].map(([key, pts]): Cell => {
      const [i, j] = key.split(":").map(Number); const v = pts.map((p) => p.sqm);
      return { key, s: 45 + i * dLat, w: 21 + j * dLng, n: dLat, e: dLng, med: median(v), lo: Math.min(...v), hi: Math.max(...v), pts };
    });
  }, [shown, size]);
  // six classes by the quantiles of the selection's prices (each class about as many valuations)
  const breaks = useMemo(() => {
    const v = shown.map((p) => p.sqm);
    if (v.length < 2) return [] as number[];
    return [1, 2, 3, 4, 5].map((i) => Math.round(q(v, i / 6)));
  }, [shown]);
  const classOf = (x: number) => breaks.filter((b) => x >= b).length;
  const stats = useMemo(() => {
    const v = shown.map((p) => p.sqm);
    return v.length ? { n: v.length, med: median(v), p25: q(v, 0.25), p75: q(v, 0.75) } : null;
  }, [shown]);

  // ---------- the map ----------
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<Leaflet.Map | null>(null);
  const L = useRef<typeof Leaflet | null>(null);
  const layer = useRef<Leaflet.LayerGroup | null>(null);
  const tiles = useRef<Leaflet.TileLayer | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let off = false;
    import("leaflet").then((mod) => {
      if (off || !el.current || map.current) return;
      const l = (mod as unknown as { default?: typeof Leaflet }).default ?? (mod as unknown as typeof Leaflet);
      L.current = l;
      const m = l.map(el.current, { zoomControl: false, scrollWheelZoom: true });
      l.control.zoom({ position: "bottomright" }).addTo(m);
      m.setView(CENTRE, 13);
      map.current = m;
      setReady(true);
    });
    return () => { off = true; map.current?.remove(); map.current = null; };
  }, []);
  useEffect(() => {
    const l = L.current, m = map.current;
    if (!ready || !l || !m) return;
    tiles.current?.remove();
    tiles.current = l.tileLayer(BASES[bg].url, { maxZoom: 19, attribution: BASES[bg].attr, referrerPolicy: "strict-origin-when-cross-origin" }).addTo(m);
    tiles.current.bringToBack();
  }, [bg, ready]);
  useEffect(() => {
    const l = L.current, m = map.current;
    if (!ready || !l || !m) return;
    layer.current?.remove();
    const g = l.layerGroup().addTo(m);
    layer.current = g;
    for (const c of cells) {
      const k = classOf(c.med), on = c.key === cellOn;
      l.rectangle([[c.s, c.w], [c.s + c.n, c.w + c.e]], { color: on ? "#141414" : "#fff", weight: on ? 2.5 : 1, fillColor: RAMP[k], fillOpacity: dots ? 0.45 : c.pts.length === 1 ? 0.55 : 0.78 })
        .bindTooltip(`<b>${eur(c.med)}/m²</b> mediană<br>${c.pts.length} ${c.pts.length === 1 ? "evaluare" : "evaluări"}${c.pts.length > 1 ? ` · ${eur(c.lo)}–${eur(c.hi)}` : ""}`, { sticky: true })
        .on("click", () => setCellOn((x) => (x === c.key ? null : c.key)))
        .addTo(g);
    }
    if (dots) for (const p of shown) {
      l.circleMarker([p.lat, p.lng], { radius: 5, color: "#fff", weight: 1.5, fillColor: "#141414", fillOpacity: 0.85 })
        .bindPopup(`<b>${eur(p.sqm)}/m²</b> · ${eur(p.eur)}<br>${esc(p.typeLabel)} · ${p.area.toLocaleString("ro-RO")} m²<br><small>${esc(p.address)}</small><br><a href="${base}/rapoarte/${p.report}">Raport ${esc(p.number ?? "")} · ${day(p.date)} →</a>`)
        .addTo(g);
    }
  }, [cells, breaks, dots, cellOn, ready, shown, base]); // eslint-disable-line react-hooks/exhaustive-deps
  // the view follows the zone
  useEffect(() => { if (ready) map.current?.setView(CENTRE, zone === "oras" ? 13 : 11); }, [zone, ready]);
  useEffect(() => { setCellOn(null); }, [type, zone, size]);

  const listed = (cellOn ? cells.find((c) => c.key === cellOn)?.pts ?? [] : shown).slice().sort((a, b) => b.date.localeCompare(a.date));
  const label = types.find((t) => t.k === type)?.label ?? "Toate proprietățile";

  return (
    <div className="pmWrap">
      <div className="pmFilters">
        <label className="field pmField"><span className="fLabel">Tip de proprietate</span>
          <select className="select" value={type} onChange={(e) => setType(e.target.value as PriceType | "")}>
            {types.map((t) => <option key={t.k} value={t.k}>{t.label} ({t.n})</option>)}
            <option value="">Toate tipurile ({points.length}) — nu se compară între ele</option>
          </select>
        </label>
        <div className="segment" role="group" aria-label="Zona">
          <button type="button" aria-pressed={zone === "oras"} onClick={() => setZone("oras")}>Municipiul Timișoara</button>
          <button type="button" aria-pressed={zone === "metro"} onClick={() => setZone("metro")}>+ zona metropolitană (15 km)</button>
        </div>
        <div className="segment" role="group" aria-label="Mărimea celulei">
          {[300, 500, 800].map((s) => <button key={s} type="button" aria-pressed={size === s} onClick={() => setSize(s)}>{s} m</button>)}
        </div>
        <label className="check pmCheck"><input type="checkbox" checked={dots} onChange={(e) => setDots(e.target.checked)} /><span>Arată fiecare evaluare</span></label>
      </div>

      <div className="pmTiles">
        <div className="pmTile"><small>Evaluări cu preț</small><b>{stats?.n ?? 0}</b><span>{label.toLowerCase()} · rapoarte finalizate, ultimele 12 luni</span></div>
        <div className="pmTile"><small>Mediana</small><b>{stats ? `${eur(stats.med)}/m²` : "—"}</b><span>{zone === "oras" ? "în Timișoara" : "Timișoara și împrejurimi"}</span></div>
        <div className="pmTile"><small>Jumătate din valori între</small><b>{stats ? `${eur(stats.p25)} – ${eur(stats.p75)}` : "—"}</b><span>pe m² (quartila 1 – 3)</span></div>
      </div>

      <section className="card flush pmCard">
        <div className="pmMapBox">
          <div ref={el} className="pmMap" role="img" aria-label={`Harta prețurilor: ${label}, mediana €/m² pe celule de ${size} m`} />
          <div className="pinBases" role="group" aria-label="Fundalul hărții">
            {(Object.keys(BASES) as (keyof typeof BASES)[]).map((k) => <button key={k} type="button" aria-pressed={bg === k} onClick={() => setBg(k)}>{BASES[k].label}</button>)}
          </div>
          {breaks.length > 0 && (
            <div className="pmLegend" aria-label="Legenda: mediana €/m² pe celulă">
              <b>Mediana €/m² pe celulă</b>
              <ul>
                {RAMP.map((c, i) => (
                  <li key={c}><i style={{ background: c }} /><span>{i === 0 ? `sub ${eur(breaks[0])}` : i === RAMP.length - 1 ? `peste ${eur(breaks[i - 1])}` : `${eur(breaks[i - 1])} – ${eur(breaks[i])}`}</span></li>
                ))}
              </ul>
              <small>celulă palidă = o singură evaluare</small>
            </div>
          )}
          {!shown.length && <div className="pmEmpty">Nicio evaluare cu preț pentru selecția aleasă în ultimele 12 luni.</div>}
        </div>
      </section>

      <section className="card pmList">
        <div className="cardHead">
          <h2>{cellOn ? `Evaluările din celula aleasă · ${listed.length}` : `Toate evaluările · ${listed.length}`}</h2>
          {cellOn && <button type="button" className="linkBtn" onClick={() => setCellOn(null)}>arată toate</button>}
        </div>
        <div className="tableWrap">
          <table className="table">
            <thead><tr><th>Data</th><th>Proprietate</th><th>Adresă</th><th className="num">Suprafață</th><th className="num">Valoare</th><th className="num">€ / m²</th><th>Raport</th></tr></thead>
            <tbody>
              {listed.slice(0, 300).map((p) => (
                <tr key={p.id}>
                  <td className="nowrap">{day(p.date)}</td><td>{p.typeLabel}</td><td>{p.address}</td>
                  <td className="num">{p.area.toLocaleString("ro-RO")} m²</td><td className="num mono">{eur(p.eur)}</td><td className="num mono"><b>{eur(p.sqm)}</b></td>
                  <td><a className="link" href={`${base}/rapoarte/${p.report}`}>{p.number ? `nr. ${p.number}` : "deschide"}</a></td>
                </tr>
              ))}
            </tbody>
          </table>
          {listed.length > 300 && <p className="hint pad">Se arată cele mai recente 300.</p>}
        </div>
      </section>
    </div>
  );
}
