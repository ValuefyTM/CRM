import type { Metadata } from "next";
import { can } from "@/lib/perms";
import { staffPage } from "@/lib/guard";
import { SHEET_TYPES } from "@/lib/insp-forms";
import { templateStats } from "@/lib/insp-templates";
import { templateOf } from "@/lib/insp-templates-db";
import { CrmShell } from "@/components/CrmShell";
import { SettingsTabs } from "../SettingsTabs";
import { UvaloPanel } from "./UvaloPanel";
import { origin } from "@/lib/site";

export const metadata: Metadata = { title: "Fișe de inspecție | CRM VALUEFY" };
export const dynamic = "force-dynamic";

const SHORT: Record<string, string> = { apartament: "AP", casa: "CASĂ", teren: "TER", comercial: "COM", accesoriu: "ACC" };

/** The inspection sheets the inspectors fill in on the phone, one per property type, as the firm adapts them. */
export default async function SheetTemplatesPage() {
  const { db, user, base } = await staffPage("templates");
  const list = await Promise.all(SHEET_TYPES.map(async ([t, label]) => ({ t, label, ...(await templateOf(db, t)) })));
  return (
    <CrmShell user={user} base={base} active="settings" title="Setări · Fișe de inspecție" subtitle="Ce completează inspectorii pe telefon, pe tipuri de proprietate">
      <SettingsTabs base={base} active="fise" user={user} />
      <UvaloPanel edit={can(user, "templates.E")} webhook={`${await origin()}/api/integrations/uvalo/webhook`} />
      <section className="card">
        <p className="hint">
          Fiecare fișă pornește de la modelul VALUEFY. Poți redenumi și reordona grupurile, ascunde întrebări și adăuga întrebări proprii, cu
          răspunsurile pe care inspectorii le bifează pe teren. Schimbările se aplică fișelor începute de acum; fișele în lucru își păstrează forma.
          {!can(user, "templates.E") && " Doar proprietarul și administratorii pot modifica fișele."}
        </p>
        <ul className="tplList">
          {list.map((x) => {
            const s = templateStats(x.tpl);
            return (
              <li key={x.t}>
                <a href={`${base}/setari/fise/${x.t}`}>
                  <span className={`tplShort t-${x.t}`}>{SHORT[x.t]}</span>
                  <span className="tplName"><b>{x.label}</b><small>{s.groups} grupuri · {s.questions} întrebări{s.custom ? ` · ${s.custom} adăugate de voi` : ""}{s.hidden ? ` · ${s.hidden} ascunse` : ""}</small></span>
                  {x.custom && <span className="pill pillWarn">Personalizată</span>}
                  <span aria-hidden="true" className="tplChev">›</span>
                </a>
              </li>
            );
          })}
        </ul>
      </section>
    </CrmShell>
  );
}
