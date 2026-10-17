import type { Metadata } from "next";
import { staffPage } from "@/lib/guard";
import { can } from "@/lib/perms";
import { CrmShell } from "@/components/CrmShell";
import { getContractTemplate, templateParts } from "@/lib/contract-template-db";
import { fmtDate } from "@/lib/guard";
import { SettingsTabs } from "../SettingsTabs";
import { ContractTemplateEditor } from "./ContractTemplateEditor";

export const metadata: Metadata = { title: "Model contract | CRM VALUEFY" };
export const dynamic = "force-dynamic";

/** The contract model: a document editor with the variables filled in from each contract. */
export default async function ContractTemplatePage() {
  const { db, user, base } = await staffPage("settings");
  const [tpl, recent] = await Promise.all([
    getContractTemplate(db),
    db.prepare(`SELECT k.id, k.number, k.signed_on, e.name AS client FROM contracts k LEFT JOIN entities e ON e.id = k.client_id
      WHERE k.kind = 'classic' AND k.signed_at IS NULL ORDER BY k.created_at DESC LIMIT 12`)
      .all<{ id: string; number: string | null; signed_on: string | null; client: string | null }>().then((r) => r.results).catch(() => []),
  ]);
  const edit = can(user, "settings.E");
  return (
    <CrmShell user={user} base={base} active="settings" title="Setări" subtitle="Modelul contractului de prestări servicii (contract clasic)">
      <SettingsTabs base={base} active="contract" user={user} />
      {!edit && <div className="note">Doar cine are dreptul de modificare la „Setări firmă” poate schimba modelul.</div>}
      <ContractTemplateEditor
        initial={templateParts(tpl)} edit={edit} custom={tpl.custom}
        saved={tpl.updated_at ? `Modificat ${fmtDate(tpl.updated_at, true)}${tpl.updated_by ? ` de ${tpl.updated_by}` : ""}` : "Modelul standard VALUEFY"}
        previews={recent.map((k) => ({ href: `${base}/contracte/${k.id}/document`, label: `Nr. ${k.number ?? "—"} · ${k.client ?? "fără client"}` }))}
      />
    </CrmShell>
  );
}
