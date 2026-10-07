import type { Metadata } from "next";
import { staffPage } from "@/lib/guard";
import { contractChoices } from "@/lib/contract-orders";
import { evaluatorChoices } from "@/lib/dossier";
import { inspectorChoices } from "@/lib/insp-assign";
import { CrmShell } from "@/components/CrmShell";
import { ContractOrderForm } from "./ContractOrderForm";

export const metadata: Metadata = { title: "Lucrare nouă | CRM VALUEFY" };
export const dynamic = "force-dynamic";

/** Work under a framework contract (bank) or a collaboration: order (statement line) and report file in one step. */
export default async function NewContractOrder({ searchParams }: { searchParams: Promise<{ tip?: string; contract?: string }> }) {
  const { db, user, base } = await staffPage();
  const [{ contracts, collabs }, evaluators, inspectors] = await Promise.all([contractChoices(db), evaluatorChoices(db), inspectorChoices(db, user.id)]);
  const sp = await searchParams;
  const kind = sp.tip === "colaborare" ? "collab" : "bank";
  return (
    <CrmShell user={user} base={base} active="orders" title="Lucrare nouă" subtitle="Comandă din contract cadru (bancă) sau din colaborare · se procesează direct, fără ofertă"
      actions={<a href={`${base}/comenzi?tab=banci`} className="btn btnGhost btnSm">← Comenzi</a>}>
      <ContractOrderForm base={base} me={user.id} initialKind={kind} initialContract={sp.contract ?? null} contracts={contracts} collabs={collabs}
        evaluators={evaluators} inspectors={inspectors.map((x) => ({ id: x.id, name: x.name, role: x.role }))} />
    </CrmShell>
  );
}
