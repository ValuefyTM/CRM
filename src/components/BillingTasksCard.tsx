// Server component: "De facturat" on the dashboards, for those who may issue invoices without the Facturare module
// in their menu: the finished reports on contracts invoiced per report, with the preview / issue and "Facturat din
// Oblio" buttons. The list is derived, so a report leaves it as soon as anyone invoices it.
import { niceName } from "@/lib/labels";
import { getDb } from "@/lib/db";
import { ownBillingOnly, toBill } from "@/lib/billing-tasks";
import type { WithPerms } from "@/lib/perms";
import { IssueInvoice } from "./Invoices";
import { BilledOutside } from "./BilledOutside";
import { ClickRow } from "./ClickRow";

const lei = (n: number | null) => (n == null ? "—" : `${n.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} lei`);
const day = (d: string | null) => (d ? d.slice(0, 10).split("-").reverse().join(".") : "—");

export async function BillingTasksCard({ user, base }: { user: WithPerms & { id: string }; base: string }) {
  // The database comes from getDb, not as a prop: a binding cannot be passed between components.
  const db = await getDb();
  if (!db) return null;
  const own = ownBillingOnly(user);
  const tasks = await toBill(db, own ? user.id : undefined);
  if (!tasks.length) return null;
  return (
    <section className="card">
      <div className="cardHead"><h2>De facturat</h2><span className="muted">{own ? "rapoartele tale finalizate, cu factura la raport" : "rapoarte finalizate pe contracte facturate la raport, fără factură încă"}</span></div>
      <div className="tableWrap">
        <table className="table">
          <thead><tr><th>Raport</th><th>Client</th>{!own && <th>Evaluator</th>}<th>Finalizat</th><th style={{ textAlign: "right" }}>Onorariu</th><th /></tr></thead>
          <tbody>
            {tasks.slice(0, 20).map((x) => (
              <ClickRow key={x.id} href={`${base}/rapoarte/${x.id}`}>
                <td><b className="mono">{x.number ? `nr. ${x.number}` : "fără număr"}</b>{x.label && <div className="muted">{x.label}</div>}</td>
                <td><b>{niceName(x.party) || "—"}</b><div className="muted">{x.collab ? "colaborare" : x.contract_number ? `contract cadru nr. ${x.contract_number}` : ""}{x.bank_ref ? ` · comanda ${x.bank_ref}` : ""}</div></td>
                {!own && <td>{x.evaluator ?? <span className="muted">—</span>}</td>}
                <td>{day(x.finished_at)}</td>
                <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>{x.fee ? lei(x.fee) : <span className="pill pillErr"><i />fără onorariu</span>}</td>
                <td><span className="actions" style={{ flexWrap: "nowrap" }}><IssueInvoice report={x.id} label="Previzualizează și emite" /><BilledOutside report={x.id} /></span></td>
              </ClickRow>
            ))}
          </tbody>
        </table>
      </div>
      {tasks.length > 20 && <p className="hint pad">Încă {tasks.length - 20} rapoarte de facturat.</p>}
    </section>
  );
}
