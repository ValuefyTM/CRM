import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { staffPage } from "@/lib/guard";
import { CrmShell } from "@/components/CrmShell";
import { STAGES, caseDetail, isExpert, stagePill } from "@/lib/expert-cases";
import { CaseClient } from "./CaseClient";

export const metadata: Metadata = { title: "Dosar · Expertize judiciare | CRM VALUEFY" };
export const dynamic = "force-dynamic";

const TABS = ["date", "parti", "termene", "convocari", "acte", "onorariu"];

/** One court case of the signed-in expert (anyone else gets "not found"). */
export default async function ExpertCasePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { db, user, base } = await staffPage();
  if (!isExpert(user)) redirect(`${base}/?fara-acces=1`);
  const d = await caseDetail(db, user.id, (await params).id);
  if (!d) notFound();
  const want = (await searchParams).tab ?? "";
  const c = d.case;
  const who = [d.parties.find((p) => p.role === "Reclamant")?.name, d.parties.find((p) => p.role === "Pârât")?.name].filter(Boolean).join(" c. ");
  return (
    <CrmShell user={user} base={base} active="expert" title={c.object || `Dosar ${c.number}`} subtitle={[`Dosar ${c.number}`, c.court, who].filter(Boolean).join(" · ")}
      back={{ href: `${base}/expertize`, label: "Expertize judiciare" }} actions={<span className={`pill ${stagePill(c.stage)}`}>{STAGES[c.stage]}</span>}>
      <CaseClient base={base} d={d} tab={TABS.includes(want) ? want : "date"} />
    </CrmShell>
  );
}
