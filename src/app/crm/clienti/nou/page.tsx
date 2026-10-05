import type { Metadata } from "next";
import { staffPage } from "@/lib/guard";
import { CrmShell } from "@/components/CrmShell";
import { ClientForm } from "../ClientForm";

export const metadata: Metadata = { title: "Client nou | CRM VALUEFY" };
export const dynamic = "force-dynamic";

export default async function NewClientPage({ searchParams }: { searchParams: Promise<{ tip?: string }> }) {
  const { user, base } = await staffPage();
  const pj = (await searchParams).tip === "pj";
  return (
    <CrmShell user={user} base={base} active="clients" title="Client nou" subtitle="Obligatorii: nume, telefon și email. La firme, datele se pot prelua de la ANAF după CUI.">
      <div style={{ maxWidth: 900 }}><ClientForm base={base} initial={{ kind: pj ? "company" : "person" }} /></div>
    </CrmShell>
  );
}
