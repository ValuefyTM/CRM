import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { staffPage } from "@/lib/guard";
import { contractChoices } from "@/lib/contract-orders";
import { getBilling } from "@/lib/billing";
import { can } from "@/lib/perms";
import { getQuote, quoteAssets, quoteCode } from "@/lib/quotes";
import { emptyAsset, type AssetForm } from "@/lib/asset-labels";
import { PAYMENT_PRESETS } from "@/lib/order-labels";
import { CrmShell } from "@/components/CrmShell";
import { QuoteForm, type QuoteInitial } from "../../QuoteForm";

export const metadata: Metadata = { title: "Modifică oferta | CRM VALUEFY" };
export const dynamic = "force-dynamic";

export default async function EditQuote({ params }: { params: Promise<{ id: string }> }) {
  const { db, user, base } = await staffPage("orders.E");
  const { id } = await params;
  const q = await getQuote(db, id);
  if (!q) notFound();
  if (q.status === "converted") redirect(`${base}/oferte/${id}`);
  const [{ collabs }, billing] = await Promise.all([contractChoices(db), getBilling(db)]);
  const assets: AssetForm[] = quoteAssets(q).map((a, i) => ({ ...emptyAsset(), ...Object.fromEntries(Object.entries(a).filter(([, v]) => typeof v === "string")), uid: `q${i}`, is_main: i === 0 } as AssetForm));
  const initial: QuoteInitial = {
    id: q.id, client_id: q.client_id ?? "", client_kind: q.client_kind === "company" ? "company" : "person", client_name: q.client_name, client_phone: q.client_phone ?? "", client_email: q.client_email ?? "", client_cui: q.client_cui ?? "",
    purpose: q.purpose ?? "", report_type: q.report_type ?? "Raport de evaluare", fee: q.fee != null ? String(q.fee) : "", term_days: q.term_days != null ? String(q.term_days) : "", valid_until: q.valid_until ?? "",
    urgent: !!q.urgent, channel: q.channel ?? "", collaboration_id: q.collaboration_id ?? "", sent_via: q.sent_via ?? "",
    payment: !q.payment_terms ? "avans50" : PAYMENT_PRESETS.find(([, l]) => l === q.payment_terms)?.[0] ?? "custom", payment_terms: q.payment_terms ?? "",
    inspection_notes: q.inspection_notes ?? "", notes: q.notes ?? "", assets, referral: q.referral_id ? { id: q.referral_id, name: q.referral_name ?? "Colaborator" } : null,
  };
  return (
    <CrmShell user={user} base={base} active="quotes" title={`Oferta ${quoteCode(q)}`} subtitle="Modifică oferta" actions={<a href={`${base}/oferte/${id}`} className="btn btnGhost btnSm">← Ofertă</a>}>
      <QuoteForm base={base} initial={initial} collabs={collabs.map((c) => ({ id: c.id, firm: c.firm, number: c.number }))} vatPercent={billing.vatPercent} canAddClient={can(user, "clients.A")} />
    </CrmShell>
  );
}
