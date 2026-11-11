"use client";
// The map of prices: the valuations of the last 12 months as a cloud over Timișoara — each valuation spread as a soft
// spot (a Gaussian of `spread` metres), the colour at each place the weighted average €/m² of the valuations around it
// (green, the cheapest → red, the most expensive), its strength how many there are (where there are none, the cloud fades out). By type of
// property. A click lists the valuations around that place; the dots show each one; the table holds every value.
import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useRef, useState } from "react";
import type * as Leaflet from "leaflet";
import type { PricePoint, PriceType } from "@/lib/price-map";

// green (the cheapest) → yellow → red (the most expensive), as asked; the dots and the table carry the numbers
const RAMP = ["#1a9850", "#66bd63", "#c2e478", "#fee08b", "#f88d52", "#d73027"];
const RGB = RAMP.map((h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)));
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
const metres = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const r = Math.PI / 180, x = (b.lng - a.lng) * r * Math.cos(((a.lat + b.lat) / 2) * r), y = (b.lat - a.lat) * r;
  return Math.sqrt(x * x + y * y) * 6371000;
};

export function PriceMap({ points, types, base }: { points: PricePoint[]; types: { k: PriceType; label: string; n: number }[]; base: string }) {
  const [type, setType] = useState<PriceType | "">(types[0]?.k ?? "");
  const [zone, setZone] = useState<"oras" | "metro">("oras");
  const [spread, setSpread] = useState(500);
  const [dots, setDots] = useState(false);
  const [bg, setBg] = useState<keyof typeof BASES>("harta");
  const [around, setAround] = useState<{ lat: number; lng: number } | null>(null);

  const shown = useMemo(() => points.filter((p) => (!type || p.type === type) && (zone === "metro" || p.inCity)), [points, type, zone]);
  // the colour scale: the selection's prices from the 5th to the 95th percentile, light → dark (the extremes do not wash it out)
  const scale = useMemo(() => {
    const v = shown.map((p) => p.sqm);
    if (!v.length) return null;
    const lo = q(v, 0.05), hi = q(v, 0.95);
    return { lo, hi: hi > lo ? hi : lo + 1 };
  }, [shown]);
  const stats = useMemo(() => {
    const v = shown.map((p) => p.sqm);
    return v.length ? { n: v.length, med: median(v), p25: q(v, 0.25), p75: q(v, 0.75) } : null;
  }, [shown]);

  // ---------- the map ----------
  const el = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const map = useRef<Leaflet.Map | null>(null);
  const L = useRef<typeof Leaflet | null>(null);
  const layer = useRef<Leaflet.LayerGroup | null>(null);
  const tiles = useRef<Leaflet.TileLayer | null>(null);
  const [ready, setReady] = useState(false);
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);
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

  // the cloud: drawn on a canvas over the map, again whenever the map moves or zooms
  useEffect(() => {
    const m = map.current, c = cv.current;
    if (!ready || !m || !c || !scale) { if (c) c.getContext("2d")?.clearRect(0, 0, c.width, c.height); return; }
    let frame = 0;
    const draw = () => {
      frame = 0;
      const size = m.getSize(), W = size.x, H = size.y;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (c.width !== W * dpr || c.height !== H * dpr) { c.width = W * dpr; c.height = H * dpr; c.style.width = `${W}px`; c.style.height = `${H}px`; }
      const g = c.getContext("2d")!;
      g.clearRect(0, 0, c.width, c.height);
      // metres per pixel here, and the spread in pixels
      const mpp = (40075016.686 * Math.cos((m.getCenter().lat * Math.PI) / 180)) / 2 ** (m.getZoom() + 8);
      const sig = spread / mpp;
      // a coarse grid (the browser smooths it when it is stretched): a cell of about a sixth of the spread, 3–24 px
      const step = Math.max(3, Math.min(24, sig / 5));
      const gw = Math.ceil(W / step) + 1, gh = Math.ceil(H / step) + 1;
      const num = new Float32Array(gw * gh), den = new Float32Array(gw * gh);
      const reach = sig * 3, inv = 1 / (2 * sig * sig);
      for (const p of shown) {
        const pt = m.latLngToContainerPoint([p.lat, p.lng]);
        if (pt.x < -reach || pt.y < -reach || pt.x > W + reach || pt.y > H + reach) continue;
        const x0 = Math.max(0, Math.floor((pt.x - reach) / step)), x1 = Math.min(gw - 1, Math.ceil((pt.x + reach) / step));
        const y0 = Math.max(0, Math.floor((pt.y - reach) / step)), y1 = Math.min(gh - 1, Math.ceil((pt.y + reach) / step));
        for (let y = y0; y <= y1; y++) {
          const dy = y * step - pt.y;
          for (let x = x0; x <= x1; x++) {
            const dx = x * step - pt.x;
            const k = Math.exp(-(dx * dx + dy * dy) * inv);
            if (k < 0.01) continue;
            const i = y * gw + x;
            num[i] += k * p.sqm; den[i] += k;
          }
        }
      }
      const img = new ImageData(gw, gh);
      for (let i = 0; i < gw * gh; i++) {
        const d = den[i];
        if (d < 0.02) continue;
        const v = num[i] / d;
        // the colour along the ramp, between its stops
        const t = Math.max(0, Math.min(1, (v - scale.lo) / (scale.hi - scale.lo))) * (RGB.length - 1);
        const a = Math.floor(t), b = Math.min(RGB.length - 1, a + 1), f = t - a;
        const o = i * 4;
        for (let ch = 0; ch < 3; ch++) img.data[o + ch] = RGB[a][ch] + (RGB[b][ch] - RGB[a][ch]) * f;
        // strong where there are several valuations around, faint where there is one, gone where there are none
        img.data[o + 3] = Math.round(Math.min(1, d / 1.6) ** 0.75 * 205);
      }
      const small = document.createElement("canvas");
      small.width = gw; small.height = gh;
      small.getContext("2d")!.putImageData(img, 0, 0);
      g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high";
      g.drawImage(small, 0, 0, gw * step * dpr, gh * step * dpr);
    };
    const later = () => { if (!frame) frame = requestAnimationFrame(draw); };
    draw();
    m.on("move zoom resize viewreset", later);
    return () => { m.off("move zoom resize viewreset", later); if (frame) cancelAnimationFrame(frame); };
  }, [ready, shown, spread, scale]);

  // the dots, and the place clicked (a ring of the spread around it)
  useEffect(() => {
    const l = L.current, m = map.current;
    if (!ready || !l || !m) return;
    layer.current?.remove();
    const g = l.layerGroup().addTo(m);
    layer.current = g;
    if (around) l.circle([around.lat, around.lng], { radius: spread, color: "#141414", weight: 2, dashArray: "5 5", fill: false, interactive: false }).addTo(g);
    if (dots) for (const p of shown) {
      l.circleMarker([p.lat, p.lng], { radius: 5, color: "#fff", weight: 1.5, fillColor: "#141414", fillOpacity: 0.85 })
        .bindPopup(`<b>${eur(p.sqm)}/m²</b> · ${eur(p.eur)}<br>${esc(p.typeLabel)} · ${p.area.toLocaleString("ro-RO")} m²<br><small>${esc(p.address)}</small><br><a href="${base}/rapoarte/${p.report}">Raport ${esc(p.number ?? "")} · ${day(p.date)} →</a>`)
        .addTo(g);
    }
  }, [dots, around, ready, shown, base, spread]);

  // hover: the estimate at the pointer and how many valuations are around; click: list them
  const near = (ll: { lat: number; lng: number }) => shown.filter((p) => metres(ll, p) <= spread * 1.5);
  useEffect(() => {
    const m = map.current;
    if (!ready || !m) return;
    const move = (e: Leaflet.LeafletMouseEvent) => {
      let n = 0, d = 0;
      for (const p of shown) { const r = metres(e.latlng, p); const k = Math.exp(-(r * r) / (2 * spread * spread)); if (k > 0.01) { n += k * p.sqm; d += k; } }
      const cnt = near(e.latlng).length;
      setTip(d < 0.02 ? null : { x: e.containerPoint.x, y: e.containerPoint.y, text: `~${eur(n / d)}/m² · ${cnt} ${cnt === 1 ? "evaluare" : "evaluări"} în ${(spread * 1.5).toLocaleString("ro-RO")} m` });
    };
    const out = () => setTip(null);
    const click = (e: Leaflet.LeafletMouseEvent) => { if ((e.originalEvent.target as HTMLElement).closest?.(".leaflet-marker-icon, .leaflet-popup, path.leaflet-interactive")) return; setAround(near(e.latlng).length ? { lat: e.latlng.lat, lng: e.latlng.lng } : null); };
    m.on("mousemove", move); m.on("mouseout", out); m.on("click", click);
    return () => { m.off("mousemove", move); m.off("mouseout", out); m.off("click", click); };
  }, [ready, shown, spread]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (ready) map.current?.setView(CENTRE, zone === "oras" ? 13 : 11); }, [zone, ready]);
  useEffect(() => { setAround(null); }, [type, zone]);

  const listed = (around ? near(around) : shown).slice().sort((a, b) => b.date.localeCompare(a.date));
  const label = types.find((t) => t.k === type)?.label ?? "Toate proprietățile";
  const legendAt = (f: number) => (scale ? eur(scale.lo + (scale.hi - scale.lo) * f) : "");

  return (
    <div className="pxWrap">
      <div className="pxFilters">
        <label className="field pxField"><span className="fLabel">Tip de proprietate</span>
          <select className="select" value={type} onChange={(e) => setType(e.target.value as PriceType | "")}>
            {types.map((t) => <option key={t.k} value={t.k}>{t.label} ({t.n})</option>)}
            <option value="">Toate tipurile ({points.length}) — nu se compară între ele</option>
          </select>
        </label>
        <div className="segment" role="group" aria-label="Zona">
          <button type="button" aria-pressed={zone === "oras"} onClick={() => setZone("oras")}>Municipiul Timișoara</button>
          <button type="button" aria-pressed={zone === "metro"} onClick={() => setZone("metro")}>+ zona metropolitană (15 km)</button>
        </div>
        <div className="segment" role="group" aria-label="Cât de mult se întinde fiecare evaluare">
          {[[300, "Detaliat"], [500, "Mediu"], [800, "Neted"]].map(([s, l]) => <button key={s} type="button" aria-pressed={spread === s} title={`fiecare evaluare acoperă ~${s} m`} onClick={() => setSpread(s as number)}>{l}</button>)}
        </div>
        <label className="check pxCheck"><input type="checkbox" checked={dots} onChange={(e) => setDots(e.target.checked)} /><span>Arată fiecare evaluare</span></label>
      </div>

      <div className="pxTiles">
        <div className="pxTile"><small>Evaluări cu preț</small><b>{stats?.n ?? 0}</b><span>{label.toLowerCase()} · rapoarte finalizate, ultimele 12 luni</span></div>
        <div className="pxTile"><small>Mediana</small><b>{stats ? `${eur(stats.med)}/m²` : "—"}</b><span>{zone === "oras" ? "în Timișoara" : "Timișoara și împrejurimi"}</span></div>
        <div className="pxTile"><small>Jumătate din valori între</small><b>{stats ? `${eur(stats.p25)} – ${eur(stats.p75)}` : "—"}</b><span>pe m² (quartila 1 – 3)</span></div>
      </div>

      <section className="card flush pxCard">
        <div className="pxMapBox">
          <div ref={el} className="pxMap" role="img" aria-label={`Harta prețurilor: ${label}, €/m², ca nor peste Timișoara`} />
          <canvas ref={cv} className="pxCloud" aria-hidden="true" />
          {tip && <div className="pxTip" style={{ left: tip.x + 14, top: tip.y + 14 }}>{tip.text}</div>}
          <div className="pinBases" role="group" aria-label="Fundalul hărții">
            {(Object.keys(BASES) as (keyof typeof BASES)[]).map((k) => <button key={k} type="button" aria-pressed={bg === k} onClick={() => setBg(k)}>{BASES[k].label}</button>)}
          </div>
          {scale && (
            <div className="pxLegend" aria-label="Legenda: €/m²">
              <b>€ / m²</b>
              <i className="pxGrad" style={{ background: `linear-gradient(90deg, ${RAMP.join(", ")})` }} />
              <span className="pxGradLbl"><span>{legendAt(0)}</span><span>{legendAt(0.5)}</span><span>{legendAt(1)}</span></span>
              <small>nor intens = multe evaluări · estompat = puține</small>
            </div>
          )}
          {!shown.length && <div className="pxEmpty">Nicio evaluare cu preț pentru selecția aleasă în ultimele 12 luni.</div>}
        </div>
      </section>

      <section className="card pxList">
        <div className="cardHead">
          <h2>{around ? `Evaluările din jurul punctului ales · ${listed.length}` : `Toate evaluările · ${listed.length}`}</h2>
          {around ? <button type="button" className="linkBtn" onClick={() => setAround(null)}>arată toate</button> : <small className="muted">click pe hartă: evaluările din jur</small>}
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
