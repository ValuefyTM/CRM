import type { Metadata } from "next";
import { fmtDate, staffPage } from "@/lib/guard";
import { can } from "@/lib/perms";
import { allFields, loadTemplates, SOURCES } from "@/lib/report-templates";
import { CrmShell } from "@/components/CrmShell";
import { SettingsTabs } from "../SettingsTabs";
import { TemplateEditor } from "./TemplateEditor";

export const metadata: Metadata = { title: "Machete de raport | CRM VALUEFY" };
export const dynamic = "force-dynamic";

const KINDS: Record<string, string> = { apartament: "apartamente", teren: "terenuri", casa: "case cu teren" };

/** Setări → Machete de raport: the chapters and fields of the drafting mode, per bank and type of property. */
export default async function TemplatesPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const { db, user, base } = await staffPage("templates");
  const { m } = await searchParams;
  const list = await loadTemplates(db);
  const t = list.find((x) => x.key === m) ?? list[0];
  const { results: used } = await db.prepare("SELECT text AS key, COUNT(*) AS n FROM report_drafts WHERE field = '_template' GROUP BY text").all<{ key: string; n: number }>().catch(() => ({ results: [] as { key: string; n: number }[] }));
  return (
    <CrmShell user={user} base={base} active="settings" title="Setări" subtitle="Machetele definesc cuprinsul din modul de redactare și ce scrie AI-ul în fiecare câmp">
      <SettingsTabs base={base} active="machete" user={user} />
      <div className="mtCols">
        <div className="mtList">
          <section className="card">
            <h2>Machete</h2>
            <nav className="mtNav">
              {list.map((x) => (
                <a key={x.key} href={`${base}/setari/machete?m=${x.key}`} aria-current={x.key === t.key ? "page" : undefined}>
                  <b>{x.name}</b>
                  <small>{x.chapters.length} capitole · {allFields(x).length} câmpuri{used.find((u) => u.key === x.key) ? ` · ${used.find((u) => u.key === x.key)!.n} rapoarte` : ""}</small>
                  {x.changed && <small>modificată {fmtDate(x.changed)}</small>}
                </a>
              ))}
            </nav>
          </section>
          <section className="card">
            <h2>Cum se alege</h2>
            <p className="hint">Automat, după tipul bunului principal ({Object.values(KINDS).join(", ")}). Evaluatorul o poate schimba din cuprinsul raportului, în modul de redactare.</p>
          </section>
          {t.kind === "teren" && (
            <section className="card drWarnCard">
              <h2>Diferențe la teren</h2>
              <p>Fișa tehnică a terenului (suprafață, amplasament, utilități, drum, geometrie / front, PUG, POT / CUT / certificat de urbanism, aspect, înclinare), CMBU pentru teren liber și construit, alte elemente în grila de comparație.</p>
            </section>
          )}
        </div>
        <TemplateEditor key={`${t.key}:${t.changed ?? ""}`} initial={t} sources={SOURCES} changed={t.changed} canEdit={can(user, "templates.E")} />
      </div>
    </CrmShell>
  );
}
