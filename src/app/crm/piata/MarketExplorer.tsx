"use client";
// Analize de piață: the listings brought in from the portals as a list and a map side by side (an adjustable
// separator between them), with filters that apply by themselves.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CLOUD_RAMP, cloudScale, MarketMap, type ExplorerPoint } from "@/components/MarketViews";
import { ComparableModal } from "@/components/ComparableModal";

type Row = { id: string; source: string; url: string; title: string | null; category: string | null; type: string | null; transaction: string | null; price: number | null; currency: string | null;
  price_sqm: number | null; area: number | null; city: string | null; zone: string | null; county: string | null; lat: number | null; lng: number | null; geo_precision: string | null;
  status: string; dup_group: string | null; dup_reason: string | null; cover: string | null; first_seen_at: string; changed_at: string | null };
type Point = { id: string; lat: number; lng: number; price: number | null; currency: string | null; price_sqm: number | null; title: string | null; status: string; area: number | null; source: string };
type Q = { q?: string; cat?: string; tip?: string; tr?: string; src?: string; st?: string; dup?: string; min?: string; max?: string; p?: string; vezi?: string };

const num = (n: number | null | undefined, d = 0) => (n == null ? "—" : n.toLocaleString("ro-RO", { maximumFractionDigits: d }));
const cur = (c: string | null) => (c === "EUR" ? "€" : c === "RON" ? "lei" : c ?? "");
const short = (v: number | null) => (v == null ? "?" : v >= 1000 ? `${(v / 1000).toLocaleString("ro-RO", { maximumFractionDigits: v >= 100_000 ? 0 : 1 })}k` : String(Math.round(v)));
const esc = (x: string) => x.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const cap = (s: string | null) => (s ? s.charAt(0) + s.slice(1).toLowerCase() : "");
const day = (s: string) => s.slice(0, 10).split("-").reverse().join(".");

export function MarketExplorer({ base, current: c, rows, points, total, page, pages, cats, types, sources }: {
  base: string; current: Q; rows: Row[]; points: Point[]; total: number; page: number; pages: number;
  cats: [string, string, number][]; types: [string, number][]; sources: [string, number][];
}) {
  const router = useRouter();
  const view = c.vezi === "lista" || c.vezi === "harta" ? c.vezi : "split";
  const href = (change: Partial<Q>) => {
    const next: Record<string, string | undefined> = { ...c, p: undefined, ...change };
    const qs = Object.entries(next).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v!)}`).join("&");
    return `${base}/piata${qs ? `?${qs}` : ""}`;
  };
  const go = (change: Partial<Q>) => router.replace(href(change), { scroll: false });

  // the text, the area: applied half a second after typing stops
  const [q, setQ] = useState(c.q ?? "");
  const [min, setMin] = useState(c.min ?? "");
  const [max, setMax] = useState(c.max ?? "");
  useEffect(() => {
    if (q.trim() === (c.q ?? "") && min === (c.min ?? "") && max === (c.max ?? "")) return;
    const t = setTimeout(() => go({ q: q.trim() || undefined, min: min || undefined, max: max || undefined }), 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, min, max]);

  // the split: width of the list (% of the row), dragged with the handle; remembered
  const split = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [left, setLeft] = useState(44);
  const [drag, setDrag] = useState(false);
  useEffect(() => { try { const v = Number(localStorage.getItem("vf-mk-split")); if (v >= 22 && v <= 78) setLeft(v); } catch { /* private window */ } }, []);
  const keep = (v: number) => { try { localStorage.setItem("vf-mk-split", String(Math.round(v))); } catch { /* not kept */ } window.dispatchEvent(new Event("resize")); };
  const startDrag = (e: React.PointerEvent) => {
    const box = split.current?.getBoundingClientRect();
    if (!box) return;
    e.preventDefault(); setDrag(true);
    let last = left;
    const move = (ev: PointerEvent) => { last = Math.min(78, Math.max(22, ((ev.clientX - box.left) / box.width) * 100)); setLeft(last); };
    const up = () => { setDrag(false); window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); keep(last); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  };
  const nudge = (d: number) => { const v = Math.min(78, Math.max(22, left + d)); setLeft(v); keep(v); };

  const [hover, setHover] = useState<string | null>(null);
  // the listing opened in the window (the same as in a report, without a subject)
  const [open, setOpen] = useState<{ id: string; lat: number | null; lng: number | null } | null>(null);
  const openId = useCallback((id: string) => { const p = points.find((x) => x.id === id); const r = rows.find((x) => x.id === id); setOpen({ id, lat: r?.lat ?? p?.lat ?? null, lng: r?.lng ?? p?.lng ?? null }); }, [points, rows]);
  const [picked, setPicked] = useState<string | null>(null);
  const reveal = useCallback((id: string) => {
    const box = list.current, row = box?.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"]`);
    if (!box || !row) return false;
    const top = row.offsetTop - box.offsetTop;
    if (top < box.scrollTop || top + row.offsetHeight > box.scrollTop + box.clientHeight) box.scrollTo({ top: top - box.clientHeight / 2 + row.offsetHeight / 2, behavior: "smooth" });
    return true;
  }, []);
  const onPick = useCallback((id: string) => { if (reveal(id)) setPicked(id); openId(id); }, [reveal, openId]);
  const onMapHover = useCallback((id: string | null) => { setHover(id); if (id) reveal(id); }, [reveal]);

  const pts = useMemo<ExplorerPoint[]>(() => points.map((p) => ({
    id: p.id, lat: p.lat, lng: p.lng, label: short(p.price), inactive: p.status !== "activ",
    tip: `<b>${esc(p.title ?? "Anunț")}</b><br><small>${p.price != null ? `${num(p.price)} ${cur(p.currency)}` : "la cerere"}${p.area ? ` · ${num(p.area)} m²` : ""} · ${esc(p.source)}</small>`,
  })), [points]);
  // the price cloud (€/m² of the filtered listings), as on Hartă prețuri; remembered
  const [heat, setHeat] = useState(false);
  const [spread, setSpread] = useState(500);
  useEffect(() => { try { setHeat(localStorage.getItem("vf-mk-heat") === "1"); const s = Number(localStorage.getItem("vf-mk-spread")); if ([300, 500, 800].includes(s)) setSpread(s); } catch { /* private window */ } }, []);
  const setHeatKeep = (v: boolean) => { setHeat(v); try { localStorage.setItem("vf-mk-heat", v ? "1" : "0"); } catch { /* not kept */ } };
  const setSpreadKeep = (v: number) => { setSpread(v); try { localStorage.setItem("vf-mk-spread", String(v)); } catch { /* not kept */ } };
  const cloudPts = useMemo(() => points.filter((p) => p.price_sqm != null && p.price_sqm > 0 && p.status === (c.st && c.st !== "activ" ? p.status : "activ"))
    .map((p) => ({ lat: p.lat, lng: p.lng, v: p.price_sqm! })), [points, c.st]);
  const scale = useMemo(() => cloudScale(cloudPts.map((p) => p.v)), [cloudPts]);
  const cloud = useMemo(() => (heat && scale ? { points: cloudPts, scale } : null), [heat, scale, cloudPts]);
  // sale and rent per m² are not comparable: say so when both are in the cloud
  const mixed = heat && !c.tr && rows.some((r) => r.transaction === "inchiriere") && rows.some((r) => r.transaction !== "inchiriere");
  const unit = c.tr === "inchiriere" ? "€/m²/lună" : "€/m²";
  const legendAt = (f: number) => (scale ? `${(scale.lo + (scale.hi - scale.lo) * f).toLocaleString("ro-RO", { maximumFractionDigits: c.tr === "inchiriere" ? 1 : 0 })}` : "");
  const legend = cloud && scale && (
    <div className="pxLegend mkLegend">
      <b>Nor de prețuri · {unit}</b>
      <i className="pxGrad" style={{ background: `linear-gradient(90deg, ${CLOUD_RAMP.join(", ")})` }} />
      <span className="pxGradLbl"><span>{legendAt(0)}</span><span>{legendAt(0.5)}</span><span>{legendAt(1)}</span></span>
      <small>{cloudPts.length} anunțuri cu preț / m² · intens = multe · estompat = puține</small>
      {mixed && <small className="mkWarn">Vânzare și închiriere amestecate: alege tranzacția.</small>}
    </div>
  );
  const heatCtl = (
    <span className="mkHeatCtl">
      <label className={`fsel toggle${heat ? " on" : ""}`} data-on={heat ? "" : undefined}><input type="checkbox" checked={heat} onChange={(e) => setHeatKeep(e.target.checked)} /> Nor de prețuri €/m²</label>
      {heat && <span className="segment" role="group" aria-label="Cât se întinde fiecare anunț">
        {([[300, "Detaliat"], [500, "Mediu"], [800, "Neted"]] as const).map(([v, t]) => <button key={v} type="button" aria-pressed={spread === v} title={`fiecare anunț acoperă ~${v} m`} onClick={() => setSpreadKeep(v)}>{t}</button>)}
      </span>}
    </span>
  );
  const active = [c.q, c.cat, c.tip, c.tr, c.src, c.st && c.st !== "activ" ? c.st : null, c.min || c.max, c.dup].filter(Boolean).length;

  const sel = (label: string, k: keyof Q, opts: [string, string][], all = "Toate") => (
    <label className="fsel" data-on={c[k] ? "" : undefined}><span>{label}</span>
      <select value={c[k] ?? ""} onChange={(e) => go({ [k]: e.target.value || undefined })}>
        <option value="">{all}</option>{opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );

  const cards = (
    <div className="mkExList" ref={list}>
      {rows.length === 0 ? <div className="empty">Niciun anunț pentru filtrele alese.</div> : rows.map((r) => (
        <a key={r.id} data-id={r.id} href={`${base}/piata/${r.id}`} className={`ldNear${hover === r.id || picked === r.id ? " hl" : ""}${r.status !== "activ" ? " gone" : ""}`}
          onMouseEnter={() => setHover(r.id)} onMouseLeave={() => setHover(null)}
          onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; e.preventDefault(); setPicked(r.id); openId(r.id); }}>
          {r.cover ? <img src={r.cover} alt="" loading="lazy" /> : <span className="ldNearNo">FOTO</span>}
          <span className="ldNearBody">
            <span className="ldNearTop">
              <span><small>{r.source} · {r.transaction === "inchiriere" ? "închiriere" : "vânzare"}{r.status !== "activ" ? ` · ${r.status}` : ""}</small>
                <b>{r.title ?? "Anunț"}</b>
                <em>{[[r.zone, r.city].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(", "), r.area ? `${num(r.area)} m²` : null].filter(Boolean).join(" · ")}</em></span>
              <span className="ldNearPrice"><b>{r.price != null ? `${num(r.price)} ${cur(r.currency)}` : "la cerere"}</b><em>{r.price_sqm != null ? `${num(r.price_sqm, r.transaction === "inchiriere" ? 2 : 0)} ${cur(r.currency)}/m²` : ""}</em></span>
            </span>
            <span className="mkTags">
              {r.category && <span className="ldNearTag">{cap(r.category)}{r.type ? ` · ${cap(r.type)}` : ""}</span>}
              {r.dup_group && <span className="ldNearTag">pe mai multe site-uri</span>}
              {r.lat == null && <span className="ldNearTag">fără coordonate</span>}
              <small className="muted">{day(r.changed_at ?? r.first_seen_at)}</small>
            </span>
          </span>
        </a>
      ))}
      {pages > 1 && (
        <div className="rgPager">
          <span className="muted">Pagina {page} din {pages}</span>
          <span className="actions">
            {page > 1 && <a className="btn btnGhost btnSm" href={href({ p: String(page - 1) })}>← Înapoi</a>}
            {page < pages && <a className="btn btnGhost btnSm" href={href({ p: String(page + 1) })}>Înainte →</a>}
          </span>
        </div>
      )}
    </div>
  );

  return (
    <section className={`card rgCardBox mkEx ${view}`}>
      <div className="filterBar">
        <input className="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Caută în titlu, descriere și pagina anunțului (ex. pod rulant, rampă)" aria-label="Caută" />
        {sel("Categorie", "cat", cats.map(([k, l, n]) => [k, `${l} (${n})`]))}
        {sel("Tip proprietate", "tip", types.map(([k, n]) => [k, `${cap(k)} (${n})`]))}
        {sel("Tranzacție", "tr", [["vanzare", "Vânzare"], ["inchiriere", "Închiriere"]])}
        {sel("Site", "src", sources.map(([k, n]) => [k, `${k} (${n})`]))}
        <label className="fsel" data-on={c.st && c.st !== "activ" ? "" : undefined}><span>Status</span>
          <select value={c.st ?? "activ"} onChange={(e) => go({ st: e.target.value === "activ" ? undefined : e.target.value })}>
            <option value="activ">Active</option><option value="inactiv">Dispărute</option><option value="expirat">Expirate</option><option value="all">Toate</option>
          </select>
        </label>
      </div>
      <div className="resultLine">
        <span className="mkExMeta">
          <b>{num(total)}</b> {total === 1 ? "anunț" : "anunțuri"} · {num(points.length)} pe hartă
          <span className="fsel rgRange" data-on={c.min || c.max ? "" : undefined}><span>m²</span>
            <input inputMode="numeric" value={min} onChange={(e) => setMin(e.target.value.replace(/\D/g, ""))} placeholder="de la" aria-label="Suprafața minimă" />
            <span className="muted">–</span>
            <input inputMode="numeric" value={max} onChange={(e) => setMax(e.target.value.replace(/\D/g, ""))} placeholder="până la" aria-label="Suprafața maximă" />
          </span>
          <label className={`fsel toggle${c.dup ? " on" : ""}`} data-on={c.dup ? "" : undefined}><input type="checkbox" checked={!!c.dup} onChange={(e) => go({ dup: e.target.checked ? "1" : undefined })} /> Și duplicatele</label>
          {view !== "lista" && heatCtl}
          {active > 0 && <a className="resetLink" href={`${base}/piata${view !== "split" ? `?vezi=${view}` : ""}`}>✕ Resetează filtrele ({active})</a>}
        </span>
        <span className="segment rgViews" role="group" aria-label="Vizualizare">
          {([["lista", "Listă"], ["split", "Listă + hartă"], ["harta", "Hartă"]] as const).map(([k, l]) => (
            <a key={k} href={href({ vezi: k === "split" ? undefined : k, p: c.p })} aria-pressed={view === k} onClick={(e) => { e.preventDefault(); go({ vezi: k === "split" ? undefined : k, p: c.p }); }}>{l}</a>
          ))}
        </span>
      </div>
      {view === "lista" ? cards : view === "harta" ? <div className="mkExMapOnly mkMapRel"><MarketMap points={pts} onPick={openId} cloud={cloud} spread={spread} />{legend}</div> : (
        <div className="rgSplit mkExSplit" ref={split} style={{ ["--rg-left" as string]: `${left}%` }}>
          {cards}
          <div className={`rgGutter${drag ? " drag" : ""}`} role="separator" aria-orientation="vertical" aria-label="Lățimea listei" aria-valuenow={Math.round(left)} aria-valuemin={22} aria-valuemax={78}
            tabIndex={0} onPointerDown={startDrag} onDoubleClick={() => nudge(44 - left)} onKeyDown={(e) => { if (e.key === "ArrowLeft") nudge(-3); if (e.key === "ArrowRight") nudge(3); }} />
          <div className="rgSplitMap mkMapRel"><MarketMap points={pts} hover={hover ?? picked} onPick={onPick} onHover={onMapHover} cloud={cloud} spread={spread} />{legend}</div>
        </div>
      )}
      {open && <ComparableModal c={{ id: open.id, score: null, parts: [], km: null, vsMedian: null, lat: open.lat, lng: open.lng }} base={base} onClose={() => setOpen(null)} />}
    </section>
  );
}
