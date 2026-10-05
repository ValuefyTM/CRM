"use client";

import { useMemo, useState } from "react";

export type CrmOrderRow = {
  id: string; ref: string; created: string; type: string; address: string; client: string; clientPhone: string;
  from: string; fromId: string; firm: string | null; firmId: string | null; source: string; purpose: string; bank: string | null;
  urgent: boolean; unread: boolean; docs: number; docsMissing: boolean; status: [string, string];
};

const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

const FILTERS: [string, string, (r: CrmOrderRow) => boolean][] = [
  ["all", "Toate", () => true],
  ["new", "Noi (nedeschise)", (r) => r.unread],
  ["docs", "Documente lipsă", (r) => r.docsMissing],
  ["urgent", "Urgente", (r) => r.urgent],
  ["partner", "De la colaboratori", (r) => r.source === "partner"],
  ["client", "De la clienți", (r) => r.source === "client"],
];

/** Orders placed in the portal by partner users (for their clients) and by direct clients. */
export function OrdersTable({ rows, base, initial }: { rows: CrmOrderRow[]; base: string; initial: string }) {
  const [q, setQ] = useState("");
  const [f, setF] = useState(initial);
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
              {shown.map((r) => (
                <tr key={r.id} className={r.unread ? "unread" : undefined}>
                  <td><a className="ref rowLink" href={`${base}/comenzi/${r.id}`}>{r.ref}</a><div className="muted">{r.created}</div></td>
                  <td><a className="rowLink" href={`${base}/comenzi/${r.id}`}>{r.type}</a><div className="muted">{r.address}</div></td>
                  <td>{r.client}<div className="muted" style={{ whiteSpace: "nowrap" }}>{r.clientPhone}</div></td>
                  <td>
                    <a className="rowLink" style={{ fontWeight: 500 }} href={`${base}/utilizatori/${r.fromId}`}>{r.from}</a>
                    <div className="muted">{r.firmId ? <a href={`${base}/utilizatori/firme/${r.firmId}`}>{r.firm}</a> : "Client direct"}</div>
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
        </div>
      )}
    </section>
  );
}
