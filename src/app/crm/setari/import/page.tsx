import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { staffPage } from "@/lib/guard";
import { CrmShell } from "@/components/CrmShell";
import { ImportGlide } from "./ImportGlide";

export const metadata: Metadata = { title: "Import date Glide | CRM VALUEFY" };
export const dynamic = "force-dynamic";

export default async function ImportPage() {
  const { user, base } = await staffPage();
  if (user.role !== "owner") notFound();
  return (
    <CrmShell user={user} base={base} active="import" title="Import date Glide" subtitle="Clienți, contracte, comenzi, rapoarte, bunuri și inspecții din vechiul CRM">
      <ImportGlide base={base} />
    </CrmShell>
  );
}
