import type { Metadata } from "next";
import { can } from "@/lib/perms";
import { staffPage } from "@/lib/guard";
import { CrmShell } from "@/components/CrmShell";
import { CAT_LABEL } from "@/lib/registry-labels";
import { listMarket, marketFacets, marketFile, marketPoints, marketTotals, PAGE, type MarketFilters } from "@/lib/market/search";
import { MarketExplorer } from "./MarketExplorer";

export const metadata: Metadata = { title: "Comparabile | CRM VALUEFY" };
export const dynamic = "force-dynamic";

/** Comparabile: the listings brought in every night from the portals, as a list and a map, with live filters.
 * The searches and the runs are set in Setări → Comparabile. */
export default async function MarketPage({ searchParams }: { searchParams: Promise<MarketFilters> }) {
  const { db, user, base } = await staffPage("market");
  const sp = await searchParams;
  const [{ rows, total, page }, { points, nowhere }, facets, totals] = await Promise.all([listMarket(db, sp), marketPoints(db, sp), marketFacets(db, sp), marketTotals(db)]);
  return (
    <CrmShell user={user} base={base} active="market" title="Comparabile" subtitle="Anunțurile de pe imobiliare.ro, storia.ro, olx.ro, publi24.ro și homezz.ro, aduse în fiecare noapte"
      actions={can(user, "market:searches") ? <a className="btn btnGhost btnSm" href={`${base}/setari/piata`}>Căutări și rulări →</a> : undefined}>
      <MarketExplorer base={base} current={sp} total={total} page={page} pages={Math.max(1, Math.ceil(total / PAGE))}
        rows={rows.map((r) => ({ ...r, cover: marketFile(r.cover_key) }))} points={points} nowhere={nowhere} totals={totals}
        cats={facets.cats.map((x) => [x.k, CAT_LABEL[x.k] ?? x.k, x.n])} types={facets.types.map((x) => [x.k, x.n])} sources={facets.sources.map((x) => [x.k, x.n])}
        counties={facets.counties.map((x) => [x.k, x.label, x.n])} cities={facets.cities.map((x) => [x.k, x.label, x.n])} zones={facets.zones.map((x) => [x.k, x.label, x.n])} />
    </CrmShell>
  );
}
