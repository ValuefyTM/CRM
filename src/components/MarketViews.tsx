"use client";
// Market listings (Anunțuri de piață): the photo gallery with a full-screen viewer, the map with a point, its precision
// and price pins around it, the description that unfolds. Used by the listing page and the report's similar listings.
import "leaflet/dist/leaflet.css";
import { useCallback, useEffect, useRef, useState } from "react";
import type * as Leaflet from "leaflet";

export type GalleryPhoto = { src: string; original: string; saved: boolean };

/** Main photo with arrows and counter, a strip of thumbnails; a click opens the full-screen viewer (← → Esc, swipe). */
export function Gallery({ photos, title }: { photos: GalleryPhoto[]; title: string }) {
  const [i, setI] = useState(0);
  const [open, setOpen] = useState(false);
  const strip = useRef<HTMLDivElement>(null);
  const touch = useRef<number | null>(null);
  const n = photos.length;
  const go = useCallback((d: number) => setI((x) => (x + d + n) % n), [n]);

  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === "ArrowRight") go(1); else if (e.key === "ArrowLeft") go(-1); else if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", k);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", k); document.body.style.overflow = ""; };
  }, [open, go]);
  // keep the current thumbnail in view
  useEffect(() => { strip.current?.querySelector<HTMLElement>(`[data-i="${i}"]`)?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" }); }, [i]);

  if (!n) return (
    <div className="ldGallery ldEmpty"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="8.5" cy="10" r="1.5" /><path d="m21 16-5-5-8 8" /></svg>
      <span>Fără imagini salvate pentru acest anunț</span></div>
  );
  const swipe = { onTouchStart: (e: React.TouchEvent) => { touch.current = e.touches[0].clientX; },
    onTouchEnd: (e: React.TouchEvent) => { if (touch.current == null) return; const d = e.changedTouches[0].clientX - touch.current; if (Math.abs(d) > 40) go(d < 0 ? 1 : -1); touch.current = null; } };
  const p = photos[i];
  return (
    <div className="ldGallery">
      <div className="ldMain" {...swipe}>
        <div className="ldBlur" style={{ backgroundImage: `url("${p.src}")` }} aria-hidden="true" />
        <img src={p.src} alt={`${title} – imaginea ${i + 1}`} onClick={() => setOpen(true)} referrerPolicy={p.saved ? undefined : "no-referrer"} />
        {n > 1 && <>
          <button type="button" className="ldArrow l" aria-label="Imaginea anterioară" onClick={() => go(-1)}>‹</button>
          <button type="button" className="ldArrow r" aria-label="Imaginea următoare" onClick={() => go(1)}>›</button>
        </>}
        <span className="ldCount">{i + 1} / {n}</span>
        <button type="button" className="ldZoom" onClick={() => setOpen(true)} aria-label="Ecran complet">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg>
        </button>
      </div>
      {n > 1 && (
        <div className="ldThumbs" ref={strip}>
          {photos.map((x, k) => (
            <button type="button" key={k} data-i={k} className={k === i ? "on" : ""} onClick={() => setI(k)} aria-label={`Imaginea ${k + 1}`}>
              <img src={x.src} alt="" loading="lazy" referrerPolicy={x.saved ? undefined : "no-referrer"} />
            </button>
          ))}
        </div>
      )}
      {open && (
        <div className="ldBox" role="dialog" aria-modal="true" aria-label="Galerie" onClick={() => setOpen(false)} {...swipe}>
          <img src={p.src} alt="" onClick={(e) => e.stopPropagation()} referrerPolicy={p.saved ? undefined : "no-referrer"} />
          <button type="button" className="ldBoxClose" aria-label="Închide" onClick={() => setOpen(false)}>✕</button>
          {n > 1 && <>
            <button type="button" className="ldArrow l big" aria-label="Imaginea anterioară" onClick={(e) => { e.stopPropagation(); go(-1); }}>‹</button>
            <button type="button" className="ldArrow r big" aria-label="Imaginea următoare" onClick={(e) => { e.stopPropagation(); go(1); }}>›</button>
          </>}
          <span className="ldCount big">{i + 1} / {n}{!p.saved && " · imagine de pe site (nesalvată)"}</span>
        </div>
      )}
    </div>
  );
}

export type MapPin = { id: string; lat: number; lng: number; label: string; tip: string; href?: string; inactive?: boolean };

/** The listing on the map (its precision circle when approximate), the 500 m and 1 km rings around it and the similar
 * listings nearby as price pins; hovering a card of the list lights its pin. */
export function ListingMap({ lat, lng, radiusM, label, pins = [], hover = null, onPick, rings = [500, 1000], className = "" }: { lat: number; lng: number; radiusM: number | null; label: string; pins?: MapPin[];
  hover?: string | null; onPick?: (id: string) => void; rings?: number[]; className?: string }) {
  const pick = useRef(onPick);
  pick.current = onPick;
  const el = useRef<HTMLDivElement>(null);
  const marks = useRef<Map<string, Leaflet.Marker>>(new Map());
  useEffect(() => {
    let off = false, map: Leaflet.Map | null = null;
    import("leaflet").then((mod) => {
      if (off || !el.current) return;
      const l = (mod as unknown as { default?: typeof Leaflet }).default ?? (mod as unknown as typeof Leaflet);
      map = l.map(el.current, { zoomControl: false, scrollWheelZoom: false });
      l.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>', referrerPolicy: "strict-origin-when-cross-origin" }).addTo(map);
      l.control.zoom({ position: "bottomright" }).addTo(map);
      // the bounds from the centre and radius (a circle's own getBounds needs a map that already has a view)
      const centre = l.latLng(lat, lng);
      const bounds = l.latLngBounds([centre, centre]);
      const ring = (r: number) => { l.circle(centre, { radius: r, color: "#9a5f00", weight: 1.5, dashArray: "6 6", fill: false, opacity: 0.7 }).addTo(map!); bounds.extend(centre.toBounds(r * 2)); };
      if (pins.length) rings.forEach(ring);
      if (radiusM) { l.circle(centre, { radius: radiusM, color: "#f2a93b", weight: 0, fillColor: "#f2a93b", fillOpacity: 0.16 }).addTo(map); bounds.extend(centre.toBounds(radiusM * 2)); }
      for (const p of pins) {
        const m = l.marker([p.lat, p.lng], { icon: l.divIcon({ className: "", html: `<span class="ldPin${p.inactive ? " off" : ""}">${p.label}</span>`, iconSize: [0, 0] }) })
          .addTo(map).bindTooltip(p.tip, { direction: "top", offset: [0, -12] }).on("click", () => { if (pick.current) pick.current(p.id); else if (p.href) window.location.href = p.href; });
        marks.current.set(p.id, m);
        bounds.extend([p.lat, p.lng]);
      }
      l.marker([lat, lng], { icon: l.divIcon({ className: "", html: `<span class="ldPin me">${label}</span>`, iconSize: [0, 0] }), zIndexOffset: 1000 }).addTo(map);
      if (pins.length || radiusM) map.fitBounds(bounds, { padding: [30, 30], maxZoom: 16 }); else map.setView([lat, lng], 16);
    });
    return () => { off = true; marks.current.clear(); map?.remove(); };
  }, [lat, lng, radiusM, label, pins, rings.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    marks.current.forEach((m, id) => { const e = m.getElement()?.querySelector(".ldPin"); e?.classList.toggle("hl", id === hover); if (id === hover) m.setZIndexOffset(900); else m.setZIndexOffset(0); });
  }, [hover]);
  return <div ref={el} className={`ldMap ${className}`} />;
}

export type NearCard = { id: string; href: string; photo: string | null; head: string; title: string; specs: string; price: string; sqm: string; tag: string | null; tone: "ok" | "err" | "" };

/** „Piața din jur”: the map with the similar listings and their cards side by side (UVALO's comparables view). */
export function MarketAround({ lat, lng, radiusM, label, pins, cards }: { lat: number; lng: number; radiusM: number | null; label: string; pins: MapPin[]; cards: NearCard[] }) {
  const [hover, setHover] = useState<string | null>(null);
  return (
    <div className="ldAround">
      <div className="ldAroundList">
        {cards.map((c) => (
          <a key={c.id} href={c.href} className={`ldNear${hover === c.id ? " hl" : ""}`} onMouseEnter={() => setHover(c.id)} onMouseLeave={() => setHover(null)}>
            {c.photo ? <img src={c.photo} alt="" loading="lazy" /> : <span className="ldNearNo">FOTO</span>}
            <span className="ldNearBody">
              <span className="ldNearTop"><span><small>{c.head}</small><b>{c.title}</b><em>{c.specs}</em></span>
                <span className="ldNearPrice"><b>{c.price}</b><em>{c.sqm}</em></span></span>
              {c.tag && <span className={`ldNearTag ${c.tone}`}>{c.tag}</span>}
            </span>
          </a>
        ))}
      </div>
      <div className="ldAroundMap"><ListingMap lat={lat} lng={lng} radiusM={radiusM} label={label} pins={pins} hover={hover} /></div>
    </div>
  );
}

/** The description: the first lines, „Citește tot” for the rest. */
export function Description({ text }: { text: string }) {
  const long = text.length > 700 || text.split("\n").length > 10;
  const [all, setAll] = useState(!long);
  return (
    <div>
      <div className={`ldDesc${all ? "" : " cut"}`}>{text}</div>
      {long && <button type="button" className="ldMore" onClick={() => setAll(!all)}>{all ? "Arată mai puțin" : "Citește tot"}</button>}
    </div>
  );
}

export type ExplorerPoint = { id: string; lat: number; lng: number; label: string; tip: string; inactive?: boolean };

// the price cloud: green (the cheapest) → yellow → red (the most expensive), as on Hartă prețuri
export const CLOUD_RAMP = ["#1a9850", "#66bd63", "#c2e478", "#fee08b", "#f88d52", "#d73027"];
const CLOUD_RGB = CLOUD_RAMP.map((h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)));
export type CloudPoint = { lat: number; lng: number; v: number };
export type CloudScale = { lo: number; hi: number };
const quant = (s: number[], p: number) => { const i = (s.length - 1) * p, lo = Math.floor(i); return s[lo] + (s[Math.ceil(i)] - s[lo]) * (i - lo); };
/** the colour scale: from the 5th to the 95th percentile (the extremes do not wash it out) */
export function cloudScale(values: number[]): CloudScale | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b), lo = quant(s, 0.05), hi = quant(s, 0.95);
  return { lo, hi: hi > lo ? hi : lo + 1 };
}

/** All the filtered listings as price pins; the map fits them; hovering / picking talks to the list. With `cloud`, the
 * €/m² of the listings spread as a cloud under the pins (each one a soft spot of `spread` metres; the colour the
 * weighted average around each place, its strength how many listings there are). */
export function MarketMap({ points, hover = null, onPick, onHover, cloud = null, spread = 500 }: { points: ExplorerPoint[]; hover?: string | null; onPick?: (id: string) => void;
  onHover?: (id: string | null) => void; cloud?: { points: CloudPoint[]; scale: CloudScale } | null; spread?: number }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<Leaflet.Map | null>(null);
  const L = useRef<typeof Leaflet | null>(null);
  const layer = useRef<Leaflet.LayerGroup | null>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const marks = useRef<Map<string, Leaflet.Marker>>(new Map());
  const [ready, setReady] = useState(false);
  const clouded = !!cloud?.points.length;
  const prevCloud = useRef(clouded);
  const cb = useRef({ onPick, onHover });
  cb.current = { onPick, onHover };
  useEffect(() => {
    let off = false;
    import("leaflet").then((mod) => {
      if (off || !el.current || map.current) return;
      const l = (mod as unknown as { default?: typeof Leaflet }).default ?? (mod as unknown as typeof Leaflet);
      L.current = l;
      const m = l.map(el.current, { zoomControl: false });
      l.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>', referrerPolicy: "strict-origin-when-cross-origin" }).addTo(m);
      l.control.zoom({ position: "bottomright" }).addTo(m);
      m.setView([45.7489, 21.2087], 11);
      // the cloud's own pane: over the map, under the pins (markers: 600)
      const pane = m.createPane("cloud");
      pane.style.zIndex = "450"; pane.style.pointerEvents = "none";
      const c = l.DomUtil.create("canvas", "mkCloud", pane) as HTMLCanvasElement;
      canvas.current = c;
      layer.current = l.layerGroup().addTo(m);
      map.current = m;
      setReady(true);
    });
    const re = () => map.current?.invalidateSize();
    window.addEventListener("resize", re);
    return () => { off = true; window.removeEventListener("resize", re); map.current?.remove(); map.current = null; };
  }, []);

  useEffect(() => {
    const l = L.current, m = map.current, g = layer.current;
    if (!ready || !l || !m || !g) return;
    g.clearLayers(); marks.current.clear();
    for (const p of points) {
      // with the cloud on, the price tags give way to small dots (the listing still opens from the map)
      const html = clouded ? `<span class="ldPin dot${p.inactive ? " off" : ""}"></span>` : `<span class="ldPin${p.inactive ? " off" : ""}">${p.label}</span>`;
      const mk = l.marker([p.lat, p.lng], { icon: l.divIcon({ className: "", html, iconSize: [0, 0] }) })
        .bindTooltip(p.tip, { direction: "top", offset: [0, clouded ? -6 : -12] })
        .on("click", () => cb.current.onPick?.(p.id)).on("mouseover", () => cb.current.onHover?.(p.id)).on("mouseout", () => cb.current.onHover?.(null));
      mk.addTo(g); marks.current.set(p.id, mk);
    }
    // new points: the map fits them; the cloud turned on or off: the view stays where it is
    const toggled = prevCloud.current !== clouded;
    prevCloud.current = clouded;
    if (points.length && !toggled) m.fitBounds(l.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number])), { padding: [30, 30], maxZoom: 15 });
  }, [points, ready, clouded]);
  useEffect(() => {
    marks.current.forEach((m, id) => { m.getElement()?.querySelector(".ldPin")?.classList.toggle("hl", id === hover); m.setZIndexOffset(id === hover ? 900 : 0); });
  }, [hover]);

  // the cloud: drawn on the pane's canvas (in the map's layer coordinates) after every move or zoom
  useEffect(() => {
    const l = L.current, m = map.current, c = canvas.current;
    if (!ready || !l || !m || !c) return;
    if (!cloud || !cloud.points.length) { c.style.display = "none"; return; }
    c.style.display = "";
    const draw = () => {
      const size = m.getSize(), W = size.x, H = size.y;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (c.width !== W * dpr || c.height !== H * dpr) { c.width = W * dpr; c.height = H * dpr; c.style.width = `${W}px`; c.style.height = `${H}px`; }
      l.DomUtil.setPosition(c, m.containerPointToLayerPoint([0, 0]));
      c.style.visibility = "";
      const g = c.getContext("2d")!;
      g.clearRect(0, 0, c.width, c.height);
      const mpp = (40075016.686 * Math.cos((m.getCenter().lat * Math.PI) / 180)) / 2 ** (m.getZoom() + 8);
      const sig = spread / mpp, step = Math.max(3, Math.min(24, sig / 5));
      const gw = Math.ceil(W / step) + 1, gh = Math.ceil(H / step) + 1;
      const num = new Float32Array(gw * gh), den = new Float32Array(gw * gh);
      const reach = sig * 3, inv = 1 / (2 * sig * sig);
      for (const p of cloud.points) {
        const pt = m.latLngToContainerPoint([p.lat, p.lng]);
        if (pt.x < -reach || pt.y < -reach || pt.x > W + reach || pt.y > H + reach) continue;
        const x0 = Math.max(0, Math.floor((pt.x - reach) / step)), x1 = Math.min(gw - 1, Math.ceil((pt.x + reach) / step));
        const y0 = Math.max(0, Math.floor((pt.y - reach) / step)), y1 = Math.min(gh - 1, Math.ceil((pt.y + reach) / step));
        for (let y = y0; y <= y1; y++) {
          const dy = y * step - pt.y;
          for (let x = x0; x <= x1; x++) {
            const dx = x * step - pt.x, k = Math.exp(-(dx * dx + dy * dy) * inv);
            if (k < 0.01) continue;
            const i = y * gw + x; num[i] += k * p.v; den[i] += k;
          }
        }
      }
      const img = new ImageData(gw, gh), { lo, hi } = cloud.scale;
      for (let i = 0; i < gw * gh; i++) {
        const d = den[i];
        if (d < 0.02) continue;
        const t = Math.max(0, Math.min(1, (num[i] / d - lo) / (hi - lo))) * (CLOUD_RGB.length - 1);
        const a = Math.floor(t), b = Math.min(CLOUD_RGB.length - 1, a + 1), f = t - a, o = i * 4;
        for (let ch = 0; ch < 3; ch++) img.data[o + ch] = CLOUD_RGB[a][ch] + (CLOUD_RGB[b][ch] - CLOUD_RGB[a][ch]) * f;
        img.data[o + 3] = Math.round(Math.min(1, d / 1.6) ** 0.75 * 190);
      }
      const small = document.createElement("canvas");
      small.width = gw; small.height = gh;
      small.getContext("2d")!.putImageData(img, 0, 0);
      g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high";
      g.drawImage(small, 0, 0, gw * step * dpr, gh * step * dpr);
    };
    // while zooming the old drawing would be at the wrong scale: hidden until the zoom ends
    const hide = () => { c.style.visibility = "hidden"; };
    draw();
    m.on("moveend zoomend resize viewreset", draw); m.on("zoomstart", hide);
    return () => { m.off("moveend zoomend resize viewreset", draw); m.off("zoomstart", hide); };
  }, [ready, cloud, spread]);

  return <div ref={el} className="mkExMap" />;
}
