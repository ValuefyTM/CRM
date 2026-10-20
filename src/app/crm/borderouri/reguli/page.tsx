import type { Metadata } from "next";
import { staffPage } from "@/lib/guard";
import { can } from "@/lib/perms";
import { CrmShell } from "@/components/CrmShell";
import { RulesEditor } from "./RulesEditor";

export const metadata: Metadata = { title: "Reguli borderouri | CRM VALUEFY" };
export const dynamic = "force-dynamic";

/** Who gets a monthly statement and on what criteria. */
export default async function RulesPage() {
  const { user, base } = await staffPage("statements.all");
  return (
    <CrmShell user={user} base={base} active="statements" title="Reguli de borderou" subtitle="Cine primește borderou lunar, ce intră în el și cum se calculează"
      actions={<a href={`${base}/borderouri`} className="btn btnGhost btnSm">← Borderouri</a>}>
      <div className="note">O regulă deschide automat, în fiecare lună, un borderou în curs pentru persoana sau contractul ales. Cotele (evaluator, verificator, inspecție) vin din fișa utilizatorului; comisionul pe recomandări și suma fixă se setează aici. Fără regulă, un borderou se poate deschide oricând din „+ Borderou nou”, cu toate cotele persoanei.</div>
      <RulesEditor canEdit={can(user, "statements.A") || can(user, "statements.E")} canDelete={can(user, "statements.D")} />
    </CrmShell>
  );
}
