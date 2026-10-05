"use client";

import { useMemo, useState } from "react";
import { ORDER_FILTERS, type CrmOrderRow } from "./OrdersTable";

const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const lei = (n: number | null) => (n == null ? "—" : `${n.toLocaleString("ro-RO")} lei`);

const STATUS: [string, string, (r: CrmOrderRow) => boolean][] = [
  ["all", "Toate", () => true],
  ["open", "În lucru", (r) => ["received", "in_progress", "draft"].includes(r.status[0] === "Comandă primită" || r.status[0] === "Documente lipsă" ? "received" : r.status[0] === "În lucru" ? "in_progress" : r.status[0] === "Draft" ? "draft" : "")],
  ["done", "Finalizate", (r) => r.status[0] === "Finalizată"],
  ["suspended", "Suspendate", (r) => r.status[0] === "Suspendată"],
  ["cancelled", "Anulate", (r) => r.status[0] === "Anulată"],
];

/**
 * Bank orders under framework contracts: historical ones from Glide, and new ones that will come from the banks'
 * notification emails (forwarded to the CRM, parsed per bank).
 */
export function BankOrdersTable({ rows, base, initial = "all" }: { rows: CrmOrderRow[]; base: string; initial?: string }) {
  const [q, setQ] = useState("");
  const [bank, setBank] = useState("all");
  const [st, setSt] = useState("all");
  const [f, setF] = useState(initial in ORDER_FILTERS ? initial : "all");
  const [limit, setLimit] = useState(100);
  const banks = [...new Set(rows.map((r) => r.bank).filter(Boolean))] as string[];
  const stTest = STATUS.find(([k]) => k === st)![2];
  const shown = useMemo(() => {
    const t = fold(q.trim());
    return rows.filter((r) => ORDER_FILTERS[f](r) && stTest(r) && (bank === "all" || r.bank === bank) &&
      (!t || fold([r.ref, r.bankRef, r.client, r.branch, r.bank, r.contract].filter(Boolean).join(" ")).includes(t)));
  }, [rows, q, bank, f, stTest]);

  if (!rows.length)
    return (
      <section className="card">
        <h2>Comenzi de la bănci</h2>
        <div className="empty">
          Aici apar comenzile primite prin aplicațiile băncilor, pe baza contractelor cadru.<br />
          Istoricul se poate aduce din Glide (Import Glide), iar comenzile noi vor fi preluate automat din emailurile de notificare ale băncilor.
        </div>
      </section>
    );

  return (
    <section className="card">
      <div className="toolbar">
        <input className="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Caută după nr. comandă, client, agenție…" aria-label="Caută" />
      </div>
      <div className="filters" role="group" aria-label="Bancă">
        {[["all", "Toate băncile"], ...banks.map((b) => [b, b])].map(([k, l]) => (
          <button key={k} type="button" aria-pressed={bank === k} onClick={() => setBank(k)}>{l} <small>{k === "all" ? rows.length : rows.filter((r) => r.bank === k).length}</small></button>
        ))}
      </div>
      <div className="filters" role="group" aria-label="Status">
        {STATUS.map(([k, l, test]) => (
          <button key={k} type="button" aria-pressed={st === k} onClick={() => setSt(k)}>{l} <small>{rows.filter((r) => (bank === "all" || r.bank === bank) && test(r)).length}</small></button>
        ))}
      </div>
      {f !== "all" && <div className="actions"><span className="muted">Filtru din carduri activ.</span><button type="button" className="linkBtn" onClick={() => setF("all")}>Arată toate</button></div>}
      {shown.length === 0 ? <div className="empty">Nicio comandă pentru filtrele alese.</div> : (
        <div className="tableWrap">
          <table className="table">
            <thead><tr><th>Comandă</th><th>Bancă · agenție</th><th>Client</th><th>Tip raport</th><th style={{ textAlign: "right" }}>Tarif</th><th>Status</th></tr></thead>
            <tbody>
              {shown.slice(0, limit).map((r) => (
                <tr key={r.id} className={r.unread ? "unread" : undefined}>
                  <td><a className="ref rowLink" href={`${base}/comenzi/${r.id}`}>{r.bankRef ?? r.ref}</a><div className="muted">{r.created}</div></td>
                  <td>{r.bank ?? "—"}{r.branch && <div className="muted">{r.branch}</div>}</td>
                  <td>{r.client}{r.clientPhone && <div className="muted" style={{ whiteSpace: "nowrap" }}>{r.clientPhone}</div>}</td>
                  <td>{r.reportType ?? r.type}</td>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>{lei(r.fee)}</td>
                  <td><span className="actions" style={{ gap: 6 }}>{r.unread && <span className="pill pillInfo"><i />Nouă</span>}<span className={`pill ${r.status[1]}`}><i />{r.status[0]}</span></span></td>
                </tr>
              ))}
            </tbody>
          </table>
          {shown.length > limit && (
            <div className="actions" style={{ justifyContent: "center", padding: 14 }}>
              <button type="button" className="btn btnGhost btnSm" onClick={() => setLimit(limit + 200)}>Arată mai multe ({shown.length - limit} rămase)</button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
