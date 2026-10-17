import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { staffPage } from "@/lib/guard";
import { inScope } from "@/lib/scope";
import { contractDoc, signedSnapshot } from "@/lib/contract-doc";
import { getFirmWithImages } from "@/lib/settings";
import { getContractTemplate } from "@/lib/contract-template-db";
import { ContractDocView } from "@/components/ContractDoc";
import { DocToolbar } from "./DocToolbar";

export const metadata: Metadata = { title: "Contract de prestări servicii | CRM VALUEFY" };
export const dynamic = "force-dynamic";

/**
 * The service contract, printable / saved as PDF from the browser. Once the client has signed online, the document is
 * exactly what was signed (the snapshot), with both signatures.
 */
export default async function ContractDocument({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ semnatura?: string }> }) {
  const { db, user, base } = await staffPage("contracts");
  const { id } = await params;
  const snap = await signedSnapshot(db, id);
  const [d, firm, template] = snap ? [snap.doc, snap.firm, snap.template ?? null] : await Promise.all([contractDoc(db, id), getFirmWithImages(db), getContractTemplate(db)]);
  if (!d || !(await inScope(db, user, "contracts", id))) notFound();
  const sealed = snap ? true : (await searchParams).semnatura !== "0";
  return (
    <div className="cdWrap">
      <DocToolbar back={`${base}/contracte/${d.contract.id}`} signed={sealed} self={`${base}/contracte/${d.contract.id}/document`} kind={d.contract.kind} locked={!!snap} />
      {d.contract.kind === "framework" && <div className="cdWarn">Acesta este un contract cadru: documentul de mai jos e modelul de contract clasic și nu se potrivește acordului cu banca.</div>}
      {snap && <div className="cdOk">Contract semnat online de {snap.sig.name} la {new Date(snap.sig.at).toLocaleString("ro-RO", { timeZone: "Europe/Bucharest" })}. Documentul de mai jos este exact varianta semnată.</div>}
      <ContractDocView d={d} firm={firm} sealed={sealed} clientSig={snap?.sig ?? null} template={template} />
    </div>
  );
}
