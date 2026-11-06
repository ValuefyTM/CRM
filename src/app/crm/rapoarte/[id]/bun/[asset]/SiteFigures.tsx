"use client";
// The two figures of the site analysis on the page, drawn exactly as in the exports (site-export.ts, after UVALO):
// Fig. 1 the zone map (tiles, the 1 km radius, the parcel, the numbered amenities), Fig. 2 the site plan.
import { useEffect, useRef, useState } from "react";
import type { Parcel, Zone } from "@/lib/site-shared";
import { planSvg, zoneCanvas, type Base } from "@/lib/site-export";

export function ZoneMap({ zone, parcel, base }: { zone: Zone; parcel: Parcel | null; base: Base }) {
  const cv = useRef<HTMLCanvasElement>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let off = false;
    setLoading(true);
    zoneCanvas(zone, parcel, base, 800, 600).then((src) => {
      const c = cv.current;
      if (off || !c) return;
      c.width = src.width; c.height = src.height;
      c.getContext("2d")!.drawImage(src, 0, 0);
      setLoading(false);
    });
    return () => { off = true; };
  }, [zone, parcel, base]);
  return (
    <>
      <canvas ref={cv} className="amCanvas" role="img" aria-label="Harta zonei: parcela, raza de 1 km și dotările numerotate" />
      {loading && <span className="amLoading">Se încarcă harta…</span>}
    </>
  );
}

export function SitePlan({ parcel, zone }: { parcel: Parcel; zone: Zone | null }) {
  return <div className="amSvg" role="img" aria-label="Plan de situație: conturul parcelei, punctele, laturile, construcțiile, vecinii și strada"
    dangerouslySetInnerHTML={{ __html: planSvg(parcel, zone, 640, 480) }} />;
}
