"use client";
// „Localizare” of the asset page: the small map shows the best point (geoportal UVALO, else the address, else the
// inspection); a click opens it big with all three points, as tabs, and their GPS coordinates to copy.
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { MiniMap } from "./MiniMap";
import { PinsMap, type MapPin } from "./PinsMap";
import type { AssetPin, PinKind, PinQuery } from "@/lib/asset-pins";

const META: Record<PinKind, { label: string; short: string; color: string; none: string }> = {
  uvalo: { label: "Localizator UVALO", short: "UVALO", color: "#1fa971", none: "Parcela nu e în planurile geoportalului (sau lipsește nr. cadastral)." },
  adresa: { label: "După adresă", short: "Adresă", color: "#3b6fd8", none: "Adresa nu a fost găsită pe hartă." },
  inspectie: { label: "Pin inspecție", short: "Inspecție", color: "#8a4fd8", none: "Nu s-a colectat GPS la inspecție." },
};
const fmt = (p: { lat: number | null; lng: number | null }) => `${p.lat!.toFixed(6)}, ${p.lng!.toFixed(6)}`;
const has = (p: AssetPin) => p.lat != null && p.lng != null;
/** metres between two points */
function dist(a: AssetPin, b: AssetPin) {
  const R = 6371000, toR = Math.PI / 180;
  const dLat = (b.lat! - a.lat!) * toR, dLng = (b.lng! - a.lng!) * toR;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat! * toR) * Math.cos(b.lat! * toR) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

export function AssetLocation({ pins: initial, query, height = 90 }: { pins: AssetPin[]; query: PinQuery; height?: number }) {
  const [pins, setPins] = useState(initial);
  const [open, setOpen] = useState(false);
  const [focus, setFocus] = useState<PinKind | null>(null);
  const [asking, setAsking] = useState<PinKind[]>([]);
  const [copied, setCopied] = useState<string | null>(null);
  const best = pins.find(has);

  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open]);

  // the points not saved yet are looked up when the map opens (nothing is saved)
  useEffect(() => {
    if (!open) return;
    const ask = async (kind: PinKind, body: Record<string, unknown>, ok: (s: string) => boolean) => {
      setAsking((a) => [...a, kind]);
      const d = (await fetch("/api/crm/geo/lookup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
        .then((r) => r.json()).catch(() => null)) as { hit?: { lat: number; lng: number; source: string; note: string } | null } | null;
      setAsking((a) => a.filter((k) => k !== kind));
      const h = d?.hit;
      if (h && ok(h.source)) setPins((ps) => ps.map((p) => p.kind === kind ? { kind, lat: Math.round(h.lat * 1e6) / 1e6, lng: Math.round(h.lng * 1e6) / 1e6, note: h.note } : p));
    };
    const missing = (k: PinKind) => !has(pins.find((p) => p.kind === k)!);
    if (missing("uvalo") && (query.cad_building || query.cad_land || query.cf_number))
      ask("uvalo", { city: query.city, county: query.county, cad_building: query.cad_building, cad_land: query.cad_land, cf_number: query.cf_number }, (s) => s === "cadastru");
    if (missing("adresa") && (query.address || query.city))
      ask("adresa", { address: query.address, city: query.city, county: query.county }, (s) => s === "adresa" || s === "localitate");
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const copy = async (key: string, text: string) => {
    try { await navigator.clipboard.writeText(text); } catch {
      const t = document.createElement("textarea"); t.value = text; document.body.appendChild(t); t.select(); document.execCommand("copy"); t.remove();
    }
    setCopied(key); setTimeout(() => setCopied((c) => (c === key ? null : c)), 1600);
  };

  const shown: MapPin[] = pins.filter(has).map((p) => ({ key: p.kind, lat: p.lat!, lng: p.lng!, color: META[p.kind].color, label: META[p.kind].short }));
  const uvalo = pins.find((p) => p.kind === "uvalo")!;

  return (
    <>
      <div className="mapZoom">
        {best ? <MiniMap point={{ lat: best.lat!, lng: best.lng!, source: best.kind === "uvalo" ? "cadastru" : "adresa" }} height={height} />
          : <div className="miniMap pinsEmpty" style={{ height }}>fără coordonate</div>}
        <button type="button" className="mapZoomHit" onClick={() => { setFocus(best?.kind ?? null); setOpen(true); }} aria-label="Mărește harta"><span>⤢ Mărește</span></button>
      </div>
      {open && createPortal(
        <div className="vfModal" role="dialog" aria-modal="true" aria-label="Localizare" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="vfModalBox mapZoomBox">
            <div className="cardHead"><h2>Localizare</h2>
              <button type="button" className="btn btnGhost btnSm" onClick={() => setOpen(false)} aria-label="Închide">×</button></div>
            <div className="pinTabs" role="tablist" aria-label="Punctele bunului">
              {pins.map((p) => (
                <button key={p.kind} type="button" role="tab" aria-selected={focus === p.kind} disabled={!has(p)} onClick={() => setFocus(p.kind)}>
                  <i style={{ background: META[p.kind].color }} />{META[p.kind].label}
                  {!has(p) && <small>{asking.includes(p.kind) ? "se caută…" : "lipsește"}</small>}
                </button>
              ))}
              <button type="button" role="tab" aria-selected={focus === null} disabled={shown.length < 2} onClick={() => setFocus(null)}>Toate</button>
            </div>
            {shown.length ? <PinsMap pins={shown} focus={focus} height="min(60vh, 560px)" />
              : <div className="miniMap pinsEmpty" style={{ height: 240 }}>{asking.length ? "Se caută coordonatele…" : "Bunul nu are încă niciun punct pe hartă."}</div>}
            <div className="pinList">
              {pins.map((p) => (
                <div key={p.kind} className={`pinRow${focus === p.kind ? " on" : ""}`}>
                  <i style={{ background: META[p.kind].color }} />
                  <span className="pinWhat"><b>{META[p.kind].label}</b><small>{has(p) ? p.note : asking.includes(p.kind) ? "se caută…" : META[p.kind].none}</small></span>
                  {has(p) ? <>
                    <code className="mono">{fmt(p)}</code>
                    {p.kind !== "uvalo" && has(uvalo) && <small className="muted">{dist(uvalo, p).toLocaleString("ro-RO")} m de UVALO</small>}
                    <span className="pinActs">
                      <button type="button" className="btn btnGhost btnSm" onClick={() => copy(p.kind, fmt(p))}>{copied === p.kind ? "✓ Copiat" : "Copiază"}</button>
                      <a className="link" href={`https://www.google.com/maps?q=${p.lat},${p.lng}`} target="_blank" rel="noopener">Google Maps ↗</a>
                    </span>
                  </> : <span />}
                </div>
              ))}
            </div>
          </div>
        </div>, document.body)}
    </>
  );
}
