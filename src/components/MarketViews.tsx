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
