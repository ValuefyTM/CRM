import type { Metadata } from "next";
import { can } from "@/lib/perms";
import { staffPage, fmtDate } from "@/lib/guard";
import { CrmShell } from "@/components/CrmShell";
import { CAT_LABEL } from "@/lib/registry-labels";
import { SOURCES } from "@/lib/market/sites";
import { listMarket, marketFile, marketStatus, PAGE, STATUSES, TRANSACTIONS, type MarketFilters } from "@/lib/market/search";
import { RunNow, Searches } from "./MarketClient";

export const metadata: Metadata = { title: "Anunțuri de piață | CRM VALUEFY" };
export const dynamic = "force-dynamic";

const n0 = (v: number | null | undefined, d = 0) => (v == null ? "—" : v.toLocaleString("ro-RO", { maximumFractionDigits: d }));
const money = (v: number | null, c: string | null) => (v == null ? "la cerere" : `${n0(v)} ${c === "EUR" ? "€" : c === "RON" ? "lei" : c ?? ""}`);
const STAT_LABEL: Record<string, string> = {
  pagini: "pagini de rezultate", anunturi_vazute: "anunțuri văzute", anunturi_noi: "noi", nemodificate: "nemodificate (nedescărcate)", de_descarcat: "de descărcat",
  descarcate_noi: "descărcate", modificate: "modificate", neschimbate: "fără schimbări", expirate: "expirate", devenite_inactive: "dispărute",
  reaparute: "reapărute", anunturi_esuate: "eșuate", pagini_esuate: "pagini eșuate", grupuri_duplicate: "grupuri de duplicate", rulari_apify: "rulări Apify",
};

/** Market listings (imobiliare.ro, storia.ro, olx.ro, publi24.ro, homezz.ro), brought in every night: comparables for the valuations. */
export default async function MarketPage({ searchParams }: { searchParams: Promise<MarketFilters> }) {
  const { db, user, base } = await staffPage("market");
  const sp = await searchParams;
  const [{ rows, total, page }, status] = await Promise.all([listMarket(db, sp), marketStatus(db)]);
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const edit = can(user, "market:searches");
  const href = (change: Partial<MarketFilters>) => {
    const next = { ...sp, ...change } as Record<string, string | undefined>;
    const qs = Object.entries(next).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v!)}`).join("&");
    return `${base}/piata${qs ? `?${qs}` : ""}`;
  };
  const running = status.runs.find((r) => r.status === "running");
  const queue = (kind: string, st: string) => status.queue.filter((q) => q.kind === kind && st.split(",").includes(q.status)).reduce((t, q) => t + q.n, 0);
  const cats = Object.entries(CAT_LABEL);

  return (
    <CrmShell user={user} base={base} active="market" title="Anunțuri de piață" subtitle="Comparabile de pe imobiliare.ro, storia.ro, olx.ro, publi24.ro și homezz.ro, aduse în fiecare noapte">
      <div className="dbKpis">
        <div className="dbKpi static">
          <span className="dbKpiLabel"><i style={{ background: "var(--ok)" }} />Anunțuri active</span>
          <b>{n0(status.counts.activ ?? 0)}</b>
          <span className="dbKpiFoot"><span className="dbDelta flat">{n0(status.counts.inactiv ?? 0)} dispărute · {n0(status.counts.expirat ?? 0)} expirate</span></span>
        </div>
        <div className="dbKpi static">
          <span className="dbKpiLabel"><i style={{ background: "var(--acc)" }} />Căutări</span>
          <b>{status.searches.filter((s) => s.enabled).length}</b>
          <span className="dbKpiFoot"><span className="dbDelta flat">{status.searches.length} în total</span></span>
        </div>
        <div className="dbKpi static">
          <span className="dbKpiLabel"><i style={{ background: "var(--ink)" }} />Ultima rulare</span>
          <b style={{ fontSize: 18 }}>{status.runs[0] ? fmtDate(status.runs[0].started_at, true) : "—"}</b>
          <span className="dbKpiFoot"><span className="dbDelta flat">{running ? "în desfășurare" : status.runs[0] ? `${status.runs[0].stats.anunturi_noi ?? 0} noi · ${status.runs[0].stats.modificate ?? 0} modificate` : "încă nu a rulat"}</span></span>
        </div>
      </div>

      <div className="cols">
        <section className="card" style={{ minWidth: 0 }}>
          <form className="filterBar" method="get" action={`${base}/piata`}>
            <input className="search" name="q" defaultValue={sp.q ?? ""} placeholder="Caută în titlu, descriere și pagina anunțului (ex. pod rulant, rampă, trifazic)" aria-label="Caută" />
            <label className="fsel"><span>Categorie</span><select name="cat" defaultValue={sp.cat ?? ""}><option value="">Toate</option>{cats.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
            <label className="fsel"><span>Tranzacție</span><select name="tr" defaultValue={sp.tr ?? ""}><option value="">Toate</option>{TRANSACTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
            <label className="fsel"><span>Site</span><select name="src" defaultValue={sp.src ?? ""}><option value="">Toate</option>{SOURCES.map((x) => <option key={x}>{x}</option>)}</select></label>
            <label className="fsel"><span>Status</span><select name="st" defaultValue={sp.st ?? "activ"}>{STATUSES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          </form>
          <form className="filterBar" method="get" action={`${base}/piata`}>
            {(["q", "cat", "tr", "src", "st"] as const).map((k) => sp[k] ? <input key={k} type="hidden" name={k} value={sp[k]} /> : null)}
            <input className="input" style={{ flex: "1 1 160px" }} name="loc" defaultValue={sp.loc ?? ""} placeholder="Localitate / zonă" />
            <input className="input" style={{ width: 110 }} name="min" inputMode="numeric" defaultValue={sp.min ?? ""} placeholder="m² de la" />
            <input className="input" style={{ width: 110 }} name="max" inputMode="numeric" defaultValue={sp.max ?? ""} placeholder="m² până la" />
            <label className="check" style={{ alignItems: "center" }}><input type="checkbox" name="dup" value="1" defaultChecked={sp.dup === "1"} /> Și duplicatele</label>
            <button type="submit" className="btn btnNavy btnSm">Filtrează</button>
          </form>
          <div className="resultLine" style={{ margin: "12px 0" }}>
            <span className="muted">{n0(total)} anunțuri{Object.values(sp).some(Boolean) && <> · <a className="resetLink" href={`${base}/piata`}>✕ Resetează filtrele</a></>}</span>
          </div>
          {rows.length === 0 ? (
            <div className="empty">{(status.counts.activ ?? 0) + (status.counts.inactiv ?? 0) ? "Niciun anunț pentru filtrele alese." : "Încă nu a fost adus niciun anunț. Prima rulare pornește la noapte; o poți porni și acum, cu „Rulează acum”."}</div>
          ) : (
            <div className="tableWrap">
              <table className="table">
                <thead><tr><th>Anunț</th><th>Localitate</th><th className="r">Suprafață</th><th className="r">Preț</th><th className="r">€ / m²</th><th>Văzut</th></tr></thead>
                <tbody>
                  {rows.map((r) => {
                    const cover = marketFile(r.cover_key);
                    return (
                      <tr key={r.id}>
                        <td>
                          <span className="mkName">
                            {cover ? <img className="mkThumb" src={cover} alt="" loading="lazy" /> : <span className="mkThumb none">fără foto</span>}
                            <span>
                              <a href={`${base}/piata/${r.id}`}>{r.title ?? "Anunț"}</a>
                              <span className="mkSrc">{r.source} · {CAT_LABEL[r.category ?? ""] ?? r.category ?? "—"} · {r.transaction === "inchiriere" ? "închiriere" : "vânzare"}{r.status !== "activ" ? ` · ${r.status}` : ""}</span>
                              {r.dup_group && <span className="mkDup">apare și pe alte site-uri ({r.dup_reason})</span>}
                            </span>
                          </span>
                        </td>
                        <td>{r.city ?? "—"}<div className="muted">{r.zone ?? r.county ?? ""}</div></td>
                        <td className="r">{r.area ? `${n0(r.area)} m²` : "—"}</td>
                        <td className="r">{money(r.price, r.currency)}{r.transaction === "inchiriere" && r.price ? <div className="muted">/ lună</div> : null}</td>
                        <td className="r">{n0(r.price_sqm, 2)}</td>
                        <td>{fmtDate((r.changed_at ?? r.first_seen_at).slice(0, 10))}<div className="muted">{r.lat ? (r.geo_precision ?? "pe hartă") : "fără coordonate"}</div></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {pages > 1 && (
            <div className="rgPager">
              <span className="muted">Pagina {page} din {pages}</span>
              <span className="actions">
                {page > 1 && <a className="btn btnGhost btnSm" href={href({ p: String(page - 1) })}>← Înapoi</a>}
                {page < pages && <a className="btn btnGhost btnSm" href={href({ p: String(page + 1) })}>Înainte →</a>}
              </span>
            </div>
          )}
        </section>

        <div style={{ display: "flex", flexDirection: "column", gap: 18, minWidth: 0 }}>
          <section className="card">
            <div className="cardHead"><h2>Rulare</h2><span className="actions">{edit && !running && <RunNow />}{edit && <a className="btn btnGhost btnSm" href={`${base}/setari/piata`}>Panoul de comandă →</a>}</span></div>
            {running ? (
              <div className="mkRun">
                <b>În desfășurare din {fmtDate(running.started_at, true)}</b>
                <span>Pagini de rezultate: {queue("list", "done")} citite, {queue("list", "pending,running,processing")} în lucru</span>
                <span>Anunțuri: {queue("detail", "done")} descărcate, {queue("detail", "pending,running,processing")} în coadă, {queue("detail", "error")} eșuate</span>
              </div>
            ) : <p className="hint">Rulează în fiecare noapte la 01:07 (ora României). Anunțurile al căror preț, suprafață și titlu nu s-au schimbat nu se mai descarcă.</p>}
            {status.runs.filter((r) => r.status === "done").slice(0, 3).map((r) => (
              <details key={r.id}>
                <summary className="hint">{fmtDate(r.started_at, true)} · {r.trigger === "manual" ? "pornită manual" : "noaptea"} · {r.stats.anunturi_noi ?? 0} noi, {r.stats.modificate ?? 0} modificate</summary>
                <dl className="kv">{Object.entries(r.stats).map(([k, v]) => <div key={k}><dt>{STAT_LABEL[k] ?? k}</dt><dd>{n0(v)}</dd></div>)}</dl>
              </details>
            ))}
          </section>
          <section className="card">
            <h2>Căutări</h2>
            <p className="hint">Fiecare căutare e o pagină de rezultate de pe un site, cu filtrele dorite. Paginile se parcurg automat până la ultima.</p>
            <Searches rows={status.searches} sources={SOURCES} categories={cats} edit={edit} />
          </section>
        </div>
      </div>
    </CrmShell>
  );
}
