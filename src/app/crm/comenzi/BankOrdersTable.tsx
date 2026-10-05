"use client";

import { useMemo, useState } from "react";
import type { CrmOrderRow } from "./OrdersTable";

const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * Bank orders under framework contracts. They will arrive from the banks' notification emails
 * (forwarded to the CRM, parsed per bank); until that is set up the list stays empty.
 */
export function BankOrdersTable({ rows, base }: { rows: CrmOrderRow[]; base: string }) {
  const [q, setQ] = useState("");
  const [bank, setBank] = useState("all");
  const banks = [...new Set(rows.map((r) => r.bank).filter(Boolean))] as string[];
  const shown = useMemo(() => {
    const t = fold(q.trim());
    return rows.filter((r) => (bank === "all" || r.bank === bank) && (!t || fold([r.ref, r.client, r.address, r.bank].filter(Boolean).join(" ")).includes(t)));
  }, [rows, q, bank]);

  if (!rows.length)
    return (
      <section className="card">
        <h2>Comenzi de la bănci</h2>
        <div className="empty">
          Aici vor apărea comenzile primite prin aplicațiile băncilor, pe baza contractelor cadru.<br />
          Emailul de notificare al băncii este preluat automat: numărul comenzii, banca, clientul și proprietatea, cu emailul original atașat.
          <br /><span className="muted">Preluarea din email se activează după ce primim exemplele de notificări de la fiecare bancă.</span>
        </div>
      </section>
    );

  return (
    <section className="card">
      <div className="toolbar">
        <input className="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Caută după nr. comandă, client, adresă…" aria-label="Caută" />
      </div>
      <div className="filters" role="group" aria-label="Bancă">
        {[["all", "Toate băncile"], ...banks.map((b) => [b, b])].map(([k, l]) => (
          <button key={k} type="button" aria-pressed={bank === k} onClick={() => setBank(k)}>{l} <small>{k === "all" ? rows.length : rows.filter((r) => r.bank === k).length}</small></button>
        ))}
      </div>
      {shown.length === 0 ? <div className="empty">Nicio comandă pentru filtrele alese.</div> : (
        <div className="tableWrap">
          <table className="table">
            <thead><tr><th>Comandă</th><th>Bancă</th><th>Client</th><th>Proprietate</th><th>Status</th></tr></thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id} className={r.unread ? "unread" : undefined}>
                  <td><a className="ref rowLink" href={`${base}/comenzi/${r.id}`}>{r.ref}</a><div className="muted">{r.created}</div></td>
                  <td>{r.bank ?? "—"}</td>
                  <td>{r.client}<div className="muted" style={{ whiteSpace: "nowrap" }}>{r.clientPhone}</div></td>
                  <td>{r.type}<div className="muted">{r.address}</div></td>
                  <td><span className="actions" style={{ gap: 6 }}>{r.unread && <span className="pill pillInfo"><i />Nouă</span>}<span className={`pill ${r.status[1]}`}><i />{r.status[0]}</span></span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
