import type { Metadata } from "next";
import { can } from "@/lib/perms";
import { staffPage } from "@/lib/guard";
import { bucharestDay } from "@/lib/db";
import { niceName } from "@/lib/labels";
import { getBilling, invoicesFor } from "@/lib/billing";
import { ownBillingOnly, toBill } from "@/lib/billing-tasks";
import { CrmShell } from "@/components/CrmShell";
import { ClickRow } from "@/components/ClickRow";
import { IssueInvoice } from "@/components/Invoices";
import { BilledOutside } from "@/components/BilledOutside";
import { FeeEdit } from "@/components/FeeEdit";

export const metadata: Metadata = { title: "Facturare | CRM VALUEFY" };
export const dynamic = "force-dynamic";

const STATES: [string, string][] = [["", "Toate"], ["neincasate", "De încasat"], ["scadente", "Scadente"], ["paid", "Încasate"], ["proforma", "Proforme"], ["cancelled", "Anulate"]];
const lei = (n: number | null) => (n == null ? "—" : `${n.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} lei`);
const day = (d: string | null) => (d ? d.slice(0, 10).split("-").reverse().join(".") : "—");

/**
 * Facturare: first what is to be invoiced (the finished reports on contracts invoiced per report: previewed and
 * issued in Oblio from here), then every invoice and proforma issued from the CRM. With "Doar ale lui" (Permisiuni):
 * only the person's own reports to invoice and the invoices they issued.
 */
export default async function BillingPage({ searchParams }: { searchParams: Promise<{ stare?: string; q?: string }> }) {
  const { db, user, base } = await staffPage("billing");
  const sp = await searchParams;
  const own = ownBillingOnly(user);
  const mine = own ? user.id : undefined;
  const stare = STATES.some(([k]) => k === sp.stare) ? sp.stare ?? "" : "";
  const [tasks, rows, all] = await Promise.all([
    toBill(db, mine),
    invoicesFor(db, { status: stare === "proforma" ? undefined : stare || undefined, kind: stare === "proforma" ? "proforma" : undefined, q: sp.q, limit: 500, createdBy: mine }),
    invoicesFor(db, { limit: 5000, createdBy: mine }),
  ]);
  const t = bucharestDay();
  const open = all.filter((i) => i.kind === "invoice" && i.status === "issued");
  const overdue = open.filter((i) => i.due_date && i.due_date < t);
  const month = all.filter((i) => i.kind === "invoice" && i.status !== "cancelled" && i.issue_date.slice(0, 7) === t.slice(0, 7));
  const sum = (l: typeof all) => l.reduce((s, i) => s + (i.total ?? 0), 0);
  const link = (k: string) => `${base}/facturare${k ? `?stare=${k}` : ""}`;
  const canIssue = can(user, "billing:issue");
  const bs = await getBilling(db);
  const vat = bs.vatPayer ? bs.vatPercent : 0;
  return (
    <CrmShell user={user} base={base} active="invoicing" title={own ? "Facturile mele" : "Facturare"}
      subtitle={own ? "Rapoartele tale de facturat și facturile emise de tine, prin Oblio" : "De facturat la raport, apoi facturile și proformele emise din CRM prin Oblio"}
      actions={can(user, "billing.E") && !own ? <a href={`${base}/setari/facturare`} className="btn btnGhost btnSm">Setări facturare</a> : undefined}>
      <div className="dbKpis ibKpis">
        <a className="dbKpi" href="#de-facturat"><span className="dbKpiLabel"><i style={{ background: "var(--info)" }} />De facturat</span><b className="ctKpiMoney">{lei(tasks.reduce((s, x) => s + (x.fee ?? 0), 0))}</b><small className="ctKpiFoot">{tasks.length} {tasks.length === 1 ? "raport" : "rapoarte"}</small></a>
        <a className="dbKpi" href={link("neincasate")}><span className="dbKpiLabel"><i style={{ background: "var(--acc)" }} />De încasat</span><b className="ctKpiMoney">{lei(sum(open))}</b><small className="ctKpiFoot">{open.length} facturi</small></a>
        <a className="dbKpi" href={link("scadente")}><span className="dbKpiLabel"><i style={{ background: "var(--err)" }} />Scadente</span><b className="ctKpiMoney">{lei(sum(overdue))}</b><small className="ctKpiFoot">{overdue.length} facturi</small></a>
        <a className="dbKpi" href={link("")}><span className="dbKpiLabel"><i style={{ background: "var(--ink)" }} />Facturat luna aceasta</span><b className="ctKpiMoney">{lei(sum(month))}</b><small className="ctKpiFoot">{month.length} facturi</small></a>
      </div>

      <section className="card" id="de-facturat">
        <div className="cardHead"><h2>De facturat</h2><span className="muted">rapoarte finalizate pe contracte facturate la raport, fără factură încă</span></div>
        {tasks.length === 0 ? <p className="hint pad">Nimic de facturat. Un raport ajunge aici când e finalizat pe un contract cadru (sau o colaborare) cu facturare „la raport”.</p> : (
          <div className="tableWrap">
            <table className="table">
              <thead><tr><th>Raport</th><th>Client</th><th>Contract</th>{!own && <th>Evaluator</th>}<th>Finalizat</th><th style={{ textAlign: "right" }}>Onorariu</th><th /></tr></thead>
              <tbody>
                {tasks.map((x) => (
                  <ClickRow key={x.id} href={`${base}/rapoarte/${x.id}`}>
                    <td><b className="mono">{x.number ? `nr. ${x.number}` : "fără număr"}</b>{x.label && <div className="muted">{x.label}</div>}</td>
                    <td><b>{niceName(x.party) || "—"}</b>{x.bank_ref && <div className="muted">comanda {x.bank_ref}</div>}</td>
                    <td>{x.collab ? "colaborare" : x.contract_number ? `cadru nr. ${x.contract_number}` : "—"}</td>
                    {!own && <td>{x.evaluator ?? <span className="muted">—</span>}</td>}
                    <td>{day(x.finished_at)}</td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>{x.fee ? lei(x.fee) : <span className="pill pillErr"><i />fără onorariu</span>}{canIssue && <> <FeeEdit report={x.id} fee={x.fee} number={x.number} vatPercent={vat} /></>}</td>
                    <td>{canIssue ? <span className="actions" style={{ flexWrap: "nowrap" }}><IssueInvoice report={x.id} label="Previzualizează și emite" /><BilledOutside report={x.id} /></span> : <span className="muted">fără drept de emitere</span>}</td>
                  </ClickRow>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card">
        <div className="cardHead"><h2>{own ? "Facturile emise de mine" : "Facturi și proforme emise"}</h2></div>
        <form className="filterBar" action={`${base}/facturare`}>
          <span className="segment ibStates" role="group" aria-label="Stare">
            {STATES.map(([k, l]) => <a key={k || "all"} href={link(k)} aria-pressed={stare === k}>{l}</a>)}
          </span>
          {stare && <input type="hidden" name="stare" value={stare} />}
          <input className="search" name="q" defaultValue={sp.q ?? ""} placeholder="Caută client, serie și număr… ↵" aria-label="Caută" />
        </form>
        {rows.length === 0 ? <div className="empty">{all.length ? "Niciun document pentru filtrele alese." : own ? "Nu ai emis încă nicio factură. Le emiți din lista „De facturat” de mai sus." : "Nu s-a emis încă nicio factură din CRM. Emiterea se face din lista „De facturat”, din contract (clienți direcți) sau din raport, după configurarea din Setări → Facturare."}</div> : (
          <div className="tableWrap">
            <table className="table">
              <thead><tr><th>Document</th><th>Client</th><th>Contract</th><th style={{ textAlign: "right" }}>Total</th><th>Scadență</th><th>Stare</th><th /></tr></thead>
              <tbody>
                {rows.map((i) => (
                  <ClickRow key={i.id} href={i.contract_id && !own ? `${base}/contracte/${i.contract_id}` : `/api/crm/invoices/${i.id}/pdf`}>
                    <td><b className="mono">{i.series} {i.number}</b><div className="muted">{i.kind === "proforma" ? "Proformă" : "Factură"} · {day(i.issue_date)}</div></td>
                    <td>{i.client_id && !own ? <a className="rowLink" href={`${base}/clienti/${i.client_id}`}>{niceName(i.client_name)}</a> : niceName(i.client_name)}</td>
                    <td>{i.contract_number ? `nr. ${i.contract_number}` : "—"}</td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>{lei(i.total)}</td>
                    <td>{i.kind === "invoice" ? day(i.due_date) : "—"}</td>
                    <td><span className={`pill ${i.status === "paid" ? "pillOk" : i.status === "cancelled" ? "" : i.kind === "invoice" && i.due_date && i.due_date < t ? "pillErr" : "pillWarn"}`}><i />
                      {i.status === "paid" ? `Încasată ${day(i.paid_at)}` : i.status === "cancelled" ? "Anulată" : i.kind === "proforma" ? "Emisă" : i.due_date && i.due_date < t ? "Scadentă" : "De încasat"}</span></td>
                    <td><a className="btn btnGhost btnSm" href={`/api/crm/invoices/${i.id}/pdf`} target="_blank" rel="noopener">PDF</a></td>
                  </ClickRow>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </CrmShell>
  );
}
