import type { Metadata } from "next";
import { portalPage } from "@/lib/guard";
import { PortalShell } from "@/components/PortalShell";
import { OrderWizard } from "./OrderWizard";

export const metadata: Metadata = { title: "Comandă nouă | Portal VALUEFY" };
export const dynamic = "force-dynamic";

export default async function NewOrderPage() {
  const { user, base } = await portalPage();
  const partner = user.kind === "partner";
  return (
    <PortalShell user={user} base={base} active="orders" title={partner ? "Comandă nouă" : "Solicită o evaluare"} subtitle={partner ? `Pentru un client al ${user.partner_name}` : "Evaluare pentru proprietatea ta"}>
      <OrderWizard base={base} me={{ kind: partner ? "partner" : "client", name: user.company || user.name, phone: user.phone ?? "", email: user.email }} />
    </PortalShell>
  );
}
