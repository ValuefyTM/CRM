import type { Metadata } from "next";
import { staffPage } from "@/lib/guard";
import { can } from "@/lib/perms";
import { evaluatorChoices } from "@/lib/dossier";
import { bankChoices, CONTRACT_PURPOSES, nextContractNumber, REPORT_KINDS } from "@/lib/contracts";
import { CrmShell } from "@/components/CrmShell";
import { ContractForm, type ContractProp, type FromQuote, type PickedClient } from "./ContractForm";
import { getQuote, quoteAssets, quoteCode } from "@/lib/quotes";
import { emptyAsset, type AssetForm } from "@/lib/asset-labels";

export const metadata: Metadata = { title: "Contract nou | CRM VALUEFY" };
export const dynamic = "force-dynamic";

/**
 * New contract. Classic: direct work for a client of VALUEFY — accepted now (report and contract at once) or with an
 * offer first. Framework: the agreement signed with a bank. `?contract=` adds another report under a classic contract.
 */
export default async function NewContract({ searchParams }: { searchParams: Promise<{ tip?: string; contract?: string; client?: string; oferta?: string }> }) {
  const { db, user, base } = await staffPage("contracts.A");
  const sp = await searchParams;
  // Converting an offer (Oferte) into direct work: the form comes filled in from it.
  const q = sp.oferta ? await getQuote(db, sp.oferta) : null;
  const fromQuote: FromQuote | null = q && q.status !== "converted" ? {
    id: q.id, code: quoteCode(q), email: q.client_email ?? "", notes: q.notes ?? "", inspection_notes: q.inspection_notes ?? "", urgent: !!q.urgent,
    report: { purpose: q.purpose ?? "", report_type: q.report_type ?? "Raport de evaluare", fee: q.fee != null ? String(q.fee) : "", term_days: q.term_days != null ? String(q.term_days) : "3" },
    fresh: q.client_id ? null : { kind: q.client_kind === "company" ? "company" : "person", name: q.client_name, cui: q.client_cui ?? "", phone: q.client_phone ?? "", email: q.client_email ?? "", city: "" },
    assets: quoteAssets(q).map((a, i) => ({ ...emptyAsset(), ...Object.fromEntries(Object.entries(a).filter(([, v]) => typeof v === "string")), uid: `q${i}`, is_main: i === 0 } as AssetForm)),
    accepted: q.status === "accepted" ? { name: q.accepted_name, at: q.decided_at } : null,
    referral: q.referral_user_id ? { id: q.referral_user_id, name: q.referral_name ?? "Colaborator" } : null,
  } : null;
  const [evaluators, banks, next] = await Promise.all([evaluatorChoices(db), bankChoices(db), nextContractNumber(db)]);
  const existing = sp.contract
    ? await db.prepare(`SELECT k.id, k.number, k.fee, k.purpose, k.report_type, e.id AS client_id, e.kind, e.name, e.cui, e.phone, e.email, e.city
        FROM contracts k LEFT JOIN entities e ON e.id = k.client_id WHERE k.id = ? AND k.kind = 'classic'`).bind(sp.contract)
      .first<{ id: string; number: string; fee: number | null; purpose: string | null; report_type: string | null; client_id: string | null; kind: string; name: string; cui: string | null; phone: string | null; email: string | null; city: string | null }>()
    : null;
  // Properties already valued under the contract: a new report can value them again with the same inspection.
  const contractProps: ContractProp[] = existing
    ? (await db.prepare(`SELECT DISTINCT p.id, p.type, COALESCE(p.full_address, p.city) AS address, p.cf_number AS cf FROM assets a JOIN reports r ON r.id = a.report_id
        JOIN crm_properties p ON p.id = a.property_id WHERE r.contract_id = ? AND r.status <> 'cancelled'`).bind(existing.id).all<ContractProp>()).results
    : [];
  const clientId = existing?.client_id ?? sp.client ?? q?.client_id ?? null;
  const client: PickedClient | null = clientId
    ? existing?.client_id ? { id: existing.client_id, kind: existing.kind, name: existing.name, cui: existing.cui, phone: existing.phone, email: existing.email, city: existing.city }
      : await db.prepare("SELECT id, kind, name, cui, phone, email, city FROM entities WHERE id = ?").bind(clientId).first<PickedClient>()
    : null;
  return (
    <CrmShell back={{ href: fromQuote ? `${base}/oferte/${fromQuote.id}` : existing ? `${base}/contracte/${existing.id}` : `${base}/contracte`, label: fromQuote ? "Ofertă" : existing ? "Contract" : "Contracte" }} user={user} base={base} active={fromQuote ? "quotes" : "contracts"} title={fromQuote ? `Contract din oferta ${fromQuote.code}` : existing ? `Raport nou pe contractul ${existing.number}` : "Contract nou"}
      subtitle={fromQuote ? `Detaliile raportului și contractul clasic (nr. ${next}, completat automat), trimis clientului la semnat` : existing ? "Un raport în plus pe contractul clasic existent: fără contract nou" : `Lucrare directă VALUEFY (contract clasic, următorul nr. ${next}) sau contract cadru cu o bancă`}>
      {sp.oferta && !fromQuote && <div className="note">Oferta nu există sau e deja convertită.</div>}
      <ContractForm base={base} me={user.id} next={next} initialKind={sp.tip === "cadru" && !existing ? "framework" : "classic"} evaluators={evaluators} banks={banks}
        purposes={CONTRACT_PURPOSES} reportKinds={REPORT_KINDS} client={client} contractProps={contractProps}
        existing={existing ? { id: existing.id, number: existing.number, fee: existing.fee, purpose: existing.purpose, report_type: existing.report_type } : null} quote={fromQuote} canAddReferral={can(user, "users.A")} />
    </CrmShell>
  );
}
