"use client";
// The big map of „Localizare” with the asset's points (geoportal UVALO, address, inspection GPS), each in its colour,
// the parcel's contour and its buildings, on a base layer chosen by the user: the map, the satellite or the terrain.
import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import type * as Leaflet from "leaflet";
import type { PinParcel } from "@/lib/asset-pins";

export type MapPin = { key: string; lat: number; lng: number; color: string; label: string };

const BASES = {
  harta: { label: "Hartă", url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png", attr: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>', max: 19 },
  satelit: { label: "Satelit", url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", attr: "&copy; Esri, Maxar, Earthstar Geographics", max: 19 },
  teren: { label: "Teren", url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}", attr: "&copy; Esri, HERE, Garmin, OpenStreetMap", max: 19 },
} as const;
type Base = keyof typeof BASES;
const BASE_KEY = "vf.pinsMap.base";

/** `focus`: the key of the pin to zoom to; null shows them all (and the parcel). */
export function PinsMap({ pins, focus, parcel, height }: { pins: MapPin[]; focus: string | null; parcel?: PinParcel | null; height: number | string }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<Leaflet.Map | null>(null);
  const L = useRef<typeof Leaflet | null>(null);
  const layer = useRef<Leaflet.LayerGroup | null>(null);
  const tiles = useRef<Leaflet.TileLayer | null>(null);
  const [base, setBase] = useState<Base>(() => {
    try { const b = localStorage.getItem(BASE_KEY); return b && b in BASES ? (b as Base) : "harta"; } catch { return "harta"; }
  });

  const setTiles = () => {
    const l = L.current, m = map.current;
    if (!l || !m) return;
    tiles.current?.remove();
    const b = BASES[base];
    tiles.current = l.tileLayer(b.url, { maxZoom: b.max, attribution: b.attr, referrerPolicy: "strict-origin-when-cross-origin" }).addTo(m);
    tiles.current.bringToBack();
  };

  const draw = () => {
    const l = L.current, m = map.current;
    if (!l || !m) return;
    layer.current?.remove();
    const g = l.layerGroup().addTo(m);
    layer.current = g;
    // the land: the parcel's contour, its buildings (white on the satellite, ink on the map)
    const sat = base === "satelit";
    if (parcel?.ring.length) {
      l.polygon(parcel.ring, { color: sat ? "#ffd84d" : "#d9480f", weight: 2.5, fillColor: sat ? "#ffd84d" : "#d9480f", fillOpacity: sat ? 0.12 : 0.1 })
        .bindTooltip(`Teren${parcel.nr ? ` nr. ${parcel.nr}` : ""}${parcel.area ? ` · ${Math.round(parcel.area).toLocaleString("ro-RO")} mp` : ""}`, { sticky: true }).addTo(g);
      for (const b of parcel.buildings) l.polygon(b, { color: sat ? "#fff" : "#444", weight: 1.5, fillColor: sat ? "#fff" : "#444", fillOpacity: 0.25 }).addTo(g);
    }
    // the focused pin on top
    for (const p of [...pins].sort((a, b) => Number(a.key === focus) - Number(b.key === focus))) {
      const on = !focus || p.key === focus;
      l.circleMarker([p.lat, p.lng], { radius: on ? 9 : 6, color: "#fff", weight: 2.5, fillColor: p.color, fillOpacity: on ? 1 : 0.55 })
        .bindTooltip(p.label, { permanent: on, direction: "top", offset: [0, -8], className: "pinTip" }).addTo(g);
    }
  };

  const frame = () => {
    const l = L.current, m = map.current;
    if (!l || !m) return;
    const f = pins.find((p) => p.key === focus);
    const all: [number, number][] = [...pins.map((p) => [p.lat, p.lng] as [number, number]), ...(parcel?.ring ?? [])];
    if (f) m.setView([f.lat, f.lng], 18);
    else if (all.length === 1) m.setView(all[0], 17);
    else if (all.length) m.fitBounds(l.latLngBounds(all), { padding: [60, 60], maxZoom: 18 });
  };

  useEffect(() => {
    let off = false;
    import("leaflet").then((mod) => {
      if (off || !el.current || map.current) return;
      const l = (mod as unknown as { default?: typeof Leaflet }).default ?? (mod as unknown as typeof Leaflet);
      L.current = l;
      const m = l.map(el.current, { zoomControl: false, attributionControl: true, scrollWheelZoom: true });
      l.control.zoom({ position: "bottomright" }).addTo(m);
      m.setView([45.7489, 21.2087], 11);
      map.current = m;
      setTiles(); draw(); frame();
    });
    return () => { off = true; map.current?.remove(); map.current = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setTiles(); draw(); try { localStorage.setItem(BASE_KEY, base); } catch { /* private mode */ } }, [base]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { draw(); frame(); }, [JSON.stringify(pins), focus, parcel]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="pinsMapWrap">
      <div ref={el} className="miniMap" style={{ height }} />
      <div className="pinBases" role="group" aria-label="Fundalul hărții">
        {(Object.keys(BASES) as Base[]).map((k) => <button key={k} type="button" aria-pressed={base === k} onClick={() => setBase(k)}>{BASES[k].label}</button>)}
      </div>
    </div>
  );
}
