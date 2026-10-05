import type { Metadata } from "next";
import { staffPage } from "@/lib/guard";
import { CrmShell } from "@/components/CrmShell";
import { PartnerForm } from "../PartnerForm";

export const metadata: Metadata = { title: "Firmă parteneră nouă | CRM VALUEFY" };
export const dynamic = "force-dynamic";

export default async function NewPartnerPage() {
  const { user, base } = await staffPage();
  return (
    <CrmShell user={user} base={base} active="users" title="Firmă parteneră nouă" subtitle="Datele firmei și, opțional, prima persoană care primește acces în portal">
      <div style={{ maxWidth: 860 }}><PartnerForm base={base} /></div>
    </CrmShell>
  );
}
