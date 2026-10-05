"use client";

import { useMemo, useState } from "react";
import { FilterSelect } from "@/components/FilterSelect";

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

/** "Situație": the card filters plus the outcome of processed orders. */
export const VIEWS: [string, string, (r: CrmOrderRow) => boolean][] = [
  ["pending", "Neprocesate", ORDER_FILTERS.pending],
  ["today", "Primite astăzi", ORDER_FILTERS.today],
  ["new", "Nedeschise", ORDER_FILTERS.new],
  ["docs", "Documente lipsă", ORDER_FILTERS.docs],
  ["urgent", "Urgente", ORDER_FILTERS.urgent],
  ["progress", "În lucru", (r) => r.status[0] === "În lucru" || r.status[0] === "Draft"],
  ["done", "Finalizate", (r) => r.status[0] === "Finalizată"],
  ["suspended", "Suspendate", (r) => r.status[0] === "Suspendată"],
  ["cancelled", "Anulate", (r) => r.status[0] === "Anulată"],
];
const SOURCES: [string, string][] = [["partner", "Colaboratori (brokeri)"], ["collab", "Colaborări firme evaluare"], ["client", "Clienți direcți"]];

/** Orders placed in the portal by partner users (for their clients) and by direct clients. */
export function OrdersTable({ rows, base, initial }: { rows: CrmOrderRow[]; base: string; initial: string }) {
  const [q, setQ] = useState("");
  const [f, setF] = useState(VIEWS.some(([k]) => k === initial) ? initial : "");
  const [src, setSrc] = useState("");
  const [limit, setLimit] = useState(100);
  const test = VIEWS.find(([k]) => k === f)?.[2] ?? (() => true);
  const bySource = (r: CrmOrderRow) => !src || r.source === src;
  const shown = useMemo(() => {
    const t = fold(q.trim());
    return rows.filter((r) => test(r) && bySource(r) && (!t || fold([r.ref, r.type, r.address, r.client, r.clientPhone, r.from, r.firm, r.purpose].filter(Boolean).join(" ")).includes(t)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, q, f, src]);
  const active = [q.trim(), f, src].filter(Boolean).length;
  return (
    <section className="card">
      <div className="filterBar">
        <input className="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Caută după nr. comandă, adresă, client, colaborator…" aria-label="Caută" />
        <FilterSelect label="Situație" value={f} onChange={setF} options={VIEWS.map(([k, l, t]) => [k, l, rows.filter((r) => bySource(r) && t(r)).length])} />
        <FilterSelect label="De la" value={src} onChange={setSrc} options={SOURCES.map(([k, l]) => [k, l, rows.filter((r) => r.source === k && test(r)).length])} all="Oricine" />
      </div>
      <div className="resultLine">
        <span><b style={{ color: "var(--ink)" }}>{shown.length.toLocaleString("ro-RO")}</b> din {rows.length.toLocaleString("ro-RO")} comenzi</span>
        {active > 0 && <button type="button" className="resetLink" style={{ height: "auto", padding: 0 }} onClick={() => { setQ(""); setF(""); setSrc(""); }}>✕ Resetează filtrele</button>}
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
