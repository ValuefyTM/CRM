"use client";
// „Localizare” of an asset: the big map with its three points, in this order of trust (geoportal UVALO, the address,
// the inspection), as tabs, their GPS coordinates to copy, the parcel's contour and the base layer (map, satellite,
// terrain). Opened from the small map of the asset page (AssetLocation) and from the report's list of assets (MapLink).
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { MiniMap } from "./MiniMap";
import { PinsMap, type MapPin } from "./PinsMap";
import type { AssetPin, PinKind, PinParcel, PinQuery } from "@/lib/asset-pins";

export type AssetPins = { pins: AssetPin[]; query: PinQuery; parcel: PinParcel | null };

const META: Record<PinKind, { label: string; short: string; color: string; none: string }> = {
  uvalo: { label: "Localizator UVALO", short: "UVALO", color: "#1fa971", none: "Parcela nu e în planurile geoportalului (sau lipsește nr. cadastral)." },
  adresa: { label: "După adresă", short: "Adresă", color: "#3b6fd8", none: "Adresa nu a fost găsită pe hartă." },
  inspectie: { label: "Pin inspecție", short: "Inspecție", color: "#8a4fd8", none: "Nu s-a colectat GPS la inspecție." },
};
const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const fmt = (p: { lat: number | null; lng: number | null }) => `${p.lat!.toFixed(6)}, ${p.lng!.toFixed(6)}`;
const has = (p: AssetPin) => p.lat != null && p.lng != null;
const r6 = (x: number) => Math.round(x * 1e6) / 1e6;
const post = <T,>(url: string, body: unknown) => fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
  .then((r) => r.json() as Promise<T>).catch(() => null);
/** metres between two points */
function dist(a: AssetPin, b: AssetPin) {
  const R = 6371000, toR = Math.PI / 180;
  const dLat = (b.lat! - a.lat!) * toR, dLng = (b.lng! - a.lng!) * toR;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat! * toR) * Math.cos(b.lat! * toR) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

/** The small map of the asset page; a click opens the big one. */
export function AssetLocation({ data, height = 150 }: { data: AssetPins; height?: number }) {
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(data);
  const best = now.pins.find(has);
  return (
    <>
      <div className="mapZoom">
        {best ? <MiniMap point={{ lat: best.lat!, lng: best.lng!, source: best.kind === "uvalo" ? "cadastru" : "adresa" }} height={height} />
          : <div className="miniMap pinsEmpty" style={{ height }}>fără coordonate</div>}
        <button type="button" className="mapZoomHit" onClick={() => setOpen(true)} aria-label="Mărește harta"><span>⤢ Mărește</span></button>
      </div>
      {open && <LocationModal data={now} onChange={setNow} onClose={() => setOpen(false)} />}
    </>
  );
}

/** „Vezi pe hartă” (the report's assets): loads the asset's points and opens the big map. */
export function MapLink({ asset, label = "Vezi pe hartă", className = "link" }: { asset: string; label?: string; className?: string }) {
  const [data, setData] = useState<AssetPins | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const go = async (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    setBusy(true); setMsg("");
    const d = await fetch(`/api/crm/geo/pins?asset=${encodeURIComponent(asset)}`).then((r) => (r.ok ? (r.json() as Promise<AssetPins>) : null)).catch(() => null);
    setBusy(false);
    if (!d) return setMsg("Harta nu s-a putut deschide.");
    setData(d);
  };
  return (
    <>
      <button type="button" className={`${className} mapLink`} onClick={go} disabled={busy}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21Z" /><circle cx="12" cy="9.5" r="2.5" /></svg>
        {busy ? "Se deschide…" : label}
      </button>
      {msg && <small className="errTxt">{msg}</small>}
      {data && <LocationModal data={data} onClose={() => setData(null)} />}
    </>
  );
}

export function LocationModal({ data, onClose, onChange }: { data: AssetPins; onClose: () => void; onChange?: (d: AssetPins) => void }) {
  const { query } = data;
  const [pins, setPins] = useState(data.pins);
  const [parcel, setParcel] = useState(data.parcel);
  const [focus, setFocus] = useState<PinKind | null>(data.pins.find(has)?.kind ?? null);
  const [asking, setAsking] = useState<PinKind[]>([]);
  const [copied, setCopied] = useState<string | null>(null);
  const [contour, setContour] = useState(true);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);
  useEffect(() => { onChange?.({ ...data, pins, parcel }); }, [pins, parcel]); // eslint-disable-line react-hooks/exhaustive-deps

  // the points not saved yet are looked up when the map opens
  useEffect(() => {
    const start = (k: PinKind) => setAsking((a) => [...a, k]);
    const end = (k: PinKind) => setAsking((a) => a.filter((x) => x !== k));
    const setPin = (p: AssetPin) => setPins((ps) => ps.map((x) => (x.kind === p.kind ? p : x)));
    const missing = (k: PinKind) => !has(pins.find((p) => p.kind === k)!);
    // 1. the parcel from the geoportal plans: its contour, and its centre when the UVALO pin is missing
    if (!parcel && query.nr) {
      if (missing("uvalo")) start("uvalo");
      post<{ parcel: PinParcel | null; centre: [number, number] | null; note?: string }>("/api/crm/geo/parcel", { asset: query.asset }).then(async (d) => {
        if (d?.parcel) setParcel(d.parcel);
        if (missing("uvalo")) {
          if (d?.centre) setPin({ kind: "uvalo", lat: r6(d.centre[0]), lng: r6(d.centre[1]), note: d.note ?? "centrul parcelei" });
          else {
            const h = (await post<{ hit?: { lat: number; lng: number; source: string; note: string } | null }>("/api/crm/geo/lookup",
              { city: query.city, county: query.county, cad_building: query.cad_building, cad_land: query.cad_land, cf_number: query.cf_number }))?.hit;
            if (h?.source === "cadastru") setPin({ kind: "uvalo", lat: r6(h.lat), lng: r6(h.lng), note: h.note });
          }
          end("uvalo");
        }
      });
    }
    // 2. the address is always asked again (a point saved earlier from it may be off); it replaces the saved one
    const adr = pins.find((p) => p.kind === "adresa")!;
    if ((!has(adr) || /după adresă|aproximativ/.test(adr.note)) && (query.address || query.city)) {
      start("adresa");
      post<{ hit?: { lat: number; lng: number; source: string; note: string } | null }>("/api/crm/geo/lookup", { property: query.property }).then((d) => {
        const h = d?.hit;
        if (h && (h.source === "adresa" || h.source === "localitate")) setPin({ kind: "adresa", lat: r6(h.lat), lng: r6(h.lng), note: h.note });
        end("adresa");
      });
    }
    // 3. an inspection made in UVALO, imported before its place was kept: read from UVALO
    if (missing("inspectie") && query.uvalo) {
      start("inspectie");
      post<{ pin?: AssetPin | null }>("/api/crm/geo/inspection", { asset: query.asset }).then((d) => { if (d?.pin) setPin(d.pin); end("inspectie"); });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // the first point found becomes the focus when there was none
  useEffect(() => { if (!focus) { const b = pins.find(has); if (b) setFocus(b.kind); } }, [pins]); // eslint-disable-line react-hooks/exhaustive-deps

  const copy = async (key: string, text: string) => {
    try { await navigator.clipboard.writeText(text); } catch {
      const t = document.createElement("textarea"); t.value = text; document.body.appendChild(t); t.select(); document.execCommand("copy"); t.remove();
    }
    setCopied(key); setTimeout(() => setCopied((c) => (c === key ? null : c)), 1600);
  };

  const shown: MapPin[] = pins.filter(has).map((p) => ({ key: p.kind, lat: p.lat!, lng: p.lng!, color: META[p.kind].color, label: META[p.kind].short }));
  const uvalo = pins.find((p) => p.kind === "uvalo")!;
  const place = [query.address, query.city && !fold(query.address ?? "").includes(fold(query.city)) ? query.city : null, query.county ? `jud. ${query.county}` : null].filter(Boolean).join(", ");

  return createPortal(
    <div className="vfModal" role="dialog" aria-modal="true" aria-label="Localizare" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="vfModalBox mapZoomBox">
        <div className="cardHead"><div className="pinHead"><h2>Localizare</h2>{place && <span title={place}>{place}</span>}</div>
          <button type="button" className="btn btnGhost btnSm" onClick={onClose} aria-label="Închide">×</button></div>
        <div className="pinTabs" role="tablist" aria-label="Punctele bunului">
          {pins.map((p) => (
            <button key={p.kind} type="button" role="tab" aria-selected={focus === p.kind} disabled={!has(p)} onClick={() => setFocus(p.kind)}>
              <i style={{ background: META[p.kind].color }} />{META[p.kind].label}
              {!has(p) && <small>{asking.includes(p.kind) ? "se caută…" : "lipsește"}</small>}
            </button>
          ))}
          <button type="button" role="tab" aria-selected={focus === null} disabled={shown.length < 2} onClick={() => setFocus(null)}>Toate</button>
          {parcel && <label className="pinContour"><input type="checkbox" checked={contour} onChange={(e) => setContour(e.target.checked)} />Contur teren{parcel.nr ? ` nr. ${parcel.nr}` : ""}</label>}
        </div>
        {shown.length || parcel ? <PinsMap pins={shown} focus={focus} parcel={contour ? parcel : null} height="min(60vh, 560px)" />
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
    </div>, document.body);
}
