import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { staffPage } from "@/lib/guard";
import { CrmShell } from "@/components/CrmShell";
import { getExpertPrefs, isExpert } from "@/lib/expert-cases";
import { PrefsForm } from "./PrefsForm";

export const metadata: Metadata = { title: "Alerte și setări · Expertize judiciare | CRM VALUEFY" };
export const dynamic = "force-dynamic";

/** The expert's own settings of the module: when and how they are told about terms and about the portal's news. */
export default async function ExpertPrefsPage() {
  const { db, user, base } = await staffPage();
  if (!isExpert(user)) redirect(`${base}/?fara-acces=1`);
  return (
    <CrmShell user={user} base={base} active="expert" title="Alerte și setări" subtitle="Doar pentru dosarele tale de expertiză judiciară" back={{ href: `${base}/expertize`, label: "Expertize judiciare" }}>
      <PrefsForm initial={await getExpertPrefs(db, user.id)} />
    </CrmShell>
  );
}
