"use client";

import { useEffect, useRef, useState } from "react";
import type * as Leaflet from "leaflet";
import { Icon } from "./ui";

export type MapPoint = { id: string; lat: number; lng: number; tone: "acc" | "nav" | "ok" | "warn"; label: string; sub?: string };

const TONE = { acc: "#f2a93b", nav: "#111111", ok: "#1fa971", warn: "#e0931a" };
const TILES = {
  map: { url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png", attr: "© OpenStreetMap", max: 19 },
  sat: { url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", attr: "© Esri", max: 19 },
};

const pinIcon = (L: typeof Leaflet, tone: MapPoint["tone"], big: boolean) =>
  L.divIcon({
    className: "iPinWrap",
    html: `<svg width="${big ? 34 : 28}" height="${big ? 44 : 36}" viewBox="0 0 28 36" aria-hidden="true"><path d="M14 35s12-11 12-21A12 12 0 0 0 2 14c0 10 12 21 12 21z" fill="${TONE[tone]}" stroke="#fff" stroke-width="2"/><circle cx="14" cy="14" r="4.5" fill="#fff"/></svg>`,
    iconSize: big ? [34, 44] : [28, 36],
    iconAnchor: big ? [17, 43] : [14, 35],
  });

/** OpenStreetMap / satellite map with the inspections as pins. Without signal the tiles may be missing; the pins stay. */
export function LeafletMap({ points, selected, onPick, height, zoom = 15, interactive = true }: {
  points: MapPoint[]; selected?: string | null; onPick?: (id: string) => void; height: number | string; zoom?: number; interactive?: boolean;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<Leaflet.Map | null>(null);
  const L = useRef<typeof Leaflet | null>(null);
  const layer = useRef<Leaflet.LayerGroup | null>(null);
  const tiles = useRef<Leaflet.TileLayer | null>(null);
  const me = useRef<Leaflet.CircleMarker | null>(null);
  const [ready, setReady] = useState(false);
  const [base, setBase] = useState<"map" | "sat">("map");
  const [locating, setLocating] = useState(false);
  const fitted = useRef(false);

  useEffect(() => {
    let off = false;
    import("leaflet").then((mod) => {
      if (off || !el.current || map.current) return;
      const l = (mod.default ?? mod) as typeof Leaflet;
      L.current = l;
      const m = l.map(el.current, { zoomControl: interactive, attributionControl: true, dragging: interactive, scrollWheelZoom: interactive, touchZoom: interactive, doubleClickZoom: interactive, tap: interactive } as Leaflet.MapOptions);
      m.setView([45.7489, 21.2087], 11); // Timișoara until the pins are placed
      layer.current = l.layerGroup().addTo(m);
      map.current = m;
      setReady(true);
    });
    return () => { off = true; map.current?.remove(); map.current = null; };
  }, [interactive]);

  useEffect(() => {
    const l = L.current, m = map.current;
    if (!ready || !l || !m) return;
    tiles.current?.remove();
    const t = TILES[base];
    tiles.current = l.tileLayer(t.url, { attribution: t.attr, maxZoom: t.max}).addTo(m);
  }, [ready, base]);

  useEffect(() => {
    const l = L.current, m = map.current, g = layer.current;
    if (!ready || !l || !m || !g) return;
    g.clearLayers();
    for (const p of points) {
      const mk = l.marker([p.lat, p.lng], { icon: pinIcon(l, p.tone, p.id === selected), title: p.label, keyboard: true, zIndexOffset: p.id === selected ? 1000 : 0 });
      if (onPick) mk.on("click", () => onPick(p.id));
      mk.addTo(g);
    }
    if (!fitted.current && points.length) {
      fitted.current = true;
      if (points.length === 1) m.setView([points[0].lat, points[0].lng], zoom);
      else m.fitBounds(l.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number])), { padding: [36, 36], maxZoom: 15 });
    }
  }, [ready, points, selected, onPick, zoom]);

  useEffect(() => {
    const m = map.current;
    const p = points.find((x) => x.id === selected);
    if (ready && m && p && points.length > 1) m.panTo([p.lat, p.lng]);
  }, [ready, selected, points]);

  const locate = () => {
    const l = L.current, m = map.current;
    if (!l || !m || !navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const ll: [number, number] = [pos.coords.latitude, pos.coords.longitude];
        me.current?.remove();
        me.current = l.circleMarker(ll, { radius: 8, color: "#fff", weight: 3, fillColor: "#111111", fillOpacity: 1 }).addTo(m);
        m.setView(ll, Math.max(m.getZoom(), 14));
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  };

  return (
    <div className="iMap" style={{ height }}>
      <div ref={el} className="iMapEl" />
      {interactive && (
        <div className="iMapCtl">
          <button type="button" onClick={() => setBase(base === "map" ? "sat" : "map")}>{base === "map" ? "Satelit" : "Hartă"}</button>
          <button type="button" onClick={locate} aria-label="Locația mea" disabled={locating}><Icon.locate /></button>
        </div>
      )}
    </div>
  );
}
