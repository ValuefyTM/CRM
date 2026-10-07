import type { Metadata } from "next";
import { staffPage } from "@/lib/guard";
import { evaluatorChoices } from "@/lib/dossier";
import { bankChoices, CONTRACT_PURPOSES, nextContractNumber, REPORT_KINDS } from "@/lib/contracts";
import { CrmShell } from "@/components/CrmShell";
import { ContractForm, type PickedClient } from "./ContractForm";

export const metadata: Metadata = { title: "Contract nou | CRM VALUEFY" };
export const dynamic = "force-dynamic";

/**
 * New contract. Classic: direct work for a client of VALUEFY — accepted now (report and contract at once) or with an
 * offer first. Framework: the agreement signed with a bank. `?contract=` adds another report under a classic contract.
 */
export default async function NewContract({ searchParams }: { searchParams: Promise<{ tip?: string; contract?: string; client?: string }> }) {
  const { db, user, base } = await staffPage();
  const sp = await searchParams;
  const [evaluators, banks, next] = await Promise.all([evaluatorChoices(db), bankChoices(db), nextContractNumber(db)]);
  const existing = sp.contract
    ? await db.prepare(`SELECT k.id, k.number, k.fee, k.purpose, k.report_type, e.id AS client_id, e.kind, e.name, e.cui, e.phone, e.email, e.city
        FROM contracts k LEFT JOIN entities e ON e.id = k.client_id WHERE k.id = ? AND k.kind = 'classic'`).bind(sp.contract)
      .first<{ id: string; number: string; fee: number | null; purpose: string | null; report_type: string | null; client_id: string | null; kind: string; name: string; cui: string | null; phone: string | null; email: string | null; city: string | null }>()
    : null;
  const clientId = existing?.client_id ?? sp.client ?? null;
  const client: PickedClient | null = clientId
    ? existing?.client_id ? { id: existing.client_id, kind: existing.kind, name: existing.name, cui: existing.cui, phone: existing.phone, email: existing.email, city: existing.city }
      : await db.prepare("SELECT id, kind, name, cui, phone, email, city FROM entities WHERE id = ?").bind(clientId).first<PickedClient>()
    : null;
  return (
    <CrmShell user={user} base={base} active="contracts" title={existing ? `Raport nou pe contractul ${existing.number}` : "Contract nou"}
      subtitle={existing ? "Un raport în plus pe contractul clasic existent: fără contract nou" : `Lucrare directă VALUEFY (contract clasic, următorul nr. ${next}) sau contract cadru cu o bancă`}
      actions={<a href={existing ? `${base}/contracte/${existing.id}` : `${base}/contracte`} className="btn btnGhost btnSm">← {existing ? "Contract" : "Contracte"}</a>}>
      <ContractForm base={base} me={user.id} next={next} initialKind={sp.tip === "cadru" && !existing ? "framework" : "classic"} evaluators={evaluators} banks={banks}
        purposes={CONTRACT_PURPOSES} reportKinds={REPORT_KINDS} client={client}
        existing={existing ? { id: existing.id, number: existing.number, fee: existing.fee, purpose: existing.purpose, report_type: existing.report_type } : null} />
    </CrmShell>
  );
}
