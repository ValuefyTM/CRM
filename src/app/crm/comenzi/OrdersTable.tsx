"use client";

import { useMemo, useState } from "react";

export type CrmOrderRow = {
  id: string; ref: string; created: string; type: string; address: string; client: string; clientPhone: string | null;
  from: string; fromId: string | null; firm: string | null; firmId: string | null; source: string; purpose: string; bank: string | null;
  bankRef: string | null; branch: string | null; reportType: string | null; fee: number | null; contract: string | null;
  urgent: boolean; unread: boolean; docs: number; docsMissing: boolean; status: [string, string]; today: boolean; pending: boolean;
};

const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Shared with the bank tab and the cards above the tabs (?f=…). */
export const ORDER_FILTERS: Record<string, (r: CrmOrderRow) => boolean> = {
  all: () => true,
  pending: (r) => r.pending,
  today: (r) => r.today,
  new: (r) => r.unread,
  docs: (r) => r.docsMissing,
  urgent: (r) => r.urgent && r.pending,
};

const FILTERS: [string, string, (r: CrmOrderRow) => boolean][] = [
  ["all", "Toate", () => true],
  ["pending", "Neprocesate", ORDER_FILTERS.pending],
  ["today", "Astăzi", ORDER_FILTERS.today],
  ["new", "Noi (nedeschise)", (r) => r.unread],
  ["docs", "Documente lipsă", (r) => r.docsMissing],
  ["urgent", "Urgente", ORDER_FILTERS.urgent],
  ["partner", "De la colaboratori", (r) => r.source === "partner"],
  ["collab", "Colaborări firme evaluare", (r) => r.source === "collab"],
  ["client", "De la clienți", (r) => r.source === "client"],
];

/** Orders placed in the portal by partner users (for their clients) and by direct clients. */
export function OrdersTable({ rows, base, initial }: { rows: CrmOrderRow[]; base: string; initial: string }) {
  const [q, setQ] = useState("");
  const [f, setF] = useState(initial);
  const [limit, setLimit] = useState(100);
  const shown = useMemo(() => {
    const test = FILTERS.find(([k]) => k === f)?.[2] ?? (() => true);
    const t = fold(q.trim());
    return rows.filter((r) => test(r) && (!t || fold([r.ref, r.type, r.address, r.client, r.clientPhone, r.from, r.firm, r.purpose].filter(Boolean).join(" ")).includes(t)));
  }, [rows, q, f]);
  return (
    <section className="card">
      <div className="toolbar">
        <input className="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Caută după nr. comandă, adresă, client, colaborator…" aria-label="Caută" />
      </div>
      <div className="filters" role="group" aria-label="Filtre">
        {FILTERS.map(([k, l, t]) => <button key={k} type="button" aria-pressed={f === k} onClick={() => setF(k)}>{l} <small>{rows.filter(t).length}</small></button>)}
      </div>
      {shown.length === 0 ? (
        <div className="empty">{rows.length ? "Nicio comandă pentru filtrele alese." : "Nu a venit încă nicio comandă din portal, de la colaboratori sau clienți."}</div>
      ) : (
        <div className="tableWrap">
          <table className="table">
            <thead><tr><th>Comandă</th><th>Proprietate</th><th>Client</th><th>Trimisă de</th><th>Scop</th><th>Documente</th><th>Status</th></tr></thead>
            <tbody>
              {shown.slice(0, limit).map((r) => (
                <tr key={r.id} className={r.unread ? "unread" : undefined}>
                  <td><a className="ref rowLink" href={`${base}/comenzi/${r.id}`}>{r.ref}</a><div className="muted">{r.created}</div></td>
                  <td><a className="rowLink" href={`${base}/comenzi/${r.id}`}>{r.type}</a><div className="muted">{r.address}</div></td>
                  <td>{r.client}<div className="muted" style={{ whiteSpace: "nowrap" }}>{r.clientPhone}</div></td>
                  <td>
                    {r.fromId ? <a className="rowLink" style={{ fontWeight: 500 }} href={`${base}/utilizatori/${r.fromId}`}>{r.from}</a> : r.from}
                    <div className="muted">{r.firmId ? <a href={`${base}/utilizatori/firme/${r.firmId}`}>{r.firm}</a> : r.source === "collab" ? "Colaborare" : r.source === "partner" ? "Colaborator" : "Client direct"}</div>
                  </td>
                  <td>{r.purpose}</td>
                  <td>{r.docs ? `${r.docs} fișier${r.docs > 1 ? "e" : ""}` : <span className="muted">—</span>}</td>
                  <td>
                    <span className="actions" style={{ gap: 6 }}>
                      {r.unread && <span className="pill pillInfo"><i />Nouă</span>}
                      {r.urgent && <span className="pill pillErr"><i />Urgent</span>}
                      <span className={`pill ${r.status[1]}`}><i />{r.status[0]}</span>
                    </span>
                  </td>
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
