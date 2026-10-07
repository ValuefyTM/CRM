import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { fmtDate, staffPage } from "@/lib/guard";
import { getOrder, orderCode, orderDocuments } from "@/lib/orders";
import { contractChoices } from "@/lib/contract-orders";
import { evaluatorChoices } from "@/lib/dossier";
import { inspectorChoices } from "@/lib/insp-assign";
import { extractEnabled } from "@/lib/extract";
import { CrmShell } from "@/components/CrmShell";
import { ProcessWizard } from "./ProcessWizard";

export const metadata: Metadata = { title: "Procesare comandă | CRM VALUEFY" };
export const dynamic = "force-dynamic";

/** Bank / collaboration order with only a request id and a client name: screenshot → client → assets → file. */
export default async function ProcessOrder({ params }: { params: Promise<{ id: string }> }) {
  const { db, user, base } = await staffPage();
  const { id } = await params;
  const o = await getOrder(db, id);
  if (!o) notFound();
  const rep = await db.prepare("SELECT id FROM reports WHERE order_id = ? LIMIT 1").bind(id).first<{ id: string }>();
  if (rep) redirect(`${base}/rapoarte/${rep.id}`);
  const [{ contracts }, evaluators, inspectors, docs] = await Promise.all([contractChoices(db), evaluatorChoices(db), inspectorChoices(db, user.id), orderDocuments(db, id)]);
  const screens = docs.filter((d) => d.kind === "bank_screen").map((d) => ({ id: d.id, name: d.filename, href: `/api/crm/orders/${id}/documents/${d.id}` }));
  return (
    <CrmShell user={user} base={base} active="orders" title={`Procesează ${orderCode(o)}`}
      subtitle={`${o.client_name ?? "Client necunoscut"}${o.report_type ? ` · ${o.report_type}` : ""} · primită ${fmtDate(o.created_at, true)}`}
      actions={<a href={`${base}/comenzi/${id}`} className="btn btnGhost btnSm">← Comanda</a>}>
      <ProcessWizard
        order={{ id, bank: o.bank, ref: o.bank_ref, client: o.client_name, phone: o.client_phone, email: o.client_email, branch: o.bank_branch, link: o.bank_link,
          contract_id: o.contract_id, fee: o.fee, report_type: o.report_type, purpose: o.purpose, urgent: !!o.urgent, source: o.source, city: o.city, address: o.address }}
        base={base} me={user.id} canRead={extractEnabled()} screens={screens}
        contracts={contracts.map((c) => ({ id: c.id, label: `${c.bank}${c.number ? ` · contract ${c.number}` : ""}`, fee: c.fee }))}
        evaluators={evaluators} inspectors={inspectors.map((x) => ({ id: x.id, name: x.name, role: x.role }))}
      />
    </CrmShell>
  );
}
