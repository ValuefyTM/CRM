"use client";
// The register: filters, and the properties as a list, a map, or both side by side (list ↔ map linked on hover).
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { FilterSelect } from "@/components/FilterSelect";
import type { RegistryPoint, RegistryRow } from "@/lib/registry";
import { RegistryMap } from "./RegistryMap";
import { CAT_COLOR, CAT_LABEL } from "@/lib/registry-labels";

export type RegistryQuery = { q?: string; cat?: string; county?: string; city?: string; year?: string; geo?: string; sort?: string; vezi?: string };
type Facet = [string, string, number?][];

const cap = (s: string | null) => (s ? s.charAt(0) + s.slice(1).toLowerCase() : "");
const lei = (v: number | null) => (v ? `${Math.round(v).toLocaleString("ro-RO")} lei` : "—");
const date = (d: string | null) => (d ? d.split("-").reverse().join(".") : "—");

export function RegistryView(p: {
  base: string; current: RegistryQuery; rows: RegistryRow[]; points: RegistryPoint[]; total: number; page: number; pages: number;
  cats: Facet; counties: Facet; cities: Facet; years: Facet; sorts: Facet;
}) {
  const router = useRouter();
  const c = p.current;
  const view = c.vezi === "lista" || c.vezi === "harta" ? c.vezi : "split";
  const [q, setQ] = useState(c.q ?? "");
  const [hover, setHover] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const list = useRef<HTMLDivElement>(null);

  const href = (change: Partial<RegistryQuery> & { page?: number }) => {
    const next: Record<string, string | number | undefined> = { ...c, page: undefined, ...change };
    const qs = Object.entries(next).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&");
    return `${p.base}/proprietati${qs ? `?${qs}` : ""}`;
  };
  const go = (change: Partial<RegistryQuery>) => router.push(href(change), { scroll: false });
  const active = [c.q, c.cat, c.county, c.city, c.year, c.geo].filter(Boolean).length;
  const withGeo = new Set(p.points.map((x) => x.id));

  // A dot clicked on the map: its row (if on this page) is marked and scrolled into view.
  const onPick = useCallback((id: string) => {
    setPicked(id);
    const row = list.current?.querySelector(`[data-id="${CSS.escape(id)}"]`);
    row?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, []);

  const rowProps = (r: RegistryRow) => ({
    "data-id": r.id, onMouseEnter: () => setHover(r.id), onMouseLeave: () => setHover(null),
    className: `${picked === r.id ? "picked" : ""}`,
  });

  const filters = (
    <>
      <form className="filterBar" onSubmit={(e) => { e.preventDefault(); go({ q: q.trim() || undefined }); }}>
        <input className="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Caută adresă, localitate, CF, nr. cadastral, nr. raport… ↵" aria-label="Caută" />
        <FilterSelect label="Categorie" value={c.cat ?? ""} options={p.cats} onChange={(v) => go({ cat: v || undefined })} />
        <FilterSelect label="Județ" value={c.county ?? ""} options={p.counties} onChange={(v) => go({ county: v || undefined, city: undefined })} all="Toate" />
        <FilterSelect label="Localitate" value={c.city ?? ""} options={p.cities} onChange={(v) => go({ city: v || undefined })} />
        <FilterSelect label="Evaluat în" value={c.year ?? ""} options={p.years} onChange={(v) => go({ year: v || undefined })} all="Orice an" />
        <label className={`fsel toggle${c.geo ? " on" : ""}`} data-on={c.geo ? "" : undefined}>
          <input type="checkbox" checked={!!c.geo} onChange={(e) => go({ geo: e.target.checked ? "1" : undefined })} />
          <span>Doar cu localizare</span>
        </label>
      </form>
      <div className="resultLine">
        <span>
          <b style={{ color: "var(--ink)" }}>{p.total.toLocaleString("ro-RO")}</b> proprietăți · <b style={{ color: "var(--ink)" }}>{p.points.length.toLocaleString("ro-RO")}</b> pe hartă
          {active > 0 && <> · <a className="resetLink" href={`${p.base}/proprietati${view !== "split" ? `?vezi=${view}` : ""}`}>✕ Resetează filtrele ({active})</a></>}
        </span>
        <span className="rgTools">
          {view !== "harta" && <FilterSelect label="Ordine" value={c.sort ?? ""} options={p.sorts.filter(([v]) => v)} onChange={(v) => go({ sort: v || undefined })} all="Evaluate recent" />}
          <span className="segment rgViews" role="group" aria-label="Vizualizare">
            {([["lista", "Listă", "M4 6h16M4 12h16M4 18h16"], ["split", "Split", "M3 4h18v16H3zM12 4v16"], ["harta", "Hartă", "M9 4l-6 2v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14"]] as const).map(([k, l, d]) => (
              <a key={k} href={href({ vezi: k === "split" ? undefined : k })} aria-pressed={view === k}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>{l}
              </a>
            ))}
          </span>
        </span>
      </div>
    </>
  );

  const pager = p.pages > 1 && (
    <div className="rgPager">
      <span className="muted">Pagina {p.page} din {p.pages}</span>
      <span className="actions">
        {p.page > 1 && <a className="btn btnGhost btnSm" href={href({ page: p.page - 1 })}>← Înapoi</a>}
        {p.page < p.pages && <a className="btn btnGhost btnSm" href={href({ page: p.page + 1 })}>Înainte →</a>}
      </span>
    </div>
  );

  const catTag = (raw: string | null) => {
    const cat = (raw ?? "").trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return CAT_LABEL[cat] ? <span className="rgCat" style={{ ["--c" as string]: CAT_COLOR[cat] }}>{CAT_LABEL[cat]}</span> : null;
  };
  const geoMark = (id: string) => withGeo.has(id)
    ? <span className="rgGeo" title="Are localizare pe hartă"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></svg></span>
    : null;

  const table = (
    <div className="tableWrap">
      <table className="table rgTable">
        <thead><tr><th>Proprietate</th><th>Localitate</th><th>Identificare</th><th className="r">Suprafață</th><th>Ultima evaluare</th><th className="r">Valoare</th><th className="r">Lei / m²</th><th className="r">Evaluări</th></tr></thead>
        <tbody>
          {p.rows.map((r) => (
            <tr key={r.id} {...rowProps(r)}>
              <td>
                <a className="rgName" href={`${p.base}/proprietati/${r.id}`}>{catTag(r.category)}<b>{cap(r.type) || "Proprietate"}</b>{geoMark(r.id)}</a>
                <div className="muted">{r.full_address ?? "—"}</div>
              </td>
              <td>{r.city ?? "—"}<div className="muted">{r.county}</div></td>
              <td className="mono small">{r.cf_number ? `CF ${r.cf_number}` : "—"}{r.cad_building && <div className="muted">cad. {r.cad_building}</div>}</td>
              <td className="r">{r.usable_area ? `${r.usable_area.toLocaleString("ro-RO")} m²` : "—"}</td>
              <td>{r.report_id ? <a className="ref" href={`${p.base}/rapoarte/${r.report_id}`}>{r.report_number ?? "raport"}</a> : null}<div className="muted">{date(r.last_date)}</div></td>
              <td className="r">{lei(r.value)}</td>
              <td className="r">{r.sqm ? Math.round(r.sqm).toLocaleString("ro-RO") : "—"}</td>
              <td className="r"><span className="dbNum">{r.valuations ?? 0}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const cards = (
    <div className="rgCards" ref={list}>
      {p.rows.map((r) => (
        <a key={r.id} href={`${p.base}/proprietati/${r.id}`} {...rowProps(r)} className={`rgCard${picked === r.id ? " picked" : ""}${hover === r.id ? " hover" : ""}`}>
          <span className="rgCardTop">{catTag(r.category)}{geoMark(r.id) ?? <span className="rgNoGeo">fără localizare</span>}<span className="rgCardDate">{date(r.last_date)}</span></span>
          <b>{cap(r.type) || "Proprietate"}</b>
          <small>{r.full_address ?? r.city ?? "—"}</small>
          <span className="rgCardNums">
            <span><em>Valoare</em>{lei(r.value)}</span>
            <span><em>Suprafață</em>{r.usable_area ? `${r.usable_area.toLocaleString("ro-RO")} m²` : "—"}</span>
            <span><em>Lei / m²</em>{r.sqm ? Math.round(r.sqm).toLocaleString("ro-RO") : "—"}</span>
            <span><em>Evaluări</em>{r.valuations ?? 0}</span>
          </span>
        </a>
      ))}
      {pager}
    </div>
  );

  return (
    <section className={`card rgCardBox ${view}`}>
      {filters}
      {p.rows.length === 0 && view !== "harta" ? <div className="empty">Nicio proprietate pentru filtrele alese.</div>
        : view === "lista" ? <>{table}{pager}</>
        : view === "harta" ? <RegistryMap points={p.points} base={p.base} height="calc(100vh - 330px)" />
        : (
          <div className="rgSplit">
            {cards}
            <div className="rgSplitMap"><RegistryMap points={p.points} base={p.base} hover={hover ?? picked} onPick={onPick} /></div>
          </div>
        )}
    </section>
  );
}
