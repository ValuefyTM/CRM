import { niceName } from "@/lib/labels";
import type { Metadata } from "next";
import { fmtDate, staffPage } from "@/lib/guard";
import { cap, lei, listReports, PAGE_SIZE, REPORT_SORTS, REPORT_STATUS, reportFacets } from "@/lib/reports";
import { ReportFilters } from "./ReportFilters";
import { CrmShell } from "@/components/CrmShell";

export const metadata: Metadata = { title: "Rapoarte | CRM VALUEFY" };
export const dynamic = "force-dynamic";

type SP = { q?: string; status?: string; year?: string; bank?: string; issuer?: string; evaluator?: string; sort?: string; page?: string };

export default async function ReportsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const { db, user, base } = await staffPage();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const [data, facets] = await Promise.all([listReports(db, { ...sp, page }), reportFacets(db)]);
  const pages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));
  const link = (change: Partial<SP>) => {
    const next = { ...sp, page: undefined, ...change };
    const qs = Object.entries(next).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v as string)}`).join("&");
    return `${base}/rapoarte${qs ? `?${qs}` : ""}`;
  };


  return (
    <CrmShell user={user} base={base} active="reports" title="Rapoarte" subtitle="Toate rapoartele: VALUEFY și colaborările">
      <div className="kpis" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
        <div className="kpi" style={{ ["--dot" as string]: "var(--info)" }}><span><i />Rapoarte</span><b>{data.total.toLocaleString("ro-RO")}</b></div>
        <a className="kpi" href={link({ status: "done" })} style={{ ["--dot" as string]: "var(--ok)" }}><span><i />Finalizate</span><b>{data.done.toLocaleString("ro-RO")}</b></a>
        <a className="kpi" href={link({ status: "in_progress" })} style={{ ["--dot" as string]: "var(--acc)" }}><span><i />În lucru / draft</span><b>{data.open.toLocaleString("ro-RO")}</b></a>
        <a className="kpi" href={link({ status: "suspended" })} style={{ ["--dot" as string]: "var(--err)" }}><span><i />Suspendate</span><b>{data.suspended.toLocaleString("ro-RO")}</b></a>
        <div className="kpi" style={{ ["--dot" as string]: "var(--acc-ink)" }}><span><i />Onorarii (finalizate)</span><b style={{ fontSize: 24 }}>{lei(Math.round(data.fees))}</b></div>
      </div>

      <section className="card">
        <ReportFilters
          base={base} total={data.total} current={{ q: sp.q, status: sp.status, year: sp.year, bank: sp.bank, issuer: sp.issuer, evaluator: sp.evaluator, sort: sp.sort }}
          years={facets.years.map((y) => [String(y.y), String(y.y), y.n])}
          statuses={Object.entries(REPORT_STATUS).map(([k, [l]]) => [k, l])}
          banks={facets.banks.map((b) => [b.code, b.code, b.n])}
          issuers={facets.issuers.map((i) => [i.id, i.name, i.n])}
          evaluators={facets.evaluators.map((e) => [e.id, e.name, e.n])}
          sorts={Object.entries(REPORT_SORTS).map(([k, [l]]) => [k, l])}
        />
        {data.rows.length === 0 ? (
          <div className="empty">{data.total === 0 && !sp.q ? "Nu există încă rapoarte. Proprietarul le poate aduce din Glide, din meniul Import Glide." : "Niciun raport pentru filtrele alese."}</div>
        ) : (
          <div className="tableWrap">
            <table className="table">
              <thead><tr><th>Raport</th><th>Client</th><th>Proprietate</th><th>Bancă</th><th>Evaluator</th><th style={{ textAlign: "right" }}>Valoare</th><th style={{ textAlign: "right" }}>Onorariu</th><th>Status</th></tr></thead>
              <tbody>
                {data.rows.map((r) => {
                  const [label, cls] = REPORT_STATUS[r.status] ?? [r.status, ""];
                  const [type, address] = (r.asset ?? "|").split("|");
                  return (
                    <tr key={r.id}>
                      <td>{r.number ? <a className="ref rowLink" href={`${base}/rapoarte/${r.id}`}>{r.number}</a> : <a className="rowLink muted" href={`${base}/rapoarte/${r.id}`}>fără număr</a>}<div className="muted">{fmtDate(r.report_date)}</div></td>
                      <td><a className="rowLink" href={`${base}/rapoarte/${r.id}`}>{niceName(r.client_name) || "—"}</a><div className="muted">{r.report_type}</div></td>
                      <td>{cap(type) || "—"}<div className="muted">{address}</div></td>
                      <td>{r.bank_code ?? "—"}</td>
                      <td>{r.evaluator ?? "—"}</td>
                      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>{lei(r.result_value)}</td>
                      <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>{lei(r.fee)}</td>
                      <td><span className={`pill ${cls}`}><i />{label}</span></td>
                    </tr>
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
