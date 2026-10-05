import type { Metadata } from "next";
import { staffPage } from "@/lib/guard";
import { CrmShell } from "@/components/CrmShell";
import { PartnerForm } from "../PartnerForm";

export const metadata: Metadata = { title: "Colaborator nou | CRM VALUEFY" };
export const dynamic = "force-dynamic";

export default async function NewPartnerPage() {
  const { user, base } = await staffPage();
  return (
    <CrmShell user={user} base={base} active="partners" title="Colaborator nou" subtitle="Datele firmei și, opțional, prima persoană care primește acces în portal">
      <div style={{ maxWidth: 860 }}><PartnerForm base={base} /></div>
    </CrmShell>
  );
}
