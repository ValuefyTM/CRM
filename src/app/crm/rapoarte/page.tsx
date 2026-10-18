import type { Metadata } from "next";
import { staffPage } from "@/lib/guard";
import { DUE_FILTERS, listReports, PAGE_SIZE, REPORT_SORTS, REPORT_TABS, reportFacets, reportTabCounts, STAGE_FILTERS } from "@/lib/reports";
import { CancelNoAsset } from "./CancelNoAsset";
import { ReportTable } from "./ReportTable";
import { STAGE_LABEL } from "@/lib/dossier";
import { ReportFilters } from "./ReportFilters";
import { CrmShell } from "@/components/CrmShell";
import { can } from "@/lib/perms";
import { mySql } from "@/lib/perms-db";

export const metadata: Metadata = { title: "Rapoarte | CRM VALUEFY" };
export const dynamic = "force-dynamic";

type SP = { q?: string; status?: string; year?: string; bank?: string; issuer?: string; evaluator?: string; sort?: string; page?: string; bunuri?: string; etapa?: string; termen?: string; ale?: string; "fara-acces"?: string };

export default async function ReportsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const { db, user, base } = await staffPage("reports");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Bucharest" });
  // Without "reports.all": only the reports of the user's team work. With it, "Ale mele" narrows the list the same way.
  const all = can(user, "reports.all");
  const mine = !all || sp.ale === "1" ? { id: user.id, sql: mySql(user) } : undefined;
  const f = { ...sp, page, mine };
  const [data, facets, counts] = await Promise.all([listReports(db, f), reportFacets(db, mine), reportTabCounts(db, f)]);
  // "Fără bun": the open ones can be cancelled in one go (by someone who sees all reports and changes statuses).
  const openNoAsset = sp.bunuri === "fara" && all && can(user, "reports:status")
    ? (await db.prepare("SELECT COUNT(*) AS n FROM reports r WHERE r.status NOT IN ('done', 'cancelled') AND NOT EXISTS (SELECT 1 FROM assets x WHERE x.report_id = r.id)").first<{ n: number }>())?.n ?? 0
    : 0;
  const tab = sp.status === "draft" ? "in_progress" : sp.status ?? "";
  const pages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));
  const link = (change: Partial<SP>) => {
    const next = { ...sp, page: undefined, ...change };
    const qs = Object.entries(next).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v as string)}`).join("&");
    return `${base}/rapoarte${qs ? `?${qs}` : ""}`;
  };



  return (
    <CrmShell user={user} base={base} active="reports" title={mine ? "Rapoartele mele" : "Rapoarte"}
      subtitle={mine ? "Rapoartele la care ești în echipă (cele finalizate: ca evaluator principal sau verificator)" : "Toate rapoartele: VALUEFY și firmele partenere"}
      actions={all ? <a className={`btn btnSm ${mine ? "btnGold" : "btnGhost"}`} href={link({ ale: mine ? undefined : "1" })}>{mine ? "Toate rapoartele" : "Rapoartele mele"}</a> : undefined}>
      {openNoAsset > 0 && <CancelNoAsset count={openNoAsset} />}
      {sp["fara-acces"] && <div className="note">Nu ai acces la acel raport: rapoartele finalizate le văd evaluatorul principal și verificatorul.</div>}
      <section className="card repFilters">
        <ReportFilters
          base={base} total={data.total} current={{ q: sp.q, status: sp.status, year: sp.year, bank: sp.bank, issuer: sp.issuer, evaluator: sp.evaluator, sort: sp.sort, bunuri: sp.bunuri }}
          years={facets.years.map((y) => [String(y.y), String(y.y), y.n])}
          banks={facets.banks.map((b) => [b.code, b.code, b.n])}
          issuers={facets.issuers.map((i) => [i.id, i.name, i.n])}
          evaluators={facets.evaluators.map((e) => [e.id, e.name, e.n])}
          sorts={Object.entries(REPORT_SORTS).map(([k, [l]]) => [k, l])}
          tab={tab} tabs={REPORT_TABS.map(([k, label]) => [k, label, counts[k] ?? 0, link({ status: k || undefined })])}
        />
        {(STAGE_FILTERS[sp.etapa ?? ""] || DUE_FILTERS[sp.termen ?? ""] || sp.status === "deschise") && (
          <div className="activeFilters">
            <span>Din tabloul de bord:</span>
            {STAGE_FILTERS[sp.etapa ?? ""] && <a className="chipX" href={link({ etapa: undefined })}>Etapa: {STAGE_LABEL[STAGE_FILTERS[sp.etapa!]]} <b aria-hidden>×</b></a>}
            {sp.status === "deschise" && <a className="chipX" href={link({ status: undefined })}>Rapoarte deschise <b aria-hidden>×</b></a>}
            {DUE_FILTERS[sp.termen ?? ""] && <a className="chipX" href={link({ termen: undefined })}>{DUE_FILTERS[sp.termen!]} <b aria-hidden>×</b></a>}
          </div>
        )}
      </section>
      <section className="card repCard">
        {data.rows.length === 0 ? (
          <div className="empty">{data.total === 0 && !sp.q ? "Nu există încă rapoarte. Proprietarul le poate aduce din vechiul CRM, din Setări → Import istoric." : "Niciun raport pentru filtrele alese."}</div>
        ) : (
          <ReportTable rows={data.rows} base={base} today={today} sort={sp.sort} sortHref={(sort) => link({ sort })} />
        )}
        {pages > 1 && (
          <div className="actions repPager" style={{ justifyContent: "space-between" }}>
            <span className="muted">Pagina {page} din {pages}</span>
            <span className="actions">
              {page > 1 && <a className="btn btnGhost btnSm" href={link({ page: String(page - 1) })}>← Înapoi</a>}
              {page < pages && <a className="btn btnGhost btnSm" href={link({ page: String(page + 1) })}>Înainte →</a>}
            </span>
          </div>
        )}
      </section>
    </CrmShell>
  );
}
