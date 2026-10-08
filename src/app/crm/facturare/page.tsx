import type { Metadata } from "next";
import { staffPage } from "@/lib/guard";
import { isAdmin } from "@/lib/users";
import { bucharestDay } from "@/lib/db";
import { niceName } from "@/lib/labels";
import { invoicesFor } from "@/lib/billing";
import { CrmShell } from "@/components/CrmShell";
import { ClickRow } from "@/components/ClickRow";

export const metadata: Metadata = { title: "Facturare | CRM VALUEFY" };
export const dynamic = "force-dynamic";

const STATES: [string, string][] = [["", "Toate"], ["neincasate", "De încasat"], ["scadente", "Scadente"], ["paid", "Încasate"], ["proforma", "Proforme"], ["cancelled", "Anulate"]];
const lei = (n: number | null) => (n == null ? "—" : `${n.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} lei`);
const day = (d: string | null) => (d ? d.slice(0, 10).split("-").reverse().join(".") : "—");

/** Every invoice and proforma issued from the CRM (Oblio), with what is still to be collected. */
export default async function BillingPage({ searchParams }: { searchParams: Promise<{ stare?: string; q?: string }> }) {
  const { db, user, base } = await staffPage();
  const sp = await searchParams;
  const stare = STATES.some(([k]) => k === sp.stare) ? sp.stare ?? "" : "";
  const [rows, all] = await Promise.all([
    invoicesFor(db, { status: stare === "proforma" ? undefined : stare || undefined, kind: stare === "proforma" ? "proforma" : undefined, q: sp.q, limit: 500 }),
    invoicesFor(db, { limit: 5000 }),
  ]);
  const t = bucharestDay();
  const open = all.filter((i) => i.kind === "invoice" && i.status === "issued");
  const overdue = open.filter((i) => i.due_date && i.due_date < t);
  const month = all.filter((i) => i.kind === "invoice" && i.status !== "cancelled" && i.issue_date.slice(0, 7) === t.slice(0, 7));
  const sum = (l: typeof all) => l.reduce((s, i) => s + (i.total ?? 0), 0);
  const link = (k: string) => `${base}/facturare${k ? `?stare=${k}` : ""}`;
  return (
    <CrmShell user={user} base={base} active="invoicing" title="Facturare" subtitle="Facturi și proforme emise din CRM prin Oblio"
      actions={isAdmin(user) ? <a href={`${base}/setari/facturare`} className="btn btnGhost btnSm">Setări facturare</a> : undefined}>
      <div className="dbKpis ibKpis">
        <a className="dbKpi" href={link("neincasate")}><span className="dbKpiLabel"><i style={{ background: "var(--acc)" }} />De încasat</span><b className="ctKpiMoney">{lei(sum(open))}</b><small className="ctKpiFoot">{open.length} facturi</small></a>
        <a className="dbKpi" href={link("scadente")}><span className="dbKpiLabel"><i style={{ background: "var(--err)" }} />Scadente</span><b className="ctKpiMoney">{lei(sum(overdue))}</b><small className="ctKpiFoot">{overdue.length} facturi</small></a>
        <a className="dbKpi" href={link("")}><span className="dbKpiLabel"><i style={{ background: "var(--ink)" }} />Facturat luna aceasta</span><b className="ctKpiMoney">{lei(sum(month))}</b><small className="ctKpiFoot">{month.length} facturi</small></a>
      </div>
      <section className="card">
        <form className="filterBar" action={`${base}/facturare`}>
          <span className="segment ibStates" role="group" aria-label="Stare">
            {STATES.map(([k, l]) => <a key={k || "all"} href={link(k)} aria-pressed={stare === k}>{l}</a>)}
          </span>
          {stare && <input type="hidden" name="stare" value={stare} />}
          <input className="search" name="q" defaultValue={sp.q ?? ""} placeholder="Caută client, serie și număr… ↵" aria-label="Caută" />
        </form>
        {rows.length === 0 ? <div className="empty">{all.length ? "Niciun document pentru filtrele alese." : "Nu s-a emis încă nicio factură din CRM. Emiterea se face din contract (clienți direcți) sau din raport (per comandă), după configurarea din Setări → Facturare."}</div> : (
          <div className="tableWrap">
            <table className="table">
              <thead><tr><th>Document</th><th>Client</th><th>Contract</th><th style={{ textAlign: "right" }}>Total</th><th>Scadență</th><th>Stare</th><th /></tr></thead>
              <tbody>
                {rows.map((i) => (
                  <ClickRow key={i.id} href={i.contract_id ? `${base}/contracte/${i.contract_id}` : `/api/crm/invoices/${i.id}/pdf`}>
                    <td><b className="mono">{i.series} {i.number}</b><div className="muted">{i.kind === "proforma" ? "Proformă" : "Factură"} · {day(i.issue_date)}</div></td>
                    <td>{i.client_id ? <a className="rowLink" href={`${base}/clienti/${i.client_id}`}>{niceName(i.client_name)}</a> : niceName(i.client_name)}</td>
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
