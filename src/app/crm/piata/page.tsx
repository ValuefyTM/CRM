import type { Metadata } from "next";
import { can } from "@/lib/perms";
import { staffPage } from "@/lib/guard";
import { CrmShell } from "@/components/CrmShell";
import { CAT_LABEL } from "@/lib/registry-labels";
import { listMarket, marketFacets, marketFile, marketPoints, PAGE, type MarketFilters } from "@/lib/market/search";
import { MarketExplorer } from "./MarketExplorer";

export const metadata: Metadata = { title: "Analize de piață | CRM VALUEFY" };
export const dynamic = "force-dynamic";

/** Analize de piață: the listings brought in every night from the portals, as a list and a map, with live filters.
 * The searches and the runs are set in Setări → Analize de piață. */
export default async function MarketPage({ searchParams }: { searchParams: Promise<MarketFilters> }) {
  const { db, user, base } = await staffPage("market");
  const sp = await searchParams;
  const [{ rows, total, page }, points, facets] = await Promise.all([listMarket(db, sp), marketPoints(db, sp), marketFacets(db)]);
  return (
    <CrmShell user={user} base={base} active="market" title="Analize de piață" subtitle="Anunțurile de pe imobiliare.ro, storia.ro, olx.ro, publi24.ro și homezz.ro, aduse în fiecare noapte"
      actions={can(user, "market:searches") ? <a className="btn btnGhost btnSm" href={`${base}/setari/piata`}>Căutări și rulări →</a> : undefined}>
      <MarketExplorer base={base} current={sp} total={total} page={page} pages={Math.max(1, Math.ceil(total / PAGE))}
        rows={rows.map((r) => ({ ...r, cover: marketFile(r.cover_key) }))} points={points}
        cats={facets.cats.map((x) => [x.k, CAT_LABEL[x.k] ?? x.k, x.n])} types={facets.types.map((x) => [x.k, x.n])} sources={facets.sources.map((x) => [x.k, x.n])} />
    </CrmShell>
  );
}
