import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { staffPage } from "@/lib/guard";
import { CrmShell } from "@/components/CrmShell";
import { getMarketListing, listingContext } from "@/lib/market/search";
import { ListingDetail } from "./ListingDetail";

export const metadata: Metadata = { title: "Anunț de piață | CRM VALUEFY" };
export const dynamic = "force-dynamic";

/** A market listing, as a real-estate listing page: gallery, key data, description, map, history, price. */
export default async function MarketListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { db, user, base } = await staffPage("market");
  const d = await getMarketListing(db, (await params).id);
  if (!d) notFound();
  const l = d.listing;
  const ctx = await listingContext(db, { id: l.id, lat: l.lat, lng: l.lng, category: l.category, transaction: l.transaction, area: l.area, price: l.price,
    price_sqm: l.price_sqm, dup_group: l.dup_group, status: l.status, src_created_at: (l.src_created_at as string | null) ?? null, first_seen_at: l.first_seen_at,
    last_seen_at: l.last_seen_at as string, source: l.source }, d.duplicates.map((x) => x.source), d.history).catch(() => null);
  return (
    <CrmShell back={{ href: `${base}/piata`, label: "Anunțuri de piață" }} user={user} base={base} active="market" title="Anunț de piață" subtitle={`${d.listing.source} · ID ${d.listing.ext_id}`}>
      <ListingDetail d={d} ctx={ctx} base={base} />
    </CrmShell>
  );
}
