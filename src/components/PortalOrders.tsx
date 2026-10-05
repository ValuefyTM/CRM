"use client";

import { useMemo, useState } from "react";
import { FilterSelect } from "./FilterSelect";

export type PortalOrderRow = { id: string; ref: string; type: string; address: string; client: string; purpose: string; urgent: boolean; docsMissing: boolean; status: [string, string]; created: string };

const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Order list for partners and clients (design §3), with search and filters. */
export function PortalOrders({ rows, base, partner, compact }: { rows: PortalOrderRow[]; base: string; partner: boolean; compact?: boolean }) {
  const [q, setQ] = useState("");
  const [f, setF] = useState("all");
  const filters: [string, string, (r: PortalOrderRow) => boolean][] = [
    ["all", "Toate", () => true],
    ["action", "Necesită acțiune", (r) => r.docsMissing],
    ["progress", "În lucru", (r) => !r.docsMissing],
    ["urgent", "Urgente", (r) => r.urgent],
  ];
  const shown = useMemo(() => {
    const test = filters.find(([k]) => k === f)![2];
    const t = fold(q.trim());
    return rows.filter((r) => test(r) && (!t || fold([r.ref, r.type, r.address, r.client, r.purpose].join(" ")).includes(t)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, q, f]);
  return (
    <section className="card">
      <div className="cardHead">
        <h2>{compact ? (partner ? "Comenzi recente" : "Evaluările mele") : "Toate comenzile"}</h2>
        {compact && rows.length > 0 && <a href={`${base}/comenzi`} className="btn btnGhost btnSm">Toate →</a>}
      </div>
      {!compact && rows.length > 0 && (
        <>
          <div className="filterBar">
            <input className="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Caută după nr. comandă, adresă, client…" aria-label="Caută" />
            <FilterSelect label="Arată" value={f === "all" ? "" : f} onChange={(v) => setF(v || "all")} options={filters.filter(([k]) => k !== "all").map(([k, l, t]) => [k, l, rows.filter(t).length])} />
          </div>
        </>
      )}
      {rows.length === 0 ? (
        <div className="empty">
          {partner ? "Nu ai trimis încă nicio comandă." : "Nu ai încă nicio evaluare comandată."}{" "}
          <a className="rowLink" href={`${base}/comenzi/noua`}>{partner ? "Lansează prima comandă →" : "Solicită o evaluare →"}</a>
        </div>
      ) : shown.length === 0 ? (
        <div className="empty">Nicio comandă pentru filtrele alese.</div>
      ) : (
        <div className="tableWrap">
          <table className="table" style={{ minWidth: 0 }}>
            <thead><tr><th>Comandă</th><th>Proprietate</th>{partner && <th className="hideSm">Client</th>}<th className="hideSm">Scop</th><th>Status</th></tr></thead>
            <tbody>
              {(compact ? shown.slice(0, 6) : shown).map((r) => (
                <tr key={r.id}>
                  <td><a className="ref rowLink" href={`${base}/comenzi/${r.id}`}>{r.ref}</a><div className="muted">{r.created}</div></td>
                  <td><a className="rowLink" href={`${base}/comenzi/${r.id}`}>{r.type}</a><div className="muted">{r.address}</div></td>
                  {partner && <td className="hideSm">{r.client}</td>}
                  <td className="hideSm">{r.purpose}</td>
                  <td><span className="actions" style={{ gap: 6 }}>{r.urgent && <span className="pill pillErr"><i />Urgent</span>}<span className={`pill ${r.status[1]}`}><i />{r.status[0]}</span></span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
