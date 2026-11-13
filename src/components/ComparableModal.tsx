"use client";
// The listing's window (fișa comparabilei): gallery, technical data, price history, the map, the seller, the original
// title and text, the sheet exported as PDF / Word / PNG. Opened from a report's similar listings it also has the
// similarity to the valued property, the position against it and the phone check (kept on the report); opened from
// Analize de piață (no subject, no report) it shows the listing's own location instead.
import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type * as Leaflet from "leaflet";
import { printFiche, pngFiche, simColor, wordFiche, type FicheData } from "@/lib/market/fiche";
import { ListingMap } from "@/components/MarketViews";

export type Verif = { done: boolean; day: string | null; person: string | null; outcome: "confirmate" | "suplimentare" | "diferite" | "tranzactionat"; note: string | null };
export type CompRow = { id: string; score: number | null; parts: { k: string; v: number }[]; km: number | null; vsMedian: number | null; lat: number | null; lng: number | null };
type Listing = {
  id: string; source: string; ext_id: string; url: string; title: string | null; transaction: string | null; status: string; price: number | null; currency: string | null;
  price_sqm: number | null; usable_area: number | null; built_area: number | null; land_area: number | null; county: string | null; city: string | null; zone: string | null;
  address: string | null; lat: number | null; lng: number | null; geo_precision: string | null; seller_kind: string | null; seller_name: string | null; description: string | null;
  src_created_at: string | null; first_seen_at: string; last_seen_at: string; fetched_at: string | null; source_file: string | null; year: string | null; floor: string | null; rooms: string | null;
  duplicates: { id: string; source: string; url: string; price: number | null; currency: string | null }[];
  photos: { src: string; saved: boolean }[]; history: { at: string; event: string; price: number | null; currency: string | null }[];
};

const num = (n: number | null | undefined, d = 0) => (n == null ? "—" : n.toLocaleString("ro-RO", { maximumFractionDigits: d }));
const cur = (c: string | null | undefined) => (c === "EUR" ? "€" : c === "RON" ? "lei" : c ?? "");
const ro = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split("-").reverse().join(".") : "—");
const dist = (km: number) => (km < 1 ? `${Math.round(km * 1000)} m` : `${km.toLocaleString("ro-RO", { maximumFractionDigits: 1 })} km`);
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Bucharest" });
/** The radius of an approximate location, in metres („aproximativă (rază 500 m)”, „… 3 km)”); null when exact. */
const radiusOf = (p: string | null) => { if (!p || p.startsWith("exactă")) return null; const m = /rază ([\d.,]+) (m|km)/.exec(p); return m ? Number(m[1].replace(",", ".")) * (m[2] === "km" ? 1000 : 1) : p.startsWith("aproximativă") ? 300 : null; };
const OUT: [Verif["outcome"], string][] = [["confirmate", "datele sunt reale / confirmate"], ["suplimentare", "informații suplimentare obținute"], ["diferite", "date diferite față de anunț"], ["tranzactionat", "proprietate tranzacționată — preț final"]];

/** The similarity gauge (the same thresholds as the list and the exports: >80 green, 60–80 amber, <60 orange). */
export function SimGauge({ v, size = 46 }: { v: number; size?: number }) {
  const sw = 4.5, r = (size - sw) / 2 - 1, c = 2 * Math.PI * r, col = simColor(v);
  return (
    <span className="cmGauge" title={`similaritate cu proprietatea evaluată: ${v}%`}>
      <svg width={size} height={size} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--divider)" strokeWidth={sw} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={col} strokeWidth={sw} fill="none" strokeLinecap="round" strokeDasharray={`${(c * v) / 100} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
        <text x="50%" y="54%" dominantBaseline="middle" textAnchor="middle" fontSize={size > 40 ? 11 : 9.5} fontWeight="800" fill={col}>{v}%</text>
      </svg>
      <small>SIM</small>
    </span>
  );
}

function Spark({ hist }: { hist: number[] }) {
  if (hist.length < 2) return <span className="muted">preț neschimbat</span>;
  const w = 140, h = 30, mn = Math.min(...hist), mx = Math.max(...hist), r = mx - mn || 1;
  const pts = hist.map((p, i) => `${(i / (hist.length - 1)) * w},${h - 3 - ((p - mn) / r) * (h - 6)}`).join(" ");
  return <svg width={w} height={h} aria-hidden="true"><polyline points={pts} fill="none" stroke="var(--acc-ink)" strokeWidth="2" /></svg>;
}

/** Only the subject and the comparable, joined by a dashed line with the distance (real map, OpenStreetMap). */
function DistMap({ s, p, km }: { s: [number, number]; p: [number, number]; km: number }) {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let off = false, map: Leaflet.Map | null = null;
    import("leaflet").then((mod) => {
      if (off || !el.current) return;
      const l = (mod as unknown as { default?: typeof Leaflet }).default ?? (mod as unknown as typeof Leaflet);
      map = l.map(el.current, { zoomControl: false, scrollWheelZoom: false, attributionControl: true });
      l.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "&copy; OpenStreetMap", referrerPolicy: "strict-origin-when-cross-origin" }).addTo(map);
      l.control.scale({ metric: true, imperial: false, position: "bottomleft" }).addTo(map);
      l.control.zoom({ position: "bottomright" }).addTo(map);
      l.polyline([s, p], { color: "#e0931a", weight: 3, dashArray: "8 6" }).addTo(map);
      const mid: [number, number] = [(s[0] + p[0]) / 2, (s[1] + p[1]) / 2];
      l.marker(mid, { icon: l.divIcon({ className: "", html: `<span class="cmDistTag">~${dist(km)}</span>`, iconSize: [0, 0] }), interactive: false }).addTo(map);
      l.marker(s, { icon: l.divIcon({ className: "", html: `<span class="cmPin subj"><i></i><b>SUBIECT</b></span>`, iconSize: [0, 0] }), zIndexOffset: 1000 }).addTo(map);
      l.marker(p, { icon: l.divIcon({ className: "", html: `<span class="cmPin comp"><i></i><b>COMPARABILĂ</b></span>`, iconSize: [0, 0] }) }).addTo(map);
      map.fitBounds(l.latLngBounds([s, p]).pad(0.45), { maxZoom: 17 });
    });
    return () => { off = true; map?.remove(); };
  }, [s, p, km]);
  return <div ref={el} className="cmMap" />;
}

export function ComparableModal({ c, index, report, base, subject, verif, onVerif, onClose, canEdit }: {
  c: CompRow; index?: number; report?: string | null; base: string; subject?: { ll: [number, number] | null; label: string } | null;
  verif?: Verif | null; onVerif?: (v: Verif) => void; onClose: () => void; canEdit?: boolean;
}) {
  const [l, setL] = useState<Listing | null>(null);
  const [err, setErr] = useState(false);
  const [i, setI] = useState(0);
  const [zoom, setZoom] = useState(false);
  const [cap, setCap] = useState(false);
  const [vOpen, setVOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const saveT = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let off = false;
    setL(null); setErr(false); setI(0);
    fetch(`/api/crm/market/listing/${encodeURIComponent(c.id)}`, { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<Listing>) : Promise.reject())).then((d) => { if (!off) setL(d); }).catch(() => { if (!off) setErr(true); });
    return () => { off = true; };
  }, [c.id]);
  const toast = (t: string) => { setMsg(t); setTimeout(() => setMsg(null), 2600); };

  const n = l?.photos.length ?? 0;
  useEffect(() => {
    if (zoom) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [zoom, onClose]);
  useEffect(() => {
    if (!zoom) return;
    const k = (e: KeyboardEvent) => { if (e.key === "ArrowRight") setI((x) => (x + 1) % n); else if (e.key === "ArrowLeft") setI((x) => (x - 1 + n) % n); else if (e.key === "Escape") { e.stopPropagation(); setZoom(false); } };
    document.addEventListener("keydown", k, true);
    return () => document.removeEventListener("keydown", k, true);
  }, [zoom, n]);

  const rent = l?.transaction === "inchiriere";
  const street = l ? (l.address?.split(",")[0] || [l.zone, l.city].filter(Boolean)[0] || l.title || "Anunț") : "Anunț";
  const place = l ? [l.address, l.zone, l.city, l.county].filter(Boolean).filter((x, k, a) => a.indexOf(x) === k).join(", ") : "";
  const seller = l ? [l.seller_kind === "proprietar" ? "Proprietar" : l.seller_kind ? "Agenție" : null, l.seller_name].filter(Boolean).join(" · ") || "—" : "—";
  const v: Verif = verif ?? { done: false, day: today(), person: l?.seller_name ?? "", outcome: "confirmate", note: "" };
  const hist = l ? l.history.filter((h) => h.price != null).sort((a, b) => a.at.localeCompare(b.at)).map((h) => h.price!) : [];
  const priceHist = hist.length ? hist.map((p) => (p >= 1000 ? `${num(p / 1000, 1)}k` : num(p))).join(" → ") : "—";
  const drop = hist.length > 1 && hist[0] ? ((hist[hist.length - 1] - hist[0]) / hist[0]) * 100 : null;
  const daysOn = l ? Math.max(0, Math.round(((l.status === "activ" ? Date.now() : Date.parse(l.last_seen_at)) - (Date.parse(l.src_created_at ?? "") || Date.parse(l.first_seen_at))) / 864e5)) : null;
  const portals = l ? new Set([l.source, ...l.duplicates.map((d) => d.source)]).size : 1;
  const details = l ? [l.usable_area != null ? `${num(l.usable_area)} m² utili` : null, l.built_area != null ? `${num(l.built_area)} m² constr.` : null, l.land_area != null ? `${num(l.land_area)} m² teren` : null, l.rooms ? `${l.rooms} cam.` : null].filter(Boolean).join(" · ") || "—" : "—";
  const floorYear = l ? [l.floor ? `et. ${l.floor}` : null, l.year ? `construit ${l.year}` : null].filter(Boolean).join(" · ") || "—" : "—";

  const verifText = () => {
    if (!l) return "";
    const who = v.person?.trim() || l.seller_name || "vânzătorul";
    const base0 = `Comparabila (${street}, ${l.source} ref. ${l.ext_id}) a fost verificată telefonic la data de ${ro(v.day)}, în discuția cu ${who}${l.seller_name && who !== l.seller_name ? ` (${l.seller_name})` : ""}.`;
    const cc = v.outcome === "confirmate" ? " În urma conversației s-a determinat că datele publicate în anunț sunt reale și corespund proprietății."
      : v.outcome === "suplimentare" ? " În urma conversației s-au obținut informații suplimentare față de cele publicate în anunț."
      : v.outcome === "diferite" ? " În urma conversației s-a constatat că unele date publicate diferă de situația reală a proprietății."
      : " Proprietatea a fost tranzacționată; s-a obținut informație privind prețul final de tranzacționare.";
    return base0 + cc + (v.note?.trim() ? ` Observații: ${v.note.trim()}` : "");
  };
  const setV = (patch: Partial<Verif>) => {
    const next = { ...v, ...patch };
    if (!report || !onVerif) return;
    onVerif(next);
    if (saveT.current) clearTimeout(saveT.current);
    saveT.current = setTimeout(() => {
      fetch(`/api/crm/reports/${encodeURIComponent(report)}/market/verify`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ listing: c.id, ...next }) })
        .then((r) => { if (!r.ok) toast("Verificarea nu s-a putut salva."); }).catch(() => toast("Verificarea nu s-a putut salva."));
    }, 600);
  };
  const copy = (t: string, ok: string) => { try { navigator.clipboard.writeText(t); toast(ok); } catch { toast("Copierea nu e permisă aici"); } };

  const fiche = (): FicheData | null => l && ({
    index, title: street, source: l.source, ref: l.ext_id, url: l.url, status: l.status, place: place || "—", caption: l.title,
    price: l.price != null ? `${num(l.price)} ${cur(l.currency)}${rent ? " / lună" : ""}` : "preț la cerere", unit: l.price_sqm != null ? `${num(l.price_sqm, 2)} ${cur(l.currency)}/mp${rent ? " / lună" : ""}` : "—",
    details, floorYear, days: daysOn != null ? `${daysOn} zile pe piață` : "—", portals: `${portals} ${portals === 1 ? "portal" : "portaluri"} (după deduplicare)`,
    history: priceHist + (drop != null && Math.abs(drop) >= 0.1 ? ` (${drop > 0 ? "+" : ""}${num(drop, 1)}%)` : ""), sim: c.score, distance: c.km != null && subject?.ll ? dist(c.km) : "—",
    description: l.description, seller, snapshot: l.fetched_at ? `Snapshot arhivat la ${ro(l.fetched_at)} · HTML + fotografii + metadate` : null,
    verification: v.done ? verifText() : null, photos: l.photos.filter((p) => p.saved).map((p) => p.src),
    subject: subject?.ll ? { lat: subject.ll[0], lng: subject.ll[1], label: subject.label } : null, point: c.lat != null && c.lng != null ? { lat: c.lat, lng: c.lng } : null,
  });
  const run = async (k: string, f: (d: FicheData) => Promise<void>, ok: string) => {
    const d = fiche(); if (!d) return;
    setBusy(k);
    try { await f(d); toast(ok); } catch (e) { toast(e instanceof Error ? e.message : "Exportul a eșuat."); } finally { setBusy(null); }
  };

  const facts: [string, string][] = l ? [
    ["Preț", l.price != null ? `${num(l.price)} ${cur(l.currency)}${rent ? " / lună" : ""}` : "la cerere"],
    ["Unitar", l.price_sqm != null ? `${num(l.price_sqm, rent ? 2 : 0)} ${cur(l.currency)}/m²` : "—"],
    ["Suprafețe", details], ["Etaj / an", floorYear],
    ["Pe piață", daysOn != null ? `${daysOn} zile` : "—"], ["Portaluri", `${portals} (după deduplicare)`],
  ] : [];

  return (
    <div className="vfModal cmWrap" role="dialog" aria-modal="true" aria-label="Fișa comparabilei" onClick={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) onClose(); }}>
      <div className="cmBox">
        <header className="cmHead">
          {c.score != null && <SimGauge v={c.score} />}
          <div className="cmHeadT">
            <b>{street}</b>
            <small>{l ? `${l.source} · ${l.ext_id} · ${l.status === "activ" ? "activ" : `${l.status} din ${ro(l.last_seen_at)}`}` : "Se încarcă…"}</small>
          </div>
          {v.done && <span className="cmOk">✓ Verificat {ro(v.day)}</span>}
          <button type="button" className="btn btnGhost btnSm cmClose" onClick={onClose} aria-label="Închide">✕ Închide</button>
        </header>

        {err && <p className="hint pad">Anunțul nu a putut fi încărcat.</p>}
        {l && (
          <>
            <div className="cmGrid">
              <div className="cmLeft">
                {n ? (
                  <div className="cmGal">
                    <div className="cmMain" onClick={() => setZoom(true)}>
                      <img src={l.photos[i].src} alt={`${street} – imaginea ${i + 1}`} referrerPolicy={l.photos[i].saved ? undefined : "no-referrer"} />
                      <span className="cmBadge">{l.source} · {l.ext_id}</span>
                      <span className="cmCount">⤢ {i + 1}/{n}</span>
                      {n > 1 && <>
                        <button type="button" className="cmArrow l" aria-label="Imaginea anterioară" onClick={(e) => { e.stopPropagation(); setI((x) => (x - 1 + n) % n); }}>‹</button>
                        <button type="button" className="cmArrow r" aria-label="Imaginea următoare" onClick={(e) => { e.stopPropagation(); setI((x) => (x + 1) % n); }}>›</button>
                      </>}
                    </div>
                    {n > 1 && (
                      <div className="cmThumbs">
                        {l.photos.slice(0, 6).map((p, k) => (
                          <button type="button" key={k} className={k === i ? "on" : ""} onClick={() => setI(k)} aria-label={`Imaginea ${k + 1}`}>
                            <img src={p.src} alt="" loading="lazy" referrerPolicy={p.saved ? undefined : "no-referrer"} />
                            {k === 5 && n > 6 && <span>+{n - 6}</span>}
                          </button>
                        ))}
                      </div>
                    )}
                    <small className="cmNote">{n} {n === 1 ? "fotografie" : "fotografii"} {l.photos[0].saved ? "arhivate" : "de pe site (nearhivate încă)"} din anunțul original · click pentru mărire</small>
                  </div>
                ) : <div className="cmNoPhoto">Fără fotografii arhivate</div>}

                <dl className="cmFacts">{facts.map(([k, val]) => <div key={k}><dt>{k}</dt><dd>{val}</dd></div>)}</dl>
                <div className="cmHist">
                  <span className="cmLbl">Istoric preț</span>
                  <Spark hist={hist} />
                  <span className="mono">{priceHist}</span>
                  {drop != null && Math.abs(drop) >= 0.1 && <span className={drop < 0 ? "cmDrop" : "cmUp"}>{drop > 0 ? "+" : ""}{num(drop, 1)}% de la listare</span>}
                </div>
              </div>

              <div className="cmRight">
                <section className="cmMapBox">
                  {subject?.ll && c.km != null ? <>
                    <div className="cmMapHead"><b>Poziție față de subiect</b><span>~{dist(c.km)}</span></div>
                    {c.lat != null && c.lng != null ? <DistMap s={subject.ll} p={[c.lat, c.lng]} km={c.km} /> : <div className="cmNoPhoto">Fără coordonate</div>}
                    <div className="cmLegend"><span className="s">◆ subiect</span><span className="c">● comparabilă</span><span>linie dreaptă{l.geo_precision ? ` · locație ${l.geo_precision}` : ""}</span></div>
                  </> : <>
                    <div className="cmMapHead"><b>Localizare</b><span>{[l.zone, l.city].filter(Boolean).filter((x, k, a) => a.indexOf(x) === k).join(", ")}</span></div>
                    {l.lat != null && l.lng != null ? <ListingMap lat={l.lat} lng={l.lng} radiusM={radiusOf(l.geo_precision)} label="Anunțul" className="cmMap" /> : <div className="cmNoPhoto">Fără coordonate (apar după descărcarea paginii anunțului)</div>}
                    <div className="cmLegend"><span className="c">● anunțul</span><span>{l.geo_precision ? `locație ${l.geo_precision}` : "precizie nedeclarată"}</span></div>
                  </>}
                </section>

                <section className="cmContact">
                  <span className="cmLbl">Vânzător</span>
                  <b>{l.seller_name || (l.seller_kind === "proprietar" ? "Proprietar" : "—")}</b>
                  <small>{l.seller_kind === "proprietar" ? "proprietar · persoană fizică" : l.seller_kind ? "agenție imobiliară" : "nespecificat"}</small>
                  <p className="hint">Telefonul nu se preia din anunț (date personale); îl găsești pe pagina anunțului.</p>
                  <div className="cmActs">
                    <button type="button" className="btn btnGhost btnSm" onClick={() => copy(l.url, "Linkul anunțului copiat")}>⧉ Copiază linkul</button>
                    {l.status === "activ" ? <a className="btn btnNavy btnSm" href={l.url} target="_blank" rel="noreferrer">Anunț pe {l.source} ↗</a>
                      : <span className="hint">anunțul nu mai e pe site · rămâne arhiva</span>}
                  </div>
                  {l.duplicates.length > 0 && <small className="muted">Apare și pe: {l.duplicates.map((d, k) => <a key={k} href={d.url} target="_blank" rel="noreferrer">{d.source}</a>).reduce<ReactNode[]>((a, x, k) => (k ? [...a, ", ", x] : [x]), [])}</small>}
                  <a className="cmFull" href={`${base}/piata/${l.id}`} target="_blank" rel="noreferrer">Fișa completă în CRM ↗</a>
                </section>
              </div>
            </div>

            <div className="cmBody">
              <button type="button" className={`btn btnSm ${cap ? "btnNavy" : "btnGhost"}`} onClick={() => setCap((x) => !x)}>{cap ? "▴ Ascunde titlul original" : "▾ Vezi titlul original"}</button>
              {cap && <div className="cmCap"><small>titlul anunțului, așa cum a fost publicat pe {l.source}</small><b>„{l.title ?? "—"}”</b></div>}
              <div className="cmText"><span className="cmLbl">Textul anunțului original</span>
                {(l.description ?? "Fără descriere (pagina anunțului nu a fost încă descărcată).").split(/\n\s*\n/).map((p, k) => <p key={k}>{p}</p>)}</div>
            </div>

            {report && <section className={`cmVerif${v.done ? " done" : ""}`}>
              <div className="cmVerifHead" onClick={() => setVOpen((o) => !o)}>
                <span className="cmCaret">{vOpen ? "▾" : "▸"}</span>
                <b>Verificare telefonică</b>
                {!vOpen && (v.done ? <small className="ok">✓ {ro(v.day)} · {v.person || l.seller_name || "—"}</small> : <small>neverificată — click pentru a completa</small>)}
                <label className="cmCheck" onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" checked={v.done} disabled={!canEdit} onChange={(e) => { setV({ done: e.target.checked }); setVOpen(e.target.checked); }} />a fost verificată
                </label>
              </div>
              {vOpen && (
                <fieldset className="cmVerifBody" disabled={!canEdit}>
                  <label className="field">Data verificării<input className="input" type="date" value={v.day ?? ""} onChange={(e) => setV({ day: e.target.value })} /></label>
                  <label className="field">Persoana cu care s-a discutat<input className="input" value={v.person ?? ""} placeholder={l.seller_name ?? "nume"} onChange={(e) => setV({ person: e.target.value })} /></label>
                  <label className="field">Rezultatul verificării
                    <select className="input" value={v.outcome} onChange={(e) => setV({ outcome: e.target.value as Verif["outcome"] })}>{OUT.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></label>
                  <label className="field cmWide">Notițe / observații din discuție
                    <textarea className="input" rows={3} value={v.note ?? ""} onChange={(e) => setV({ note: e.target.value })} placeholder="ex.: prețul acceptat de proprietar este …; are rampă de descărcare, nemenționată în anunț…" /></label>
                  <div className="cmGen cmWide">
                    <div><span className="cmLbl">Text generat pentru raport</span><button type="button" className="btn btnNavy btnSm" onClick={() => copy(verifText(), "Textul verificării copiat")}>⧉ Copiază</button></div>
                    <p>{verifText()}</p>
                  </div>
                  {!canEdit && <p className="hint cmWide">Doar echipa raportului poate completa verificarea.</p>}
                </fieldset>
              )}
            </section>}

            <footer className="cmFoot">
              <span className="cmSnap">{l.fetched_at ? <>✓ snapshot arhivat la {ro(l.fetched_at)}{l.source_file && <> · <a href={l.source_file}>sursa completă</a></>}</> : "pagina anunțului nu a fost încă arhivată"}</span>
              <span className="cmExp">
                <button type="button" className="btn btnGold btnSm" disabled={!!busy} onClick={() => run("pdf", printFiche, "Fișa e gata de tipărit / salvat ca PDF")}>{busy === "pdf" ? "…" : "⬇ PDF"}</button>
                <button type="button" className="btn btnNavy btnSm" disabled={!!busy} onClick={() => run("word", wordFiche, "Fișa Word a fost generată")}>{busy === "word" ? "…" : "⬇ Word"}</button>
                <button type="button" className="btn btnGhost btnSm" disabled={!!busy} onClick={() => run("png", pngFiche, "Fișa PNG a fost descărcată")}>{busy === "png" ? "…" : "⬇ PNG"}</button>
              </span>
            </footer>
          </>
        )}
        {!l && !err && <p className="hint pad">Se încarcă anunțul…</p>}
      </div>

      {zoom && l && n > 0 && (
        <div className="ldBox" role="dialog" aria-modal="true" aria-label="Galerie" onClick={(e) => { e.stopPropagation(); setZoom(false); }}>
          <img src={l.photos[i].src} alt="" onClick={(e) => e.stopPropagation()} referrerPolicy={l.photos[i].saved ? undefined : "no-referrer"} />
          <button type="button" className="ldBoxClose" aria-label="Închide" onClick={() => setZoom(false)}>✕</button>
          {n > 1 && <>
            <button type="button" className="ldArrow l big" aria-label="Imaginea anterioară" onClick={(e) => { e.stopPropagation(); setI((x) => (x - 1 + n) % n); }}>‹</button>
            <button type="button" className="ldArrow r big" aria-label="Imaginea următoare" onClick={(e) => { e.stopPropagation(); setI((x) => (x + 1) % n); }}>›</button>
          </>}
          <span className="ldCount big">{street} · {i + 1} / {n} · snapshot {l.source} ref. {l.ext_id}{l.fetched_at ? ` · capturat la ${ro(l.fetched_at)}` : ""}</span>
        </div>
      )}
      {msg && <div className="cmToast" role="status">{msg}</div>}
    </div>
  );
}
