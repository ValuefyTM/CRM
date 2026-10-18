import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { staffPage } from "@/lib/guard";
import { CrmShell } from "@/components/CrmShell";
import { SettingsTabs } from "../SettingsTabs";
import { ImportGlide } from "./ImportGlide";
import { PhotoMover } from "./PhotoMover";
import { PurgeGlide } from "./PurgeGlide";

export const metadata: Metadata = { title: "Import istoric | CRM VALUEFY" };
export const dynamic = "force-dynamic";

export default async function ImportPage() {
  const { user, base } = await staffPage("settings");
  if (user.role !== "owner") notFound();
  return (
    <CrmShell user={user} base={base} active="settings" title="Import istoric" subtitle="Clienți, contracte, comenzi, rapoarte, bunuri și inspecții din vechiul CRM">
      <SettingsTabs base={base} active="import" user={user} />
      <div style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 980 }}>
        <PhotoMover />
        <ImportGlide base={base} />
        <PurgeGlide />
      </div>
    </CrmShell>
  );
}
