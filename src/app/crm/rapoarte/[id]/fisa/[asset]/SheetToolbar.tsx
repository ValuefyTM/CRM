"use client";
import { useEffect, useState } from "react";

/**
 * Toolbar of the inspection sheet document (hidden when printing): back to the report, with or without the photo annex,
 * print or save as PDF. The page title is the PDF's name; `autoPrint` (from the sheet's modal) opens the print dialog
 * once the photos have loaded.
 */
export function SheetToolbar({ back, name, photos, withPhotos: initial, autoPrint }: { back: string; name: string; photos: number; withPhotos: boolean; autoPrint: boolean }) {
  const [withPhotos, setWithPhotos] = useState(initial);
  useEffect(() => { document.title = name; }, [name]);
  useEffect(() => {
    document.getElementById("anexa-foto")?.toggleAttribute("hidden", !withPhotos);
    const u = new URL(window.location.href);
    if (withPhotos) u.searchParams.delete("foto"); else u.searchParams.set("foto", "0");
    u.searchParams.delete("print");
    window.history.replaceState(null, "", u);
  }, [withPhotos]);
  useEffect(() => {
    if (!autoPrint) return;
    const go = () => setTimeout(() => window.print(), 300);
    if (document.readyState === "complete") go(); else window.addEventListener("load", go, { once: true });
    return () => window.removeEventListener("load", go);
  }, [autoPrint]);
  return (
    <div className="cdBar">
      <a className="btn btnGhost btnSm" href={back}>← Raport</a>
      <span className="cdBarTitle">{name}</span>
      {photos > 0 && (
        <label className="cdBarCheck"><input type="checkbox" checked={withPhotos} onChange={(e) => setWithPhotos(e.target.checked)} /> Cu anexa foto ({photos})</label>
      )}
      <button type="button" className="btn btnGold btnSm" onClick={() => window.print()}>{withPhotos && photos > 0 ? "Generează PDF cu poze" : "Generează PDF fără poze"}</button>
    </div>
  );
}
