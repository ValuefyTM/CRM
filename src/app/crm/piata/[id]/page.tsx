import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { staffPage, fmtDate } from "@/lib/guard";
import { CrmShell } from "@/components/CrmShell";
import { CAT_LABEL } from "@/lib/registry-labels";
import { getMarketListing, marketFile } from "@/lib/market/search";

export const metadata: Metadata = { title: "Anunț de piață | CRM VALUEFY" };
export const dynamic = "force-dynamic";

const n0 = (v: unknown, d = 0) => (typeof v === "number" ? v.toLocaleString("ro-RO", { maximumFractionDigits: d }) : "—");
const cur = (c: unknown) => (c === "EUR" ? "€" : c === "RON" ? "lei" : String(c ?? ""));
const EVENT: Record<string, string> = { nou: "Apărut", modificat: "Modificat", disparut: "Dispărut din rezultate", reaparut: "Reapărut", expirat: "Expirat pe site" };
const show = (v: unknown) => (Array.isArray(v) ? v.join(", ") : v && typeof v === "object" ? JSON.stringify(v) : String(v ?? ""));

export default async function MarketListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { db, user, base } = await staffPage("market");
  const d = await getMarketListing(db, (await params).id);
  if (!d) notFound();
  const l = d.listing;
  const rent = l.transaction === "inchiriere";
  const src = marketFile(l.source_key as string | null);
  const map = l.lat != null ? `https://www.openstreetmap.org/?mlat=${l.lat}&mlon=${l.lng}#map=17/${l.lat}/${l.lng}` : null;

  return (
    <CrmShell back={{ href: `${base}/piata`, label: "Anunțuri de piață" }} user={user} base={base} active="market" title={l.title ?? "Anunț"}
      subtitle={[l.source, CAT_LABEL[l.category ?? ""] ?? l.category, rent ? "închiriere" : "vânzare", [l.zone, l.city].filter(Boolean).join(", ")].filter(Boolean).join(" · ")}>
      <div className="cols">
        <div style={{ display: "flex", flexDirection: "column", gap: 18, minWidth: 0 }}>
          <section className="card">
            <div className="cardHead"><h2>Imagini</h2><span className="muted">{d.photos.filter((p) => p.r2_key).length} din {d.photos.length} salvate</span></div>
            {d.photos.length === 0 ? <p className="hint">Anunțul nu are imagini (sau pagina lui nu a fost încă descărcată).</p> : (
              <div className="mkGallery">
                {d.photos.map((p) => {
                  const u = marketFile(p.r2_key);
                  return u ? <a key={p.position} href={u} target="_blank" rel="noreferrer"><img src={u} alt="" loading="lazy" /></a>
                    : <a key={p.position} href={p.url} target="_blank" rel="noreferrer" title={p.error ?? "nedescărcată încă"} style={{ display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11 }} className="muted">nedescărcată ↗</a>;
                })}
              </div>
            )}
          </section>
          <section className="card">
            <h2>Descriere</h2>
            {l.description ? <p className="mkDesc">{String(l.description)}</p> : <p className="hint">Fără descriere.</p>}
          </section>
          {Object.keys(d.features).length > 0 && (
            <section className="card">
              <h2>Caracteristici de pe site</h2>
              <dl className="kv">{Object.entries(d.features).filter(([, v]) => v != null && v !== "").map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{show(v)}</dd></div>)}</dl>
            </section>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18, minWidth: 0 }}>
          <section className="card">
            <div className="cardHead"><h2>Date cheie</h2><a className="btn btnGold btnSm" href={l.url} target="_blank" rel="noreferrer">Anunțul pe {l.source} ↗</a></div>
            <dl className="kv">
              <div><dt>Preț</dt><dd><b>{l.price != null ? `${n0(l.price)} ${cur(l.currency)}${rent ? " / lună" : ""}` : "la cerere"}</b></dd></div>
              <div><dt>Preț / m²</dt><dd>{l.price_sqm != null ? `${n0(l.price_sqm, 2)} ${cur(l.currency)}${rent ? " / lună" : ""}` : "—"}</dd></div>
              <div><dt>Suprafață utilă</dt><dd>{l.usable_area != null ? `${n0(l.usable_area)} m²` : "—"}</dd></div>
              {l.built_area != null && <div><dt>Suprafață construită</dt><dd>{n0(l.built_area)} m²</dd></div>}
              {l.land_area != null && <div><dt>Suprafață teren</dt><dd>{n0(l.land_area)} m²</dd></div>}
              <div><dt>Localizare</dt><dd>{[l.address, l.zone, l.city, l.county].filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).join(", ") || "—"}</dd></div>
              <div><dt>Coordonate</dt><dd>{map ? <a href={map} target="_blank" rel="noreferrer">{Number(l.lat).toFixed(5)}, {Number(l.lng).toFixed(5)}</a> : "—"}{l.geo_precision ? <div className="muted">{String(l.geo_precision)}</div> : null}</dd></div>
              <div><dt>Vânzător</dt><dd>{[l.seller_kind === "proprietar" ? "proprietar" : l.seller_kind ? "agenție" : null, l.seller_name].filter(Boolean).join(" · ") || "—"}</dd></div>
              <div><dt>Status</dt><dd>{l.status}{d.search ? <div className="muted">găsit de „{d.search.name}”</div> : null}</dd></div>
              <div><dt>Pe site din</dt><dd>{l.src_created_at ? fmtDate(String(l.src_created_at).slice(0, 10)) : "—"}{l.src_updated_at ? <div className="muted">modificat pe site {fmtDate(String(l.src_updated_at).slice(0, 10))}</div> : null}</dd></div>
              <div><dt>Văzut de noi</dt><dd>{fmtDate(String(l.first_seen_at).slice(0, 10))} – {fmtDate(String(l.last_seen_at).slice(0, 10))}</dd></div>
              <div><dt>Ultima descărcare</dt><dd>{l.fetched_at ? fmtDate(String(l.fetched_at), true) : "încă nu"}{src ? <div><a href={src}>sursa completă a paginii (json.gz)</a></div> : null}</dd></div>
              <div><dt>ID pe site</dt><dd className="mono">{String(l.ext_id)}</dd></div>
              {l.error ? <div><dt>Eroare</dt><dd style={{ color: "var(--err)" }}>{String(l.error)}</dd></div> : null}
            </dl>
          </section>
          {d.duplicates.length > 0 && (
            <section className="card">
              <h2>Același imobil pe alte anunțuri</h2>
              <p className="hint">Găsit după: {String(l.dup_reason ?? "")}. Verifică înainte de a le folosi ca comparabile separate.</p>
              <ul className="tdList">
                {d.duplicates.map((x) => (
                  <li key={x.id}><a className="tdTitle" href={`${base}/piata/${x.id}`}>{x.title}</a>
                    <span className="tdMeta">{x.source} · {x.price != null ? `${n0(x.price)} ${cur(x.currency)}` : "la cerere"} · {x.area ? `${n0(x.area)} m²` : "—"} · {x.status}</span></li>
                ))}
              </ul>
            </section>
          )}
          <section className="card">
            <h2>Istoric</h2>
            {d.history.length === 0 ? <p className="hint">Fără evenimente încă.</p> : (
              <dl className="kv">
                {d.history.map((h, i) => (
                  <div key={i}><dt>{fmtDate(h.at, true)}<div className="muted">{EVENT[h.event] ?? h.event}</div></dt>
                    <dd>{h.price != null ? `${n0(h.price)} ${cur(h.currency)}` : "—"}{h.area ? <div className="muted">{n0(h.area)} m²</div> : null}
                      {h.source_key ? <div><a href={marketFile(h.source_key)!}>sursa</a></div> : null}</dd></div>
                ))}
              </dl>
            )}
          </section>
        </div>
      </div>
    </CrmShell>
  );
}
