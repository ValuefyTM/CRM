"use client";

import { niceName } from "@/lib/labels";
import { useMemo, useState } from "react";
import { FilterSelect } from "@/components/FilterSelect";
import { ClickRow } from "@/components/ClickRow";

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
/** Status tabs above the order lists ("" = all); the other views (today, unopened…) come from the cards above. */
export const STATUS_TABS: [string, string][] = [["", "Toate"], ["pending", "Neprocesate"], ["progress", "În lucru"], ["done", "Finalizate"], ["suspended", "Suspendate"], ["cancelled", "Anulate"]];
const CARD_VIEWS = new Set(["today", "new", "docs", "urgent"]);

/** Status as tabs (with counts), plus a removable chip when a card above filtered the list. */
export function StatusTabs({ rows, value, onChange, pre }: { rows: CrmOrderRow[]; value: string; onChange: (v: string) => void; pre: (r: CrmOrderRow) => boolean }) {
  const count = (k: string) => (k ? rows.filter((r) => pre(r) && (VIEWS.find(([v]) => v === k)?.[2] ?? (() => true))(r)).length : rows.filter(pre).length);
  return (
    <>
      <span className="segment ibStates ordStates" role="group" aria-label="Status">
        {STATUS_TABS.map(([k, l]) => (
          <button key={k || "all"} type="button" aria-pressed={value === k} onClick={() => onChange(k)}>{l} <small>{count(k).toLocaleString("ro-RO")}</small></button>
        ))}
      </span>
      {CARD_VIEWS.has(value) && <button type="button" className="chipX" onClick={() => onChange("")}>{VIEWS.find(([v]) => v === value)?.[1]} <b aria-hidden>×</b></button>}
    </>
  );
}

const SOURCES: [string, string][] = [["site", "Site valuefy.ro"], ["partner", "Colaboratori (brokeri)"], ["collab", "Colaborări firme evaluare"], ["client", "Clienți din portal"], ["direct", "Lucrări directe"]];

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
        <StatusTabs rows={rows} value={f} onChange={setF} pre={bySource} />
        {/* Each tab is one channel already: the source filter only helps where several are mixed. */}
        {new Set(rows.map((r) => r.source)).size > 1 && <FilterSelect label="De la" value={src} onChange={setSrc} options={SOURCES.map(([k, l]) => [k, l, rows.filter((r) => r.source === k && test(r)).length])} all="Oricine" />}
        <input className="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Caută după nr. comandă, adresă, client, colaborator… ↵" aria-label="Caută" />
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
                <ClickRow key={r.id} href={`${base}/comenzi/${r.id}`} className={r.unread ? "unread" : undefined}>
                  <td><a className="ref rowLink" href={`${base}/comenzi/${r.id}`}>{r.ref}</a><div className="muted">{r.created}</div></td>
                  <td><a className="rowLink" href={`${base}/comenzi/${r.id}`}>{r.type}</a><div className="muted">{r.address}</div></td>
                  <td><b>{niceName(r.client)}</b><div className="muted" style={{ whiteSpace: "nowrap" }}>{r.clientPhone}</div></td>
                  <td>
                    {r.fromId ? <a className="rowLink" style={{ fontWeight: 500 }} href={`${base}/utilizatori/${r.fromId}`}>{r.from}</a> : r.from}
                    <div className="muted">{r.firmId ? <a href={`${base}/utilizatori/firme/${r.firmId}`}>{r.firm}</a> : r.source === "collab" ? "Colaborare" : r.source === "partner" ? "Colaborator" : r.source === "site" ? "Cerere de pe site" : r.source === "direct" ? "Lucrare directă" : "Client din portal"}</div>
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
                </ClickRow>
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
