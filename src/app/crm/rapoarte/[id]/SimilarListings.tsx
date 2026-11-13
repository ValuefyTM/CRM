"use client";
// „N anunțuri de vânzare similare”: next to the similar reports, the market listings around the report's subject.
// A big window with the list and the map (the subject in the centre, rings, price pins), each listing with its
// similarity to the valued property; a listing opens on top in a compact window.

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ListingMap, type MapPin } from "@/components/MarketViews";
import { ComparableModal, SimGauge, type Verif } from "@/components/ComparableModal";

const RADII: [string, string][] = [["0.5", "500 m"], ["1", "1 km"], ["2", "2 km"], ["5", "5 km"], ["10", "10 km"]];
const TOLS: [string, string][] = [["25", "±25%"], ["50", "±50%"], ["0", "oricare"]];
const num = (n: number | null | undefined, d = 0) => (n == null ? "—" : n.toLocaleString("ro-RO", { maximumFractionDigits: d }));
const cur = (c: string | null | undefined) => (c === "EUR" ? "€" : c === "RON" ? "lei" : c ?? "");
const dist = (km: number) => (km < 1 ? `${Math.round(km * 1000)} m` : `${km.toLocaleString("ro-RO", { maximumFractionDigits: 1 })} km`);
const pct = (x: number) => `${Math.abs(x * 100).toLocaleString("ro-RO", { maximumFractionDigits: 1 })}%`;
const cap = (s: string | null) => (s ? s.charAt(0) + s.slice(1).toLowerCase() : "");
const tone = (v: number) => (v >= 75 ? "hi" : v >= 50 ? "mid" : "lo");
const short = (v: number | null) => (v == null ? "?" : v >= 1000 ? `${(v / 1000).toLocaleString("ro-RO", { maximumFractionDigits: v >= 100_000 ? 0 : 1 })}k` : String(Math.round(v)));
const esc = (x: string) => x.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const days = (iso: string | null | undefined) => { const t = Date.parse(iso ?? ""); return Number.isFinite(t) ? Math.max(0, Math.round((Date.now() - t) / 864e5)) : null; };

type Row = {
  id: string; source: string; url: string; title: string | null; transaction: string | null; price: number | null; currency: string | null; price_sqm: number | null;
  area: number | null; city: string | null; zone: string | null; lat: number | null; lng: number | null; geo_precision: string | null; status: string;
  dup_group: string | null; photo: string | null; km: number; score: number; parts: { k: string; v: number }[]; vsMedian: number | null; first_seen_at: string;
};
type Data = {
  radius: number; tr: string; tol: number; median: number | null; n: number; rows: Row[]; verif: Record<string, Verif>;
  subject: { type: string | null; category: string | null; address: string | null; city: string | null; usable_area: number | null; land_area: number | null; sqm: number | null; ll: [number, number] | null } | null;
};

export function SimilarListings({ report, asset, base, count, radius, canEdit = true }: { report: string; asset?: string; base: string; count: number; radius: number; canEdit?: boolean }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ raza: String(radius), tr: "vanzare", tol: "50", toate: false });
  const [data, setData] = useState<Data | null>(null);
  const [busy, setBusy] = useState(false);
  const [hover, setHover] = useState<string | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const [verif, setVerif] = useState<Record<string, Verif>>({});

  useEffect(() => {
    if (!open) return;
    let off = false;
    setBusy(true);
    const q = new URLSearchParams({ raza: f.raza, tr: f.tr, tol: f.tol, ...(f.toate ? { toate: "1" } : {}), ...(asset ? { bun: asset } : {}) });
    fetch(`/api/crm/reports/${encodeURIComponent(report)}/market?${q}`, { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<Data>) : null)).then((d) => { if (!off) { setData(d); setVerif(d?.verif ?? {}); setBusy(false); } })
      .catch(() => { if (!off) setBusy(false); });
    return () => { off = true; };
  }, [open, f, report, asset]);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") { if (pick) setPick(null); else setOpen(false); } };
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [open, pick]);

  const rows = data?.rows ?? [];
  const s = data?.subject ?? null;
  const rent = f.tr === "inchiriere";
  const pins = useMemo<MapPin[]>(() => rows.filter((r) => r.lat != null && r.lng != null).map((r) => ({
    id: r.id, lat: r.lat!, lng: r.lng!, label: short(r.price), inactive: r.status !== "activ",
    tip: `<b>${esc(r.title ?? "Anunț")}</b><br><small>${r.price != null ? `${num(r.price)} ${cur(r.currency)}` : "la cerere"}${r.area ? ` · ${num(r.area)} m²` : ""} · ${dist(r.km)} · similaritate ${r.score}%</small>`,
  })), [rows]);
  const subjectVs = !rent && s?.sqm && data?.median ? (s.sqm - data.median) / data.median : null;
  const set = (k: keyof typeof f, v: string | boolean) => setF((x) => ({ ...x, [k]: v }));

  return (
    <>
      <button type="button" className="simChip" onClick={() => setOpen(true)}>
        <b>{count}</b> {count === 1 ? "anunț de vânzare similar" : "anunțuri de vânzare similare"} în raza de {String(radius).replace(".", ",")} km<span aria-hidden="true">→</span>
      </button>
      {open && createPortal(
        <div className="vfModal" role="dialog" aria-modal="true" aria-labelledby="mkT" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="vfModalBox simBox mkBox">
            <div className="simHead">
              <div>
                <h2 id="mkT">Anunțuri similare în apropiere</h2>
                <p className="muted">{s ? [cap(s.type) || cap(s.category), s.usable_area ? `${num(s.usable_area, 1)} mp` : s.land_area ? `${num(s.land_area)} mp teren` : null, s.address ?? s.city].filter(Boolean).join(" · ") : ""}
                  {" "}· aceeași categorie · prețuri cerute în anunțuri</p>
              </div>
              <button type="button" className="btn btnGhost btnSm" onClick={() => setOpen(false)} aria-label="Închide">✕</button>
            </div>
            <div className="simBar">
              <div className="simRadii" role="group" aria-label="Tranzacția">
                <button type="button" aria-pressed={!rent} onClick={() => set("tr", "vanzare")}>Vânzare</button>
                <button type="button" aria-pressed={rent} onClick={() => set("tr", "inchiriere")}>Închiriere</button>
              </div>
              <div className="simRadii" role="group" aria-label="Raza">
                {RADII.map(([k, l]) => <button key={k} type="button" aria-pressed={f.raza === k} onClick={() => set("raza", k)}>{l}</button>)}
              </div>
              <div className="simRadii" role="group" aria-label="Suprafața">
                {TOLS.map(([k, l]) => <button key={k} type="button" aria-pressed={f.tol === k} onClick={() => set("tol", k)} title="suprafața față de subiect">{l}</button>)}
              </div>
              <label className="simSame"><input type="checkbox" checked={f.toate} onChange={(e) => set("toate", e.target.checked)} />Și anunțurile dispărute</label>
              <span className="simSum">{busy ? "Se caută…" : `${rows.length} ${rows.length === 1 ? "anunț" : "anunțuri"}${data?.median ? ` · mediana ${num(data.median, rent ? 2 : 0)} €/mp${rent ? "/lună" : ""}` : ""}`}</span>
            </div>
            {subjectVs != null && (
              <p className="mkSubjectVs">Valoarea din raport: <b>{num(s!.sqm)} €/mp</b> — <span className={Math.abs(subjectVs) < 0.1 ? "ok" : "warn"}>{Math.abs(subjectVs) < 0.005 ? "la mediana prețurilor cerute" : `${subjectVs < 0 ? "sub" : "peste"} mediana prețurilor cerute cu ${pct(subjectVs)}`}</span> (fără ajustarea de negociere)</p>
            )}
            {!busy && data && !s?.ll && <p className="hint pad">Bunul nu are coordonate: localizează-l (pagina bunului) ca să găsim anunțurile din jur.</p>}
            {!busy && s?.ll && rows.length === 0 && <p className="hint pad">Niciun anunț {rent ? "de închiriere" : "de vânzare"} pentru criteriile alese. Mărește raza sau toleranța suprafeței.</p>}
            {s?.ll && rows.length > 0 && (
              <div className="mkSplit">
                <div className="mkList">
                  {rows.map((r) => (
                    <button type="button" key={r.id} className={`ldNear${hover === r.id ? " hl" : ""}${r.status !== "activ" ? " gone" : ""}`} onMouseEnter={() => setHover(r.id)} onMouseLeave={() => setHover(null)} onClick={() => setPick(r.id)}>
                      <span className="mkThumbBox">{r.photo ? <img src={r.photo} alt="" loading="lazy" /> : <span className="ldNearNo">FOTO</span>}<SimGauge v={r.score} size={38} /></span>
                      <span className="ldNearBody">
                        <span className="ldNearTop">
                          <span><small>{r.source} · {r.status}{r.dup_group ? " · pe mai multe site-uri" : ""}</small>
                            <b>{[r.zone, r.city].filter(Boolean).filter((v, k, a) => a.indexOf(v) === k).join(", ") || r.title || "Anunț"}</b>
                            <em>{[r.area ? `${num(r.area)} m²` : null, `${dist(r.km)} de subiect`].filter(Boolean).join(" · ")}</em></span>
                          <span className="ldNearPrice"><b>{r.price != null ? `${num(r.price)} ${cur(r.currency)}` : "la cerere"}</b><em>{r.price_sqm != null ? `${num(r.price_sqm, rent ? 2 : 0)} ${cur(r.currency)}/m²` : ""}</em></span>
                        </span>
                        <span className="mkTags">
                          {verif[r.id]?.done && <span className="mkVer">✓ verificat {verif[r.id].day?.split("-").reverse().join(".")}</span>}
                          {r.vsMedian != null && <span className={`ldNearTag ${r.vsMedian <= 0 ? "ok" : "err"}`}>{Math.abs(r.vsMedian) < 0.005 ? "la mediană" : `${r.vsMedian < 0 ? "sub" : "peste"} mediană ${pct(r.vsMedian)}`}</span>}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
                <div className="mkMap">
                  <ListingMap lat={s.ll[0]} lng={s.ll[1]} radiusM={null} label="Subiect" pins={pins} hover={hover} onPick={setPick}
                    rings={[...new Set([Number(f.raza) >= 1 ? 500 : Number(f.raza) * 500, Number(f.raza) * 1000])]} className="mkMapBox" />
                </div>
              </div>
            )}
            <p className="hint simFoot">Similaritatea ține cont de distanță (40%), suprafață (40%) și cât de recent e anunțul (20%), doar unde datele există la ambele. Prețurile sunt cele cerute în anunțuri; un grup de duplicate apare o singură dată.</p>
          </div>
          {pick && (() => {
            const k = rows.findIndex((r) => r.id === pick);
            const r = rows[k];
            return r ? <ComparableModal c={r} index={k + 1} report={report} base={base} canEdit={canEdit}
              subject={s?.ll ? { ll: s.ll, label: [cap(s.type) || cap(s.category), s.address ?? s.city].filter(Boolean).join(" · ") } : null}
              verif={verif[r.id] ?? null} onVerif={(v) => setVerif((x) => ({ ...x, [r.id]: v }))} onClose={() => setPick(null)} /> : null;
          })()}
        </div>,
        document.body,
      )}
    </>
  );
}
