import type { Metadata } from "next";
import { can } from "@/lib/perms";
import { notFound } from "next/navigation";
import { staffPage } from "@/lib/guard";
import { getById } from "@/lib/listings";
import { CrmShell } from "@/components/CrmShell";
import { ListingEditor } from "../ListingEditor";

export const metadata: Metadata = { title: "Anunț | CRM VALUEFY" };
export const dynamic = "force-dynamic";

export default async function ListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { db, user, base } = await staffPage("listings");
  const listing = await getById(db, (await params).id);
  if (!listing) notFound();
  return (
    <CrmShell back={{ href: `${base}/anunturi`, label: "Anunțuri imobiliare" }} user={user} base={base} active="listings" title={listing.title} subtitle={listing.published ? "Publicat pe valuefy.ro" : "Ciornă — nu este vizibil pe site"}>
      <ListingEditor base={base} listing={listing} canDelete={can(user, "listings.D")} />
    </CrmShell>
  );
}
