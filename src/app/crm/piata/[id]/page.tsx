import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { staffPage } from "@/lib/guard";
import { CrmShell } from "@/components/CrmShell";
import { getMarketListing } from "@/lib/market/search";
import { ListingDetail } from "./ListingDetail";

export const metadata: Metadata = { title: "Anunț de piață | CRM VALUEFY" };
export const dynamic = "force-dynamic";

/** A market listing, as a real-estate listing page: gallery, key data, description, map, history, price. */
export default async function MarketListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { db, user, base } = await staffPage("market");
  const d = await getMarketListing(db, (await params).id);
  if (!d) notFound();
  return (
    <CrmShell back={{ href: `${base}/piata`, label: "Anunțuri de piață" }} user={user} base={base} active="market" title="Anunț de piață" subtitle={`${d.listing.source} · ID ${d.listing.ext_id}`}>
      <ListingDetail d={d} base={base} />
    </CrmShell>
  );
}
