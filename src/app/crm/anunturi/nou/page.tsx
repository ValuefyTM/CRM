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
    <CrmShell user={user} base={base} active="listings" title="Anunț nou" subtitle="Se creează ca ciornă; îl publici după ce adaugi fotografiile.">
      <a className="linkBtn" href={`${base}/anunturi`}>← Anunțuri imobiliare</a>
      <ListingEditor base={base} canDelete={can(user, "listings.D")} />
    </CrmShell>
  );
}
