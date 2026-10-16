import { niceName } from "@/lib/labels";
import type { Metadata } from "next";
import { fmtDate, staffPage } from "@/lib/guard";
import { cap, DUE_FILTERS, inspectionState, lei, listReports, PAGE_SIZE, REPORT_SORTS, REPORT_STATUS, REPORT_TABS, reportFacets, reportTabCounts, STAGE_FILTERS } from "@/lib/reports";
import { STAGE_LABEL } from "@/lib/dossier";
import { ReportFilters } from "./ReportFilters";
import { CrmShell } from "@/components/CrmShell";
import { ClickRow } from "@/components/ClickRow";
import { can } from "@/lib/perms";

export const metadata: Metadata = { title: "Rapoarte | CRM VALUEFY" };
export const dynamic = "force-dynamic";

type SP = { q?: string; status?: string; year?: string; bank?: string; issuer?: string; evaluator?: string; sort?: string; page?: string; etapa?: string; termen?: string; ale?: string; "fara-acces"?: string };

export default async function ReportsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const { db, user, base } = await staffPage();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  // Without "reports.all": only the reports of the user's team work. With it, "Ale mele" narrows the list the same way.
  const all = can(user, "reports.all"), fees = can(user, "fees");
  const mine = !all || sp.ale === "1" ? user.id : undefined;
  const f = { ...sp, page, mine };
  const [data, facets, counts] = await Promise.all([listReports(db, f), reportFacets(db, mine), reportTabCounts(db, f)]);
  const tab = sp.status === "draft" ? "in_progress" : sp.status ?? "";
  const pages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));
  const link = (change: Partial<SP>) => {
    const next = { ...sp, page: undefined, ...change };
    const qs = Object.entries(next).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v as string)}`).join("&");
    return `${base}/rapoarte${qs ? `?${qs}` : ""}`;
  };


  return (
    <CrmShell user={user} base={base} active="reports" title={mine ? "Rapoartele mele" : "Rapoarte"}
      subtitle={mine ? "Rapoartele la care ești în echipă (cele finalizate: ca evaluator principal sau verificator)" : `Toate rapoartele: VALUEFY și firmele partenere${fees && data.fees ? ` · onorarii finalizate ${lei(Math.round(data.fees))}` : ""}`}
      actions={all ? <a className={`btn btnSm ${mine ? "btnGold" : "btnGhost"}`} href={link({ ale: mine ? undefined : "1" })}>{mine ? "Toate rapoartele" : "Rapoartele mele"}</a> : undefined}>
      {sp["fara-acces"] && <div className="note">Nu ai acces la acel raport: rapoartele finalizate le văd evaluatorul principal și verificatorul.</div>}
      <section className="card">
        <ReportFilters
          base={base} total={data.total} current={{ q: sp.q, status: sp.status, year: sp.year, bank: sp.bank, issuer: sp.issuer, evaluator: sp.evaluator, sort: sp.sort }}
          years={facets.years.map((y) => [String(y.y), String(y.y), y.n])}
          banks={facets.banks.map((b) => [b.code, b.code, b.n])}
          issuers={facets.issuers.map((i) => [i.id, i.name, i.n])}
          evaluators={facets.evaluators.map((e) => [e.id, e.name, e.n])}
          sorts={Object.entries(REPORT_SORTS).filter(([k]) => fees || k !== "fee").map(([k, [l]]) => [k, l])}
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
        {data.rows.length === 0 ? (
          <div className="empty">{data.total === 0 && !sp.q ? "Nu există încă rapoarte. Proprietarul le poate aduce din Glide, din meniul Import Glide." : "Niciun raport pentru filtrele alese."}</div>
        ) : (
          <div className="tableWrap">
            <table className="table">
              <thead><tr><th>Raport</th><th>Emis de · bancă</th><th>Client</th><th>Proprietate</th><th>Evaluator</th><th>Inspecție</th><th>Status raport</th><th style={{ textAlign: "right" }}>{fees ? "Valoare · onorariu" : "Valoare"}</th></tr></thead>
              <tbody>
                {data.rows.map((r) => {
                  const [label, cls] = REPORT_STATUS[r.status] ?? [r.status, ""];
                  const [type, address] = (r.asset ?? "|").split("|");
                  const [insp, inspCls, inspDate] = inspectionState(r);
                  const own = /valuefy/i.test(r.issuer_name ?? "");
                  return (
                    <ClickRow key={r.id} href={`${base}/rapoarte/${r.id}`}>
                      <td>{r.number ? <a className="ref rowLink" href={`${base}/rapoarte/${r.id}`}>{r.number}</a> : <a className="rowLink muted" href={`${base}/rapoarte/${r.id}`}>fără număr</a>}<div className="muted">{fmtDate(r.report_date)}</div></td>
                      <td>{r.issuer_name ? <span className={`pill ${own ? "" : "pillWarn"}`} title={r.issuer_name}>{niceName(r.issuer_short ?? r.issuer_name)}</span> : <span className="muted">—</span>}<div className="muted">{r.bank_code ?? "fără bancă"}</div></td>
                      <td><a className="rowLink" href={`${base}/rapoarte/${r.id}`}>{niceName(r.client_name) || "—"}</a><div className="muted">{r.report_type}</div></td>
                      <td style={{ minWidth: 200 }}>{cap(type) || "—"}<div className="muted">{address}</div></td>
                      <td>{r.evaluator ?? "—"}</td>
                      <td style={{ whiteSpace: "nowrap" }}>{inspCls ? <span className={`pill ${inspCls}`}><i />{insp}</span> : <span className="muted">{insp}</span>}{inspDate && <div className="muted">{fmtDate(inspDate)}</div>}</td>
                      <td><span className={`pill ${cls}`}><i />{label}</span></td>
                      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>{lei(r.result_value)}{fees && <div className="muted">{r.fee ? lei(r.fee) : "—"}</div>}</td>
                    </ClickRow>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {pages > 1 && (
          <div className="actions" style={{ justifyContent: "space-between" }}>
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
