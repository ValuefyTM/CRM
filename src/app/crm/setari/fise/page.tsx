import type { Metadata } from "next";
import { can } from "@/lib/perms";
import { staffPage } from "@/lib/guard";
import { baseTemplate } from "@/lib/insp-templates";
import { templateList, templateOf } from "@/lib/insp-templates-db";
import { ASSET_CATEGORIES } from "@/lib/asset-labels";
import { defaultSheetAssets } from "@/lib/insp-forms";
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
  // The asset types to link the sheets to: the list of asset types, plus types the assets in the CRM have that it lacks.
  const { results: seen } = await db.prepare("SELECT DISTINCT UPPER(category) AS c, UPPER(type) AS t FROM crm_properties WHERE category IS NOT NULL AND type IS NOT NULL AND type <> ''")
    .all<{ c: string; t: string }>();
  const nomen: [string, string, string[]][] = ASSET_CATEGORIES.map(([c, l, types]) => [c, l, [...types]]);
  for (const r of seen) {
    const cat = nomen.find(([c]) => c === r.c.trim()) ?? (nomen.push([r.c.trim(), r.c.trim().charAt(0) + r.c.trim().slice(1).toLowerCase(), []]), nomen[nomen.length - 1]);
    if (!cat[2].includes(r.t.trim())) cat[2].push(r.t.trim());
  }
  let dbError: string | null = null;
  const list = await templateList(db).catch((e: Error) => { dbError = e.message; return []; });
  const items = await Promise.all(list.map(async (x) => {
    const cur = await templateOf(db, x.key, x.base);
    return { t: x.key, base: x.base, builtin: x.builtin, rooms: x.rooms, photos: x.photos, assets: x.auto ? defaultSheetAssets(x.base, nomen.map(([c, , t]) => [c, t])) : x.assets, label: x.name, tpl: cur.tpl, model: baseTemplate(x.base), custom: cur.custom, synced: sync[x.key]?.at ?? null, syncError: sync[x.key]?.error ?? null };
  }));
  return (
    <CrmShell user={user} base={base} active="settings" title="Setări · Fișe de inspecție" subtitle="Ce completează inspectorii pe telefon, pe tipuri de proprietate">
      <SettingsTabs base={base} active="fise" user={user} />
      <UvaloPanel edit={can(user, "templates.E")} webhook={`${await origin()}/api/integrations/uvalo/webhook`} />
      {dbError && <div className="note errTxt"><b>Fișele nu se pot citi:</b> {dbError}</div>}
      {!can(user, "templates.E") && <div className="note">Doar proprietarul și administratorii pot modifica fișele.</div>}
      <SheetEditor nomen={nomen} items={items} start={items.some((x) => x.t === tip) ? tip! : items[0]?.t ?? ""} edit={can(user, "templates.E")} uvalo={channel === "uvalo"} />
    </CrmShell>
  );
}
