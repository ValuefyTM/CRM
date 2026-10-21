import type { Metadata } from "next";
import { can } from "@/lib/perms";
import { staffPage } from "@/lib/guard";
import { CrmShell } from "@/components/CrmShell";
import { ListingEditor } from "../ListingEditor";

export const metadata: Metadata = { title: "Anunț nou | CRM VALUEFY" };
export const dynamic = "force-dynamic";

export default async function NewListingPage() {
  const { user, base } = await staffPage("listings");
  return (
    <CrmShell back={{ href: `${base}/anunturi`, label: "Anunțuri imobiliare" }} user={user} base={base} active="listings" title="Anunț nou" subtitle="Se creează ca ciornă; îl publici după ce adaugi fotografiile.">
      <ListingEditor base={base} canDelete={can(user, "listings.D")} />
    </CrmShell>
  );
}
