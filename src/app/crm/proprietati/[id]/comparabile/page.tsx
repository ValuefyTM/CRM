import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { staffPage } from "@/lib/guard";
import { AREA, comparables, RADII, YEARS, type CompFilters } from "@/lib/comparables";
import { can } from "@/lib/perms";
import { mySql, propertyInScope, propertyScope } from "@/lib/perms-db";
import { CrmShell } from "@/components/CrmShell";
import { LocateOne } from "../../LocateActions";
import { CompView } from "./CompView";
import { marketFile, nearbyMarket } from "@/lib/market/search";

export const metadata: Metadata = { title: "Comparabile | CRM VALUEFY" };
export const dynamic = "force-dynamic";

const cap = (s: string | null) => (s ? s.charAt(0) + s.slice(1).toLowerCase() : "");
const n0 = (v: number | null | undefined) => (v == null ? "—" : Math.round(v).toLocaleString("ro-RO"));

export default async function ComparablesPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<CompFilters & { raport?: string; piata?: string }> }) {
  const { db, user, base } = await staffPage("properties");
  const { id } = await params;
  const sp = await searchParams;
  // The subject and the comparables: only among the properties of the user's scope (Proprietăți, „Pe ce date”).
  const d = (await propertyInScope(db, user, id)) ? await comparables(db, id, sp, propertyScope(user)) : null;
  if (!d) notFound();
  // The reports behind the comparables open only for their team (or with "reports.all").
  if (!can(user, "reports.all")) {
    const ids = [...new Set(d.rows.map((r) => r.report_id).filter(Boolean))] as string[];
    const ok = new Set<string>();
    for (let i = 0; i < ids.length; i += 90) {
      const part = ids.slice(i, i + 90);
      const { results } = await db.prepare(`SELECT r.id FROM reports r WHERE r.id IN (${part.map(() => "?").join(",")}) AND ${mySql(user)}`).bind(...part, user.id).all<{ id: string }>();
      results.forEach((x) => ok.add(x.id));
    }
    d.rows.forEach((r) => { r.open = !r.report_id || ok.has(r.report_id); });
  }
  const { subject: s, settings: st, stats } = d;
  const link = (change: Partial<CompFilters> & { piata?: string }) => {
    const next: Record<string, string | undefined> = { ...sp, ...change };
    const qs = Object.entries(next).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v!)}`).join("&");
    return `${base}/proprietati/${id}/comparabile${qs ? `?${qs}` : ""}`;
  };
  const seg = (label: string, opts: [string, string][], cur: string, key: keyof CompFilters) => (
    <span className="cpSeg"><em>{label}</em>
      <span className="segment">{opts.map(([v, l]) => <a key={v} href={link({ [key]: v })} aria-pressed={cur === v}>{l}</a>)}</span>
    </span>
  );
  const own = s.usable_area && s.value ? s.value / s.usable_area : null;
  const back = sp.raport ? `${base}/rapoarte/${sp.raport}?tab=bunuri` : `${base}/proprietati/${id}`;
  // Market listings around it (Anunțuri de piață): same category, same radius and area filter, sale or rent.
  const tr = sp.piata === "inchiriere" ? "inchiriere" : "vanzare";
  const market = can(user, "market") && d.ll
    ? await nearbyMarket(db, d.ll, { category: s.category, transaction: tr, area: s.usable_area, tol: st.tol, radiusKm: Math.max(st.radius, 2), limit: 40 }).catch(() => null)
    : null;

  return (
    <CrmShell back={{ href: back, label: sp.raport ? "Raport" : "Fișa proprietății" }} user={user} base={base} active="properties" title={`Comparabile · ${cap(s.type) || "Proprietate"}`} subtitle={s.full_address ?? s.city ?? ""}>
      <section className="card cpFilters">
        {seg("Rază", RADII.map((r) => [r, `${r.replace(".", ",")} km`]), String(st.radius), "raza")}
        {seg("Evaluate în ultimii", YEARS, String(st.years), "ani")}
        {seg("Potrivire", [["tip", cap(s.type) || "Același tip"], ["categorie", "Aceeași categorie"]], st.sameType ? "tip" : "categorie", "potrivire")}
        {s.usable_area ? seg(`Suprafață (${s.usable_area.toLocaleString("ro-RO")} m²)`, AREA, String(st.tol), "supr") : null}
      </section>

      {!d.ll ? (
        <section className="card">
          <h2>Proprietatea nu are coordonate</h2>
          <p className="hint">Comparabilele se caută în jurul proprietății. Pune-o întâi pe hartă (din cadastru sau la inspecție, prin GPS).</p>
          <LocateOne id={id} />
        </section>
      ) : (
        <>
          <div className="dbKpis">
            <div className="dbKpi static">
              <span className="dbKpiLabel"><i style={{ background: "var(--ink)" }} />Comparabile găsite</span>
              <b>{stats?.n ?? 0}</b>
              <span className="dbKpiFoot"><span className="dbDelta flat">pe o rază de {String(st.radius).replace(".", ",")} km{stats && stats.n >= 80 ? " · cele mai apropiate 80" : ""}</span></span>
            </div>
            <div className="dbKpi static">
              <span className="dbKpiLabel"><i style={{ background: "var(--acc)" }} />Mediană € / m²</span>
              <b>{n0(stats?.median)}</b>
              <span className="dbKpiFoot"><span className="dbDelta flat">medie {n0(stats?.mean)} · min {n0(stats?.min)} · max {n0(stats?.max)}</span></span>
            </div>
            <div className="dbKpi static">
              <span className="dbKpiLabel"><i style={{ background: "var(--ok)" }} />Interval P25 – P75</span>
              <b style={{ fontSize: 20 }}>{n0(stats?.p25)} – {n0(stats?.p75)}</b>
              <span className="dbKpiFoot"><span className="dbDelta flat">jumătatea de mijloc a valorilor / m²</span></span>
            </div>
            <div className="dbKpi static">
              <span className="dbKpiLabel"><i style={{ background: "var(--acc-text)" }} />Valoare indicativă</span>
              <b>{n0(stats?.estimate)} <small>€</small></b>
              <span className="dbKpiFoot">
                <span className="dbDelta flat">{s.usable_area ? `mediana × ${s.usable_area.toLocaleString("ro-RO")} m²` : "fără suprafață"}</span>
                {own && stats?.median ? <span className={`dbDelta ${Math.abs(own - stats.median) / stats.median < 0.15 ? "up" : "down"}`} title="ultima evaluare a proprietății">propria evaluare {n0(own)} lei/m²</span> : null}
              </span>
            </div>
          </div>
          <section className="card flush">
            <div className="cardHead"><h2>Comparabile pe hartă</h2><span className="muted">Valorile sunt cele din rapoartele VALUEFY (ultima evaluare a fiecărei proprietăți), orientative.</span></div>
            {d.rows.length === 0 ? <p className="hint pad">Nicio proprietate evaluată în zonă pentru criteriile alese. Mărește raza sau perioada.</p> : (
              <CompView rows={d.rows} base={base} median={stats?.median ?? null} p25={stats?.p25 ?? null} p75={stats?.p75 ?? null}
                subject={{ lat: d.ll[0], lng: d.ll[1], radiusKm: st.radius, label: `${cap(s.type) || "Proprietatea"} evaluată` }} />
            )}
          </section>
          {market && (
            <section className="card">
              <div className="cardHead">
                <h2>Anunțuri de piață în zonă</h2>
                <span className="segment">
                  <a href={link({ piata: undefined })} aria-pressed={tr === "vanzare"}>Vânzare</a>
                  <a href={link({ piata: "inchiriere" })} aria-pressed={tr === "inchiriere"}>Închiriere</a>
                </span>
              </div>
              <p className="hint">
                Prețuri cerute în anunțuri ({s.category ? s.category.toLowerCase() : "orice categorie"}, rază {Math.max(st.radius, 2).toString().replace(".", ",")} km{s.usable_area && st.tol ? `, suprafață ±${st.tol}%` : ""}), câte unul din fiecare grup de duplicate.
                {market.stats.median != null && <> Mediană {n0(market.stats.median)} € / m²{tr === "inchiriere" ? " / lună" : ""} (P25 {n0(market.stats.p25)} – P75 {n0(market.stats.p75)}).</>}
              </p>
              {market.rows.length === 0 ? <p className="hint">Niciun anunț în zonă pentru criteriile alese. <a href={`${base}/piata`}>Anunțuri de piață</a></p> : (
                <div className="tableWrap">
                  <table className="table">
                    <thead><tr><th>Anunț</th><th className="r">Distanță</th><th className="r">Suprafață</th><th className="r">Preț</th><th className="r">€ / m²</th></tr></thead>
                    <tbody>
                      {market.rows.map((r) => (
                        <tr key={r.id}>
                          <td><span className="mkName">
                            {r.cover_key ? <img className="mkThumb" src={marketFile(r.cover_key)!} alt="" loading="lazy" /> : <span className="mkThumb none">fără foto</span>}
                            <span><a href={`${base}/piata/${r.id}`}>{r.title ?? "Anunț"}</a><span className="mkSrc">{r.source} · {r.city ?? ""}{r.geo_precision ? ` · ${r.geo_precision}` : ""}</span></span>
                          </span></td>
                          <td className="r">{r.km != null ? `${r.km.toLocaleString("ro-RO", { maximumFractionDigits: 2 })} km` : "—"}</td>
                          <td className="r">{r.area ? `${n0(r.area)} m²` : "—"}</td>
                          <td className="r">{r.price != null ? `${n0(r.price)} ${r.currency === "EUR" ? "€" : r.currency ?? ""}` : "la cerere"}</td>
                          <td className="r">{r.price_sqm != null ? r.price_sqm.toLocaleString("ro-RO", { maximumFractionDigits: 2 }) : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
        </>
      )}
    </CrmShell>
  );
}
