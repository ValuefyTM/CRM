"use client";
// A small map that opens big on a click (the asset page's "Localizare"): the same point, the wheel zooms there.
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { MiniMap, type MiniPoint } from "./MiniMap";

export function MapZoom({ point, height = 160, title = "Localizare", link }: { point: MiniPoint; height?: number; title?: string; link?: string }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open]);
  return (
    <>
      <div className="mapZoom">
        <MiniMap point={point} height={height} />
        <button type="button" className="mapZoomHit" onClick={() => setOpen(true)} aria-label="Mărește harta"><span>⤢ Mărește</span></button>
      </div>
      {open && createPortal(
        <div className="vfModal" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="vfModalBox mapZoomBox">
            <div className="cardHead"><h2>{title}</h2>
              <span className="actions" style={{ gap: 10 }}>{link && <a className="link" href={link} target="_blank" rel="noopener">Google Maps ↗</a>}
                <button type="button" className="btn btnGhost btnSm" onClick={() => setOpen(false)} aria-label="Închide">×</button></span></div>
            <MiniMap point={point} height="min(72vh, 680px)" zoom />
          </div>
        </div>, document.body)}
    </>
  );
}
