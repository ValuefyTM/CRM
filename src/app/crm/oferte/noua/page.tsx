import type { Metadata } from "next";
import { staffPage } from "@/lib/guard";
import { contractChoices } from "@/lib/contract-orders";
import { getBilling } from "@/lib/billing";
import { can } from "@/lib/perms";
import { CrmShell } from "@/components/CrmShell";
import { QuoteForm } from "../QuoteForm";

export const metadata: Metadata = { title: "Ofertă nouă | CRM VALUEFY" };
export const dynamic = "force-dynamic";

/** A new offer: client, what is valued, fee and terms. Converted into work later. */
export default async function NewQuote() {
  const { db, user, base } = await staffPage("orders.A");
  const [{ collabs }, billing] = await Promise.all([contractChoices(db), getBilling(db)]);
  return (
    <CrmShell back={{ href: `${base}/oferte`, label: "Oferte" }} user={user} base={base} active="quotes" title="Ofertă nouă" subtitle="Notează oferta făcută clientului; comanda sau contractul se fac la conversie">
      <QuoteForm base={base} initial={null} collabs={collabs.map((c) => ({ id: c.id, firm: c.firm, number: c.number }))} vatPercent={billing.vatPercent} canAddReferral={can(user, "users.A")} />
    </CrmShell>
  );
}
