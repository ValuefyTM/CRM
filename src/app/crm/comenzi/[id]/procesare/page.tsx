import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { fmtDate, staffPage } from "@/lib/guard";
import { getOrder, orderCode, orderDocuments } from "@/lib/orders";
import { contractChoices } from "@/lib/contract-orders";
import { getBilling } from "@/lib/billing";
import { evaluatorChoices } from "@/lib/dossier";
import { inspectorChoices } from "@/lib/insp-assign";
import { extractEnabled } from "@/lib/extract";
import { CrmShell } from "@/components/CrmShell";
import { ProcessWizard } from "./ProcessWizard";
import { PartnerWizard } from "./PartnerWizard";
import { PROPERTY } from "@/lib/dossier";
import { emptyAsset } from "@/lib/asset-labels";
import { niceName } from "@/lib/labels";
import { PURPOSES } from "@/lib/order-labels";
import { VALUE_TYPES } from "@/lib/contract-terms";
import { CONTRACT_PURPOSES, REPORT_KINDS } from "@/lib/contracts";

export const metadata: Metadata = { title: "Procesare comandă | CRM VALUEFY" };
export const dynamic = "force-dynamic";

/** Bank / collaboration order with only a request id and a client name: screenshot → client → assets → file. */
export default async function ProcessOrder({ params }: { params: Promise<{ id: string }> }) {
  const { db, user, base } = await staffPage("orders");
  const { id } = await params;
  const o = await getOrder(db, id);
  if (!o) notFound();
  const rep = await db.prepare("SELECT id FROM reports WHERE order_id = ? LIMIT 1").bind(id).first<{ id: string }>();
  if (rep) redirect(`${base}/rapoarte/${rep.id}`);
  // A collaborator's portal order: no offer; fee and term, VALUEFY or a collaborating firm, report, asset from the order.
  if (o.source === "partner") {
    if (o.linked_order_id) redirect(`${base}/comenzi/${o.linked_order_id}`);
    const [{ collabs }, evaluators, docs, parties] = await Promise.all([contractChoices(db), evaluatorChoices(db), orderDocuments(db, id),
      db.prepare("SELECT id, name, kind FROM entities WHERE kind IN ('bank', 'ifn', 'uat', 'anaf', 'broker', 'other') ORDER BY kind <> 'bank', kind, name").all<{ id: string; name: string; kind: string }>()]);
    const [category, type] = PROPERTY[o.property_type ?? ""] ?? [null, ""];
    const asset = {
      ...emptyAsset({ city: o.city }), category: category ?? "REZIDENTIAL", type, full_address: o.address ?? "", is_main: true,
      usable_area: o.surface_area ? String(o.surface_area) : "", land_area: o.land_area ? String(o.land_area) : "", rooms: o.rooms ? String(o.rooms) : "",
      contact_kind: o.contact_name ? "other" : "client", contact_name: o.contact_name ?? "", contact_phone: o.contact_phone ?? "",
    };
    return (
      <CrmShell back={{ href: `${base}/comenzi/${id}`, label: "Comanda" }} user={user} base={base} active="orders" title={`Procesează ${orderCode(o)}`}
        subtitle={`${o.partner_name ?? o.creator_name ?? "Colaborator"} · ${o.client_name ?? "client"} · primită ${fmtDate(o.created_at, true)}`}>
        <PartnerWizard
          order={{ id, ref: orderCode(o), partner: [o.creator_name, o.partner_name].filter(Boolean).join(" · ") || null, client: o.client_name, phone: o.client_phone, email: o.client_email,
            purpose: o.purpose, report_type: o.report_type, urgent: !!o.urgent, fee: o.fee, docs: docs.length }}
          base={base} me={user.id} asset={asset}
          collabs={collabs.map((c) => ({ id: c.id, label: `${c.firm}${c.number ? ` · nr. ${c.number}` : ""}${c.share != null ? ` · cota VALUEFY ${Math.round(c.share * 100)}%` : ""}` }))}
          parties={parties.results.map((e) => ({ id: e.id, label: niceName(e.name) || e.name }))}
          purposes={[...new Set([...CONTRACT_PURPOSES, ...PURPOSES])]} reportTypes={REPORT_KINDS} valueTypes={VALUE_TYPES.map(([, l]) => l)}
          evaluators={evaluators}
        />
      </CrmShell>
    );
  }
  const [{ contracts }, evaluators, inspectors, docs, billing] = await Promise.all([contractChoices(db), evaluatorChoices(db), inspectorChoices(db, user.id), orderDocuments(db, id), getBilling(db)]);
  const screens = docs.filter((d) => d.kind === "bank_screen").map((d) => ({ id: d.id, name: d.filename, href: `/api/crm/orders/${id}/documents/${d.id}` }));
  return (
    <CrmShell back={{ href: `${base}/comenzi/${id}`, label: "Comanda" }} user={user} base={base} active="orders" title={`Procesează ${orderCode(o)}`}
      subtitle={`${o.client_name ?? "Client necunoscut"}${o.report_type ? ` · ${o.report_type}` : ""} · primită ${fmtDate(o.created_at, true)}`}>
      <ProcessWizard
        order={{ id, bank: o.bank, ref: o.bank_ref, client: o.client_name, phone: o.client_phone, email: o.client_email, branch: o.bank_branch, link: o.bank_link,
          contract_id: o.contract_id, fee: o.fee, report_type: o.report_type, purpose: o.purpose, urgent: !!o.urgent, source: o.source, city: o.city, address: o.address }}
        base={base} me={user.id} canRead={extractEnabled()} screens={screens}
        contracts={contracts.map((c) => ({ id: c.id, label: `${c.bank}${c.number ? ` · contract ${c.number}` : ""}`, fee: c.fee, fee_grid: c.fee_grid ?? null }))} vatPercent={billing.vatPercent}
        evaluators={evaluators} inspectors={inspectors.map((x) => ({ id: x.id, name: x.name, role: x.role }))}
      />
    </CrmShell>
  );
}
