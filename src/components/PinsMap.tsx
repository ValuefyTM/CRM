"use client";
// The big map of „Localizare” with the asset's points (geoportal UVALO, address, inspection GPS), each in its colour.
import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import type * as Leaflet from "leaflet";

export type MapPin = { key: string; lat: number; lng: number; color: string; label: string };

/** `focus`: the key of the pin to zoom to; null shows them all. */
export function PinsMap({ pins, focus, height }: { pins: MapPin[]; focus: string | null; height: number | string }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<Leaflet.Map | null>(null);
  const L = useRef<typeof Leaflet | null>(null);
  const layer = useRef<Leaflet.LayerGroup | null>(null);

  const draw = () => {
    const l = L.current, m = map.current;
    if (!l || !m) return;
    layer.current?.remove();
    const g = l.layerGroup().addTo(m);
    layer.current = g;
    // the focused one on top
    for (const p of [...pins].sort((a, b) => Number(a.key === focus) - Number(b.key === focus))) {
      const on = !focus || p.key === focus;
      l.circleMarker([p.lat, p.lng], { radius: on ? 9 : 6, color: "#fff", weight: 2.5, fillColor: p.color, fillOpacity: on ? 1 : 0.55 })
        .bindTooltip(p.label, { permanent: on, direction: "top", offset: [0, -8], className: "pinTip" }).addTo(g);
    }
    const f = pins.find((p) => p.key === focus);
    if (f) m.setView([f.lat, f.lng], 18);
    else if (pins.length === 1) m.setView([pins[0].lat, pins[0].lng], 17);
    else if (pins.length) m.fitBounds(l.latLngBounds(pins.map((p) => [p.lat, p.lng] as [number, number])), { padding: [60, 60], maxZoom: 18 });
  };

  useEffect(() => {
    let off = false;
    import("leaflet").then((mod) => {
      if (off || !el.current || map.current) return;
      const l = (mod as unknown as { default?: typeof Leaflet }).default ?? (mod as unknown as typeof Leaflet);
      L.current = l;
      const m = l.map(el.current, { zoomControl: false, attributionControl: true, scrollWheelZoom: true });
      l.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>', referrerPolicy: "strict-origin-when-cross-origin" }).addTo(m);
      l.control.zoom({ position: "bottomright" }).addTo(m);
      m.setView([45.7489, 21.2087], 11);
      map.current = m;
      draw();
    });
    return () => { off = true; map.current?.remove(); map.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(draw, [JSON.stringify(pins), focus]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={el} className="miniMap" style={{ height }} />;
}
