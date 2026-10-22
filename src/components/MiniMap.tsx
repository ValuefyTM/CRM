"use client";
// A small map with one point (the asset being filled in): green from the geoportal plans, blue from the address,
// amber when only the locality is known.
import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import type * as Leaflet from "leaflet";

export type MiniPoint = { lat: number; lng: number; source: "cadastru" | "adresa" | "localitate" };
const COLOR: Record<MiniPoint["source"], string> = { cadastru: "#1fa971", adresa: "#3b6fd8", localitate: "#e0931a" };

/** `zoom`: the mouse wheel zooms (the big map); `height` may be a CSS length ("70vh"). */
export function MiniMap({ point, height = 220, zoom = false }: { point: MiniPoint | null; height?: number | string; zoom?: boolean }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<Leaflet.Map | null>(null);
  const L = useRef<typeof Leaflet | null>(null);
  const mark = useRef<Leaflet.CircleMarker | null>(null);
  const halo = useRef<Leaflet.Circle | null>(null);

  useEffect(() => {
    let off = false;
    import("leaflet").then((mod) => {
      if (off || !el.current || map.current) return;
      const l = (mod as unknown as { default?: typeof Leaflet }).default ?? (mod as unknown as typeof Leaflet);
      L.current = l;
      const m = l.map(el.current, { zoomControl: false, attributionControl: true, scrollWheelZoom: zoom });
      // OpenStreetMap asks for the attribution and a referrer (the page must not send "no-referrer")
      l.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>', referrerPolicy: "strict-origin-when-cross-origin" }).addTo(m);
      l.control.zoom({ position: "bottomright" }).addTo(m);
      m.setView([45.7489, 21.2087], 11);
      map.current = m;
      draw();
    });
    return () => { off = true; map.current?.remove(); map.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const draw = () => {
    const l = L.current, m = map.current;
    if (!l || !m) return;
    mark.current?.remove(); halo.current?.remove();
    if (!point) return;
    const c = COLOR[point.source];
    if (point.source !== "cadastru") halo.current = l.circle([point.lat, point.lng], { radius: point.source === "localitate" ? 1500 : 60, color: c, weight: 1, fillColor: c, fillOpacity: 0.12 }).addTo(m);
    mark.current = l.circleMarker([point.lat, point.lng], { radius: 8, color: "#fff", weight: 2.5, fillColor: c, fillOpacity: 1 }).addTo(m);
    m.setView([point.lat, point.lng], point.source === "localitate" ? 13 : 17);
  };
  useEffect(draw, [point?.lat, point?.lng, point?.source]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={el} className="miniMap" style={{ height }} />;
}
