import type { Metadata } from "next";
import { staffPage } from "@/lib/guard";
import { getMatrix } from "@/lib/perms-db";
import { DEFAULT_MATRIX, PERM_ROLES, PERMS } from "@/lib/perms";
import { CrmShell } from "@/components/CrmShell";
import { SettingsTabs } from "../SettingsTabs";
import { PermMatrix } from "./PermMatrix";

export const metadata: Metadata = { title: "Permisiuni | CRM VALUEFY" };
export const dynamic = "force-dynamic";

/** What each role sees and does in the CRM. The owner always has everything; inspectors use only the inspections app. */
export default async function PermsPage() {
  const { db, user, base } = await staffPage("admin");
  const [matrix, people] = await Promise.all([
    getMatrix(db),
    db.prepare("SELECT role, COUNT(*) AS n FROM users WHERE kind = 'internal' AND status = 'active' GROUP BY role").all<{ role: string; n: number }>(),
  ]);
  const count = Object.fromEntries(people.results.map((r) => [r.role, r.n])) as Record<string, number>;
  return (
    <CrmShell user={user} base={base} active="perms" title="Permisiuni" subtitle="Ce vede și ce face fiecare rol în CRM · proprietarul are mereu acces complet">
      <SettingsTabs base={base} active="permisiuni" />
      <PermMatrix
        perms={PERMS.map(([k, l, h]) => [k, l, h])}
        roles={PERM_ROLES.map(([k, l]) => [k, l, count[k] ?? 0])}
        initial={matrix} defaults={DEFAULT_MATRIX}
      />
      <section className="card">
        <h2>Reguli care nu se schimbă din matrice</h2>
        <ul className="hint" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
          <li>Fiecare vede rapoartele la care este în echipă (evaluator principal, verificator, inspector, asistent) cât timp sunt în lucru.</li>
          <li>Un raport finalizat îl mai văd doar evaluatorul principal și verificatorul (plus cine are „Rapoarte – toate”).</li>
          <li>Statusul, predarea și echipa unui raport le schimbă evaluatorul principal; cu „Alocare echipă” se pot schimba pe orice raport vizibil.</li>
          <li>Din Proprietăți, raportul se deschide doar dacă utilizatorul îl vede; clientul și banca apar doar atunci.</li>
          <li>Inspectorii lucrează doar în aplicația de inspecții (inspectii.valuefy.ro).</li>
          <li>„Vezi ca…” (din bara de sus) arată CRM-ul exact cum îl vede un coleg, doar pentru citire.</li>
        </ul>
      </section>
    </CrmShell>
  );
}
