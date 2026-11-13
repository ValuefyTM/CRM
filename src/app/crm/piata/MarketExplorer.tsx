"use client";
// Analize de piață: the listings brought in from the portals as a list and a map side by side (an adjustable
// separator between them), with filters that apply by themselves.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MarketMap, type ExplorerPoint } from "@/components/MarketViews";

type Row = { id: string; source: string; url: string; title: string | null; category: string | null; type: string | null; transaction: string | null; price: number | null; currency: string | null;
  price_sqm: number | null; area: number | null; city: string | null; zone: string | null; county: string | null; lat: number | null; lng: number | null; geo_precision: string | null;
  status: string; dup_group: string | null; dup_reason: string | null; cover: string | null; first_seen_at: string; changed_at: string | null };
type Point = { id: string; lat: number; lng: number; price: number | null; currency: string | null; title: string | null; status: string; area: number | null; source: string };
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
  const [picked, setPicked] = useState<string | null>(null);
  const reveal = useCallback((id: string) => {
    const box = list.current, row = box?.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"]`);
    if (!box || !row) return false;
    const top = row.offsetTop - box.offsetTop;
    if (top < box.scrollTop || top + row.offsetHeight > box.scrollTop + box.clientHeight) box.scrollTo({ top: top - box.clientHeight / 2 + row.offsetHeight / 2, behavior: "smooth" });
    return true;
  }, []);
  const onPick = useCallback((id: string) => { if (!reveal(id)) window.location.href = `${base}/piata/${id}`; else setPicked(id); }, [reveal, base]);
  const onMapHover = useCallback((id: string | null) => { setHover(id); if (id) reveal(id); }, [reveal]);

  const pts = useMemo<ExplorerPoint[]>(() => points.map((p) => ({
    id: p.id, lat: p.lat, lng: p.lng, label: short(p.price), inactive: p.status !== "activ",
    tip: `<b>${esc(p.title ?? "Anunț")}</b><br><small>${p.price != null ? `${num(p.price)} ${cur(p.currency)}` : "la cerere"}${p.area ? ` · ${num(p.area)} m²` : ""} · ${esc(p.source)}</small>`,
  })), [points]);
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
          onMouseEnter={() => setHover(r.id)} onMouseLeave={() => setHover(null)}>
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
          {active > 0 && <a className="resetLink" href={`${base}/piata${view !== "split" ? `?vezi=${view}` : ""}`}>✕ Resetează filtrele ({active})</a>}
        </span>
        <span className="segment rgViews" role="group" aria-label="Vizualizare">
          {([["lista", "Listă"], ["split", "Listă + hartă"], ["harta", "Hartă"]] as const).map(([k, l]) => (
            <a key={k} href={href({ vezi: k === "split" ? undefined : k, p: c.p })} aria-pressed={view === k} onClick={(e) => { e.preventDefault(); go({ vezi: k === "split" ? undefined : k, p: c.p }); }}>{l}</a>
          ))}
        </span>
      </div>
      {view === "lista" ? cards : view === "harta" ? <div className="mkExMapOnly"><MarketMap points={pts} onPick={(id) => { window.location.href = `${base}/piata/${id}`; }} /></div> : (
        <div className="rgSplit mkExSplit" ref={split} style={{ ["--rg-left" as string]: `${left}%` }}>
          {cards}
          <div className={`rgGutter${drag ? " drag" : ""}`} role="separator" aria-orientation="vertical" aria-label="Lățimea listei" aria-valuenow={Math.round(left)} aria-valuemin={22} aria-valuemax={78}
            tabIndex={0} onPointerDown={startDrag} onDoubleClick={() => nudge(44 - left)} onKeyDown={(e) => { if (e.key === "ArrowLeft") nudge(-3); if (e.key === "ArrowRight") nudge(3); }} />
          <div className="rgSplitMap"><MarketMap points={pts} hover={hover ?? picked} onPick={onPick} onHover={onMapHover} /></div>
        </div>
      )}
    </section>
  );
}
