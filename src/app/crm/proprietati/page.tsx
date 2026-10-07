import type { Metadata } from "next";
import { staffPage } from "@/lib/guard";
import { registry, registryFacets, REGISTRY_PAGE, REGISTRY_SORTS } from "@/lib/registry";
import { CrmShell } from "@/components/CrmShell";
import { RegistryView, type RegistryQuery } from "./RegistryView";
import { CAT_LABEL } from "@/lib/registry-labels";

export const metadata: Metadata = { title: "Proprietăți | CRM VALUEFY" };
export const dynamic = "force-dynamic";

const num = (v: number | null) => (v == null ? "—" : Math.round(v).toLocaleString("ro-RO"));

export default async function PropertiesPage({ searchParams }: { searchParams: Promise<RegistryQuery & { page?: string }> }) {
  const { db, user, base } = await staffPage();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const [data, facets] = await Promise.all([registry(db, { ...sp, page }), registryFacets(db, sp.county)]);
  const s = data.stats;
  const pages = Math.max(1, Math.ceil(s.n / REGISTRY_PAGE));
  const geoPct = s.n ? Math.round((s.geo / s.n) * 100) : 0;

  return (
    <CrmShell user={user} base={base} active="properties" title="Proprietăți" subtitle="Registrul proprietăților evaluate: istoric, valori și localizare pe hartă">
      <div className="dbKpis">
        <div className="dbKpi static">
          <span className="dbKpiLabel"><i style={{ background: "var(--ink)" }} />Proprietăți evaluate</span>
          <b>{s.n.toLocaleString("ro-RO")}</b>
          <span className="dbKpiFoot"><span className="dbDelta flat">{(s.valuations ?? 0).toLocaleString("ro-RO")} evaluări în total</span></span>
        </div>
        <div className="dbKpi static">
          <span className="dbKpiLabel"><i style={{ background: "var(--ok)" }} />Evaluate în ultimele 12 luni</span>
          <b>{s.recent.toLocaleString("ro-RO")}</b>
          <span className="dbKpiFoot"><span className="dbDelta flat">{s.n ? Math.round((s.recent / s.n) * 100) : 0}% din registru</span></span>
        </div>
        <div className="dbKpi static">
          <span className="dbKpiLabel"><i style={{ background: "var(--acc)" }} />Valoare medie / m²</span>
          <b>{num(s.sqm)} <small>lei</small></b>
          <span className="dbKpiFoot"><span className="dbDelta flat">valoare medie {num(s.value)} lei · {num(s.area)} m²</span></span>
        </div>
        <a className="dbKpi" href={`${base}/proprietati?${new URLSearchParams({ ...Object.fromEntries(Object.entries(sp).filter(([k, v]) => v && k !== "page" && k !== "vezi")), geo: "1", vezi: "harta" })}`}>
          <span className="dbKpiLabel"><i style={{ background: "var(--acc-text)" }} />Cu localizare pe hartă</span>
          <b>{s.geo.toLocaleString("ro-RO")}</b>
          <span className="dbKpiFoot"><span className="rgBar"><i style={{ width: `${geoPct}%` }} /></span><span className="dbDelta flat">{geoPct}%</span></span>
        </a>
      </div>

      <RegistryView
        base={base} current={sp} rows={data.rows} points={data.points} total={s.n} page={data.page} pages={pages}
        cats={facets.cats.map((x) => [x.k, CAT_LABEL[x.k] ?? x.k, x.n])}
        counties={facets.counties.map((x) => [x.k, x.k, x.n])}
        cities={facets.cities.map((x) => [x.k, x.k, x.n])}
        years={facets.years.map((x) => [x.k, x.k, x.n])}
        sorts={Object.entries(REGISTRY_SORTS).map(([k, [l]]) => [k, l])}
      />
    </CrmShell>
  );
}
