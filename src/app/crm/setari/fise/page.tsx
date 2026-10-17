import type { Metadata } from "next";
import { can } from "@/lib/perms";
import { staffPage } from "@/lib/guard";
import { SHEET_TYPES, type SheetType } from "@/lib/insp-forms";
import { baseTemplate } from "@/lib/insp-templates";
import { templateOf } from "@/lib/insp-templates-db";
import { inspChannel, templateSync } from "@/lib/uvalo";
import { origin } from "@/lib/site";
import { CrmShell } from "@/components/CrmShell";
import { SettingsTabs } from "../SettingsTabs";
import { UvaloPanel } from "./UvaloPanel";
import { SheetEditor } from "./SheetEditor";

export const metadata: Metadata = { title: "Fișe de inspecție | CRM VALUEFY" };
export const dynamic = "force-dynamic";

/** The inspection sheets, one per property type, as the firm adapts them (editor as in UVALO), and where inspections are done. */
export default async function SheetTemplatesPage({ searchParams }: { searchParams: Promise<{ tip?: string }> }) {
  const { db, user, base } = await staffPage("templates");
  const { tip } = await searchParams;
  const [sync, channel] = await Promise.all([templateSync(db), inspChannel(db)]);
  const items = await Promise.all(SHEET_TYPES.map(async ([t, label]) => {
    const cur = await templateOf(db, t);
    return { t, label, tpl: cur.tpl, model: baseTemplate(t), custom: cur.custom, synced: sync[t]?.at ?? null, syncError: sync[t]?.error ?? null };
  }));
  return (
    <CrmShell user={user} base={base} active="settings" title="Setări · Fișe de inspecție" subtitle="Ce completează inspectorii pe telefon, pe tipuri de proprietate">
      <SettingsTabs base={base} active="fise" user={user} />
      <UvaloPanel edit={can(user, "templates.E")} webhook={`${await origin()}/api/integrations/uvalo/webhook`} />
      {!can(user, "templates.E") && <div className="note">Doar proprietarul și administratorii pot modifica fișele.</div>}
      <SheetEditor items={items} start={(SHEET_TYPES.some(([t]) => t === tip) ? tip : "apartament") as SheetType} edit={can(user, "templates.E")} uvalo={channel === "uvalo"} />
    </CrmShell>
  );
}
