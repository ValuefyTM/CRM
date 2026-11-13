// The body of a market listing's page (gallery, data, map, history, price card), from the loaded data.
import { fmtDate } from "@/lib/guard";
import { CAT_LABEL } from "@/lib/registry-labels";
import { marketFile, type getMarketListing } from "@/lib/market/search";
import { Description, Gallery, ListingMap, type GalleryPhoto } from "./ListingView";

const n0 = (v: unknown, d = 0) => (typeof v === "number" ? v.toLocaleString("ro-RO", { maximumFractionDigits: d }) : "—");
const cur = (c: unknown) => (c === "EUR" ? "€" : c === "RON" ? "lei" : String(c ?? ""));
const day = (v: unknown) => (v ? fmtDate(String(v).slice(0, 10)) : null);
// the sites' own keys and values, in Romanian (Storia's are in English)
const KEY: Record<string, string> = {
  tva_inclus: "TVA inclus", Use_types: "Destinație", Media_types: "Utilități", Access_types: "Acces", Construction_status: "Stadiu construcție",
  Building_type: "Tip clădire", Area: "Suprafață (m²)", Terrain_area: "Teren (m²)", OfferType: "Tranzacție", ProperType: "Tip proprietate",
  construction_status: "Stadiu construcție", building_type: "Tip clădire", heating: "Încălzire", floor_no: "Etaj", building_floors_num: "Etaje clădire",
};
const VAL: Record<string, string> = {
  stock: "depozitare", manufacturing: "producție", office: "birouri", offices: "birouri", commercial: "comercial", service: "servicii", logistics: "logistică",
  water: "apă", electricity: "electricitate", sewage: "canalizare", gas: "gaz", internet: "internet", phone: "telefon", heating: "încălzire",
  asphalt: "asfaltat", concrete: "beton", dirt: "pământ", ready_to_use: "gata de utilizare", to_renovation: "de renovat", to_completion: "de finalizat", under_construction: "în construcție",
  inchiriere: "închiriere", vanzare: "vânzare", "depozite-hale": "depozite / hale",
};
const val = (v: unknown): string => (typeof v === "boolean" ? (v ? "Da" : "Nu") : v === "true" ? "Da" : v === "false" ? "Nu" : VAL[String(v)] ?? String(v ?? ""));
const show = (v: unknown) => (Array.isArray(v) ? v.map(val).join(", ") : v && typeof v === "object" ? JSON.stringify(v) : val(v));
const label = (k: string) => { const t = KEY[k] ?? k.replace(/_/g, " "); return t.charAt(0).toUpperCase() + t.slice(1); };
const EVENT: Record<string, [string, string]> = {
  nou: ["Apărut", "ok"], modificat: ["Modificat", "acc"], disparut: ["Dispărut din rezultate", "err"], reaparut: ["Reapărut", "ok"], expirat: ["Expirat pe site", "err"],
};
const STATUS: Record<string, [string, string]> = { activ: ["Activ", "pillOk"], inactiv: ["Dispărut din rezultate", "pillWarn"], expirat: ["Expirat", "pillErr"] };

/** The radius of an approximate location, in metres, from its description („aproximativă (rază 500 m)”, „… 3 km)”). */
function radiusOf(p: string | null) {
  if (!p || p.startsWith("exactă")) return null;
  const m = /rază ([\d.,]+) (m|km)/.exec(p);
  if (m) return Number(m[1].replace(",", ".")) * (m[2] === "km" ? 1000 : 1);
  return p.startsWith("aproximativă") ? 300 : null;
}

const Icon = ({ d }: { d: string }) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;
const I = {
  area: "M3 3h18v18H3zM3 9h18M9 21V9",
  build: "M4 21V8l8-5 8 5v13M9 21v-6h6v6",
  land: "M3 20h18M5 20l4-9 4 5 3-4 3 8",
  sqm: "M4 20 20 4M6 9a3 3 0 1 0 0-.01M18 15a3 3 0 1 0 0-.01",
  pin: "M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  cal: "M4 5h16v16H4zM4 10h16M9 3v4M15 3v4",
};

export function ListingDetail({ d, base }: { d: NonNullable<Awaited<ReturnType<typeof getMarketListing>>>; base: string }) {
  const l = d.listing;
  const rent = l.transaction === "inchiriere";
  const src = marketFile(l.source_key as string | null);
  const title = (l.title as string) || "Anunț";
  const place = [l.zone, l.city].filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).join(", ");
  const where = [l.address, place, l.county].filter(Boolean).join(" · ");
  // the photos saved in R2; when none is saved yet, the site's own addresses (shown without being stored)
  const saved = d.photos.filter((p) => p.r2_key);
  const photos: GalleryPhoto[] = saved.length ? saved.map((p) => ({ src: marketFile(p.r2_key)!, original: p.url, saved: true }))
    : d.photos.map((p) => ({ src: p.url, original: p.url, saved: false }));
  const feats = Object.entries(d.features).filter(([k, v]) => v != null && v !== "" && !/^(price|price_per_m|m|categorie_sursa|reactualizat|OfferType|ProperType|Area|Terrain_area)$/.test(k));
  const [stLabel, stCls] = STATUS[l.status] ?? [l.status, ""];
  const facts: [string, string, string | null][] = [
    [I.area, "Suprafață utilă", l.usable_area != null ? `${n0(l.usable_area)} m²` : null],
    [I.build, "Construită", l.built_area != null ? `${n0(l.built_area)} m²` : null],
    [I.land, "Teren", l.land_area != null ? `${n0(l.land_area)} m²` : null],
    [I.sqm, `Preț / m²${rent ? " / lună" : ""}`, l.price_sqm != null ? `${n0(l.price_sqm, 2)} ${cur(l.currency)}` : null],
    [I.cal, "Pe site din", day(l.src_created_at)],
  ];

  return (
      <div className="ldPage">
        <Gallery photos={photos} title={title} />

        <header className="ldHead">
          <div className="ldTags">
            <span className="ldTag dark">{rent ? "De închiriat" : "De vânzare"}</span>
            {l.category && <span className="ldTag">{CAT_LABEL[l.category] ?? l.category}</span>}
            <span className="ldTag">{l.source}</span>
            <span className={`pill ${stCls}`}><i />{stLabel}</span>
            {l.dup_group && <span className="pill pillWarn">Apare și în alte anunțuri</span>}
          </div>
          <h1 className="ldTitle">{title}</h1>
          {where && <p className="ldWhere"><Icon d={I.pin} />{where}</p>}
        </header>

        <div className="ldGrid">
          <div className="ldBody">

            <div className="ldFacts">
              {facts.filter(([, , v]) => v).map(([ic, k, v]) => (
                <div key={k}><span className="ldFactIc"><Icon d={ic} /></span><span><small>{k}</small><b>{v}</b></span></div>
              ))}
            </div>

            <section className="ldSection">
              <h2>Descriere</h2>
              {l.description ? <Description text={String(l.description)} /> : <p className="hint">Fără descriere (pagina anunțului nu a fost încă descărcată).</p>}
            </section>

            {feats.length > 0 && (
              <section className="ldSection">
                <h2>Caracteristici</h2>
                <dl className="ldFeats">{feats.map(([k, v]) => <div key={k}><dt>{label(k)}</dt><dd>{show(v)}</dd></div>)}</dl>
              </section>
            )}

            <section className="ldSection">
              <div className="ldSecHead"><h2>Localizare</h2>{l.geo_precision ? <span className="muted">{String(l.geo_precision)}</span> : null}</div>
              {l.lat != null && l.lng != null ? (
                <>
                  <ListingMap lat={Number(l.lat)} lng={Number(l.lng)} radiusM={radiusOf(l.geo_precision as string | null)} label={place || title} />
                  <p className="ldMapFoot">
                    <span className="mono">{Number(l.lat).toFixed(6)}, {Number(l.lng).toFixed(6)}</span>
                    <a href={`https://www.google.com/maps?q=${l.lat},${l.lng}`} target="_blank" rel="noreferrer">Google Maps ↗</a>
                    <a href={`https://www.openstreetmap.org/?mlat=${l.lat}&mlon=${l.lng}#map=17/${l.lat}/${l.lng}`} target="_blank" rel="noreferrer">OpenStreetMap ↗</a>
                  </p>
                </>
              ) : <div className="ldNoMap">Anunțul nu are încă coordonate: apar după descărcarea paginii lui.</div>}
            </section>

            {d.duplicates.length > 0 && (
              <section className="ldSection">
                <h2>Același imobil în alte anunțuri</h2>
                <p className="hint">Găsit după: {String(l.dup_reason ?? "")}. Verifică înainte de a le folosi ca comparabile separate.</p>
                <div className="ldDups">
                  {d.duplicates.map((x) => {
                    const c = marketFile(x.cover_key);
                    return (
                      <a key={x.id} className="ldDup" href={`${base}/piata/${x.id}`}>
                        {c ? <img src={c} alt="" loading="lazy" /> : <span className="ldDupNo" />}
                        <span><small>{x.source} · {x.status}</small><b>{x.title}</b>
                          <em>{x.price != null ? `${n0(x.price)} ${cur(x.currency)}` : "preț la cerere"}{x.area ? ` · ${n0(x.area)} m²` : ""}</em></span>
                      </a>
                    );
                  })}
                </div>
              </section>
            )}

            <section className="ldSection">
              <h2>Istoric</h2>
              {d.history.length === 0 ? <p className="hint">Fără evenimente încă.</p> : (
                <ol className="ldTimeline">
                  {d.history.map((h, i) => {
                    const [lab, tone] = EVENT[h.event] ?? [h.event, ""];
                    return (
                      <li key={i} className={tone}>
                        <span className="ldDot" />
                        <div><b>{lab}</b><small>{fmtDate(h.at, true)}</small></div>
                        <div className="ldTlVal">{h.price != null ? `${n0(h.price)} ${cur(h.currency)}` : "—"}{h.area ? <small>{n0(h.area)} m²</small> : null}
                          {h.source_key ? <a href={marketFile(h.source_key)!}>sursa</a> : null}</div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </section>
          </div>

          <aside className="ldSide">
            <div className="ldPriceCard">
              <small>{rent ? "Chirie cerută" : "Preț cerut"}</small>
              <div className="ldPrice">{l.price != null ? <>{n0(l.price)} <span>{cur(l.currency)}</span></> : "La cerere"}{rent && l.price != null && <em>/ lună</em>}</div>
              {l.price_sqm != null && <div className="ldPriceSqm">{n0(l.price_sqm, 2)} {cur(l.currency)} / m²{rent ? " / lună" : ""}</div>}
              <a className="btn btnGold" href={l.url} target="_blank" rel="noreferrer">Vezi anunțul pe {l.source} ↗</a>
              {src && <a className="btn btnGhost btnSm" href={src}>Descarcă sursa completă (json.gz)</a>}
              <dl className="ldMeta">
                <div><dt>Vânzător</dt><dd>{[l.seller_kind === "proprietar" ? "Proprietar" : l.seller_kind ? "Agenție" : null, l.seller_name].filter(Boolean).join(" · ") || "—"}</dd></div>
                {d.search && <div><dt>Găsit de</dt><dd>{d.search.name}</dd></div>}
                <div><dt>Văzut de noi</dt><dd>{day(l.first_seen_at)} – {day(l.last_seen_at)}</dd></div>
                {l.src_updated_at ? <div><dt>Modificat pe site</dt><dd>{day(l.src_updated_at)}</dd></div> : null}
                <div><dt>Ultima descărcare</dt><dd>{l.fetched_at ? fmtDate(String(l.fetched_at), true) : "încă nu"}</dd></div>
                <div><dt>Imagini salvate</dt><dd>{saved.length} din {d.photos.length}</dd></div>
                <div><dt>ID pe site</dt><dd className="mono">{String(l.ext_id)}</dd></div>
                {l.error ? <div><dt>Eroare</dt><dd style={{ color: "var(--err)" }}>{String(l.error)}</dd></div> : null}
              </dl>
              <p className="ldNote">Preț cerut în anunț, nu preț de tranzacție. Pentru comparabile se aplică ajustarea de negociere.</p>
            </div>
          </aside>
        </div>
      </div>
  );
}
