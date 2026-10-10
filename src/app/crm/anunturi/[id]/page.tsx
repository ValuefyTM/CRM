import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { staffPage } from "@/lib/guard";
import { isAdmin } from "@/lib/users";
import { getById } from "@/lib/listings";
import { CrmShell } from "@/components/CrmShell";
import { ListingEditor } from "../ListingEditor";

export const metadata: Metadata = { title: "Anunț | CRM VALUEFY" };
export const dynamic = "force-dynamic";

export default async function ListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { db, user, base } = await staffPage();
  const listing = await getById(db, (await params).id);
  if (!listing) notFound();
  return (
    <CrmShell user={user} base={base} active="listings" title={listing.title} subtitle={listing.published ? "Publicat pe valuefy.ro" : "Ciornă — nu este vizibil pe site"}>
      <a className="linkBtn" href={`${base}/anunturi`}>← Anunțuri imobiliare</a>
      <ListingEditor base={base} listing={listing} canDelete={isAdmin(user)} />
    </CrmShell>
  );
}
