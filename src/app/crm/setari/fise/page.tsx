import type { Metadata } from "next";
import { can } from "@/lib/perms";
import { staffPage } from "@/lib/guard";
import { baseTemplate } from "@/lib/insp-templates";
import { templateList, templateOf } from "@/lib/insp-templates-db";
import { inspChannel, templateSync } from "@/lib/uvalo";
import { origin } from "@/lib/site";
import { CrmShell } from "@/components/CrmShell";
import { SettingsTabs } from "../SettingsTabs";
import { UvaloPanel } from "./UvaloPanel";
import { SheetEditor } from "./SheetEditor";

export const metadata: Metadata = { title: "Fișe de inspecție | CRM VALUEFY" };
export const dynamic = "force-dynamic";

/** The inspection sheets: one per property type plus the firm's own, as the firm adapts them (editor as in UVALO), and where inspections are done. */
export default async function SheetTemplatesPage({ searchParams }: { searchParams: Promise<{ tip?: string }> }) {
  const { db, user, base } = await staffPage("templates");
  const { tip } = await searchParams;
  const [sync, channel] = await Promise.all([templateSync(db), inspChannel(db)]);
  const items = await Promise.all((await templateList(db)).map(async (x) => {
    const cur = await templateOf(db, x.key, x.base);
    return { t: x.key, base: x.base, builtin: x.builtin, assets: x.assets, label: x.name, tpl: cur.tpl, model: baseTemplate(x.base), custom: cur.custom, synced: sync[x.key]?.at ?? null, syncError: sync[x.key]?.error ?? null };
  }));
  return (
    <CrmShell user={user} base={base} active="settings" title="Setări · Fișe de inspecție" subtitle="Ce completează inspectorii pe telefon, pe tipuri de proprietate">
      <SettingsTabs base={base} active="fise" user={user} />
      <UvaloPanel edit={can(user, "templates.E")} webhook={`${await origin()}/api/integrations/uvalo/webhook`} />
      {!can(user, "templates.E") && <div className="note">Doar proprietarul și administratorii pot modifica fișele.</div>}
      <SheetEditor items={items} start={items.some((x) => x.t === tip) ? tip! : items[0]?.t ?? ""} edit={can(user, "templates.E")} uvalo={channel === "uvalo"} />
    </CrmShell>
  );
}
