import type { Metadata } from "next";
import { can } from "@/lib/perms";
import { notFound } from "next/navigation";
import { staffPage } from "@/lib/guard";
import { SHEET_TYPES, type SheetType } from "@/lib/insp-forms";
import { baseTemplate } from "@/lib/insp-templates";
import { templateOf } from "@/lib/insp-templates-db";
import { CrmShell } from "@/components/CrmShell";
import { SettingsTabs } from "../../SettingsTabs";
import { TemplateEditor } from "./TemplateEditor";

export const metadata: Metadata = { title: "Fișă de inspecție | CRM VALUEFY" };
export const dynamic = "force-dynamic";

export default async function SheetTemplatePage({ params }: { params: Promise<{ tip: string }> }) {
  const { db, user, base } = await staffPage("templates");
  const { tip } = await params;
  const label = SHEET_TYPES.find(([t]) => t === tip)?.[1];
  if (!label) notFound();
  const t = tip as SheetType;
  const cur = await templateOf(db, t);
  return (
    <CrmShell user={user} base={base} active="templates" title={`Fișa · ${label}`} subtitle="Grupurile și întrebările fișei de inspecție">
      <SettingsTabs base={base} active="fise" />
      <TemplateEditor type={t} label={label} back={`${base}/setari/fise`} initial={cur.tpl} model={baseTemplate(t)} custom={cur.custom} edit={can(user, "templates.E")} />
    </CrmShell>
  );
}
