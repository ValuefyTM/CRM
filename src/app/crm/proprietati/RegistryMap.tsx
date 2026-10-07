"use client";
// Map of the valued properties: one dot per property, coloured by category (canvas, so thousands stay fast).
// Click a dot for its card; the dot of the row under the mouse is highlighted.
import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import type * as Leaflet from "leaflet";
import type { RegistryPoint } from "@/lib/registry";

import { CAT_COLOR, CAT_LABEL } from "@/lib/registry-labels";
const TILES = {
  map: { url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png", attr: "© OpenStreetMap", max: 19 },
  sat: { url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", attr: "© Esri", max: 19 },
};
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const cap = (s: string) => (s ? s.charAt(0) + s.slice(1).toLowerCase() : "");
const lei = (v: number) => `${Math.round(v).toLocaleString("ro-RO")} lei`;

export function RegistryMap({ points, base, hover, onPick, onHover, height = "100%" }: {
  points: RegistryPoint[]; base: string; hover?: string | null; onPick?: (id: string) => void; onHover?: (id: string | null) => void; height?: number | string;
}) {
  const hoverCb = useRef(onHover);
  hoverCb.current = onHover;
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<Leaflet.Map | null>(null);
  const L = useRef<typeof Leaflet | null>(null);
  const layer = useRef<Leaflet.LayerGroup | null>(null);
  const tiles = useRef<Leaflet.TileLayer | null>(null);
  const marks = useRef(new Map<string, Leaflet.CircleMarker>());
  const [ready, setReady] = useState(false);
  const [sat, setSat] = useState(false);

  useEffect(() => {
    let off = false;
    import("leaflet").then((mod) => {
      if (off || !el.current || map.current) return;
      const l = (mod.default ?? mod) as typeof Leaflet;
      L.current = l;
      const m = l.map(el.current, { preferCanvas: true, zoomControl: true, attributionControl: true });
      m.setView([45.7489, 21.2087], 11);
      layer.current = l.layerGroup().addTo(m);
      map.current = m;
      // The split view can be resized: the map follows the size of its box.
      const ro = new ResizeObserver(() => m.invalidateSize({ pan: false }));
      ro.observe(el.current);
      m.on("unload", () => ro.disconnect());
      setReady(true);
    });
    return () => { off = true; map.current?.remove(); map.current = null; };
  }, []);

  useEffect(() => {
    const l = L.current, m = map.current;
    if (!ready || !l || !m) return;
    tiles.current?.remove();
    const t = sat ? TILES.sat : TILES.map;
    tiles.current = l.tileLayer(t.url, { attribution: t.attr, maxZoom: t.max }).addTo(m);
  }, [ready, sat]);

  useEffect(() => {
    const l = L.current, m = map.current, g = layer.current;
    if (!ready || !l || !m || !g) return;
    g.clearLayers();
    marks.current.clear();
    const renderer = l.canvas({ padding: 0.5 });
    for (const p of points) {
      const c = l.circleMarker([p.lat, p.lng], { renderer, radius: 6, color: "#fff", weight: 1.5, fillColor: CAT_COLOR[p.cat] ?? "#7a7a7a", fillOpacity: 0.95 });
      c.bindPopup(
        `<div class="rgPop"><span class="rgPopCat" style="--c:${CAT_COLOR[p.cat] ?? "#7a7a7a"}">${esc(CAT_LABEL[p.cat] ?? "Proprietate")}</span>
          <b>${esc(cap(p.label))}</b><small>${esc(p.address)}</small>
          ${p.value ? `<span class="rgPopVal">${lei(p.value)}${p.date ? ` · ${esc(p.date.split("-").reverse().join("."))}` : ""}</span>` : ""}
          <a href="${base}/proprietati/${encodeURIComponent(p.id)}">Deschide fișa →</a></div>`,
        { closeButton: false, offset: [0, -4] },
      );
      // Short label on hover (the card opens on click).
      c.bindTooltip(`<b>${esc(cap(p.label))}</b>${p.value ? ` · ${lei(p.value)}` : ""}<br><small>${esc(p.address)}</small>`,
        { direction: "top", offset: [0, -8], className: "rgTip", opacity: 1 });
      c.on("mouseover", () => hoverCb.current?.(p.id));
      c.on("mouseout", () => hoverCb.current?.(null));
      if (onPick) c.on("click", () => onPick(p.id));
      c.addTo(g);
      marks.current.set(p.id, c);
    }
    if (points.length) m.fitBounds(l.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number])), { padding: [30, 30], maxZoom: 16 });
  }, [ready, points, base, onPick]);

  // The property under the mouse (in the list or on the map): its dot grows, comes to the front and shows its label;
  // the map follows it when it is outside the view.
  useEffect(() => {
    const c = hover ? marks.current.get(hover) : null;
    if (!c) return;
    c.setStyle({ radius: 11, weight: 3, color: "#111" }).bringToFront();
    const m = map.current;
    if (m && !m.getBounds().contains(c.getLatLng())) m.panTo(c.getLatLng(), { animate: true });
    if (!c.isPopupOpen()) c.openTooltip();
    return () => { c.setStyle({ radius: 6, weight: 1.5, color: "#fff" }); c.closeTooltip(); };
  }, [hover]);

  return (
    <div className="rgMap" style={{ height }}>
      <div ref={el} className="rgMapEl" />
      <div className="rgMapCtl">
        <button type="button" onClick={() => setSat(!sat)}>{sat ? "Hartă" : "Satelit"}</button>
      </div>
      <div className="rgLegend">
        {Object.entries(CAT_LABEL).map(([k, l]) => <span key={k}><i style={{ background: CAT_COLOR[k] }} />{l}</span>)}
      </div>
      {points.length === 0 && <div className="rgMapEmpty">Nicio proprietate cu localizare pentru filtrele alese.</div>}
    </div>
  );
}
