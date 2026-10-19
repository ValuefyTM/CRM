import type { Metadata } from "next";
import { can } from "@/lib/perms";
import { staffPage } from "@/lib/guard";
import { history } from "@/lib/history";
import { billingRules } from "@/lib/billing";
import { getAlertRules } from "@/lib/alerts";
import { CrmShell } from "@/components/CrmShell";
import { History } from "@/components/History";
import { SettingsTabs } from "../SettingsTabs";
import { AlertsEditor } from "./AlertsEditor";

export const metadata: Metadata = { title: "Setări alerte | CRM VALUEFY" };
export const dynamic = "force-dynamic";

/** The configurable alerts: which situations warn whom, after how long, on which contracts, and whether on the dashboard too. */
export default async function AlertsSettingsPage() {
  const { db, user, base } = await staffPage("settings");
  const [rules, parties, people, log] = await Promise.all([
    getAlertRules(db), billingRules(db),
    db.prepare(`SELECT id, COALESCE(NULLIF(name, ''), email) AS name, role FROM users WHERE kind = 'internal' AND status IN ('active', 'invited') ORDER BY name`).all<{ id: string; name: string; role: string }>().then((x) => x.results),
    history(db, ["alerts"]),
  ]);
  const edit = can(user, "settings.E");
  return (
    <CrmShell user={user} base={base} active="settings" title="Setări · Alerte" subtitle="Cine e anunțat, când și pentru ce: clopoțel, telefon și tabloul de bord">
      <SettingsTabs base={base} active="alerte" user={user} />
      {!edit && <div className="note">Doar proprietarul și administratorii pot modifica alertele.</div>}
      <div className="cols">
        <div style={{ minWidth: 0 }}>
          <AlertsEditor edit={edit} initial={rules} people={people}
            scopes={[
              ...parties.contracts.map((k) => ({ v: `k:${k.id}`, label: `${k.party ?? "Contract cadru"}${k.number ? ` · ${k.number}` : ""}`, group: "Contracte cadru (bănci)" })),
              ...parties.collabs.map((c) => ({ v: `c:${c.id}`, label: `${c.party}${c.number ? ` · ${c.number}` : ""}`, group: "Colaborări" })),
              { v: "direct", label: "Clienți direcți (fără contract cadru / colaborare)", group: "Altele" },
            ]} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18, minWidth: 0 }}>
          <section className="card">
            <h2>Cum funcționează</h2>
            <ul className="blHow">
              <li>Fiecare alertă descrie o <b>situație</b> (inspecție realizată, raport neîncasat, comandă neprocesată…), <b>după câte zile</b> se dă și <b>cui</b>.</li>
              <li>Alertele ajung în <b>clopoțel</b> și, pentru cine a activat notificările, <b>pe telefon</b>. Cu „și pe tabloul de bord” apar și ca un card în „De rezolvat”.</li>
              <li>O situație care durează (neîncasat, nepredat) rămâne în alerte până se rezolvă: bifa „Achitat”, predarea, factura. Una de moment (inspecție realizată) se dă o singură dată.</li>
              <li>O alertă poate fi limitată la anumite contracte cadru sau colaborări (de exemplu încasarea după inspecție doar la băncile unde clientul plătește direct).</li>
              <li>Rapoartele aduse din vechiul CRM nu dau alerte.</li>
            </ul>
          </section>
          <History log={log} />
        </div>
      </div>
    </CrmShell>
  );
}
