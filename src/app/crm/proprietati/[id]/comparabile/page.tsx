import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { staffPage } from "@/lib/guard";
import { AREA, comparables, RADII, YEARS, type CompFilters } from "@/lib/comparables";
import { geolocateEnabled } from "@/lib/geolocate";
import { CrmShell } from "@/components/CrmShell";
import { LocateOne } from "../../LocateActions";
import { CompView } from "./CompView";

export const metadata: Metadata = { title: "Comparabile | CRM VALUEFY" };
export const dynamic = "force-dynamic";

const cap = (s: string | null) => (s ? s.charAt(0) + s.slice(1).toLowerCase() : "");
const n0 = (v: number | null | undefined) => (v == null ? "—" : Math.round(v).toLocaleString("ro-RO"));

export default async function ComparablesPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<CompFilters & { raport?: string }> }) {
  const { db, user, base } = await staffPage();
  const { id } = await params;
  const sp = await searchParams;
  const d = await comparables(db, id, sp);
  if (!d) notFound();
  const { subject: s, settings: st, stats } = d;
  const link = (change: Partial<CompFilters>) => {
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

  return (
    <CrmShell user={user} base={base} active="properties" title={`Comparabile · ${cap(s.type) || "Proprietate"}`} subtitle={s.full_address ?? s.city ?? ""}
      actions={<a className="btn btnGhost btnSm" href={back}>← {sp.raport ? "Raport" : "Fișa proprietății"}</a>}>
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
          {geolocateEnabled() && <LocateOne id={id} />}
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
              <span className="dbKpiLabel"><i style={{ background: "var(--acc)" }} />Mediană lei / m²</span>
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
              <b>{n0(stats?.estimate)} <small>lei</small></b>
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
        </>
      )}
    </CrmShell>
  );
}
