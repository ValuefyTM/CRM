import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { staffPage } from "@/lib/guard";
import { CrmShell } from "@/components/CrmShell";
import { PARTY_ROLES, getExpertPrefs, isExpert } from "@/lib/expert-cases";
import { CaseForm } from "../CaseForm";

export const metadata: Metadata = { title: "Dosar nou · Expertize judiciare | CRM VALUEFY" };
export const dynamic = "force-dynamic";

export default async function NewExpertCasePage() {
  const { db, user, base } = await staffPage();
  if (!isExpert(user)) redirect(`${base}/?fara-acces=1`);
  const prefs = await getExpertPrefs(db, user.id);
  return (
    <CrmShell user={user} base={base} active="expert" title="Dosar nou" subtitle="Datele din încheierea de numire" back={{ href: `${base}/expertize`, label: "Expertize judiciare" }}>
      <CaseForm base={base} roles={PARTY_ROLES} fileBefore={prefs.file_before} monitor={prefs.monitor_new} />
    </CrmShell>
  );
}
