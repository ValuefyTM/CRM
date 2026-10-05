"use client";

import { useMemo, useState } from "react";
import { FilterSelect } from "@/components/FilterSelect";

export type LeadRow = {
  id: string; created: string; kind: "sale" | "valuation"; status: string; statusLabel: [string, string]; urgent: boolean; today: boolean;
  name: string; phone: string | null; email: string | null; type: string; place: string; purpose: string; files: number;
};

const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Requests sent from the valuefy.ro assistant: valuations and properties to sell. */
export function LeadsTable({ rows, base, statuses, initial }: { rows: LeadRow[]; base: string; statuses: [string, string][]; initial?: string }) {
  const [q, setQ] = useState("");
  const [st, setSt] = useState(initial === "pending" ? "NEW" : "");
  const [kind, setKind] = useState("");
  const [limit, setLimit] = useState(100);
  const shown = useMemo(() => {
    const t = fold(q.trim());
    return rows.filter((r) => (!st || r.status === st) && (!kind || r.kind === kind) && (initial !== "today" || r.today) &&
      (!t || fold([r.id, r.name, r.phone, r.email, r.place, r.type, r.purpose].filter(Boolean).join(" ")).includes(t)));
  }, [rows, q, st, kind, initial]);

  if (!rows.length)
    return <section className="card"><h2>Cereri de pe site</h2><div className="empty">Nicio cerere trimisă încă prin asistentul de pe valuefy.ro.</div></section>;

  return (
    <section className="card">
      <div className="filterBar">
        <input className="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Caută după nr. cerere, nume, telefon, adresă…" aria-label="Caută" />
        <FilterSelect label="Status" value={st} onChange={setSt} options={statuses.map(([k, l]) => [k, l, rows.filter((r) => r.status === k && (!kind || r.kind === kind)).length])} />
        <FilterSelect label="Tip" value={kind} onChange={setKind} options={[["valuation", "Evaluare", rows.filter((r) => r.kind === "valuation").length], ["sale", "Vânzare", rows.filter((r) => r.kind === "sale").length]]} />
      </div>
      <div className="resultLine">
        <span><b style={{ color: "var(--ink)" }}>{shown.length.toLocaleString("ro-RO")}</b> din {rows.length.toLocaleString("ro-RO")} cereri</span>
        {(q || st || kind) && <button type="button" className="resetLink" style={{ height: "auto", padding: 0 }} onClick={() => { setQ(""); setSt(""); setKind(""); }}>✕ Resetează filtrele</button>}
      </div>
      {shown.length === 0 ? <div className="empty">Nicio cerere pentru filtrele alese.</div> : (
        <div className="tableWrap">
          <table className="table">
            <thead><tr><th>Cerere</th><th>Client</th><th>Proprietate</th><th>Scop</th><th>Status</th></tr></thead>
            <tbody>
              {shown.slice(0, limit).map((r) => (
                <tr key={r.id} className={r.status === "NEW" ? "unread" : undefined}>
                  <td><a className="ref rowLink" href={`${base}/comenzi/site/${r.id}`}>{r.id}</a><div className="muted">{r.created}</div></td>
                  <td><a className="rowLink" href={`${base}/comenzi/site/${r.id}`}>{r.name}</a><div className="muted" style={{ whiteSpace: "nowrap" }}>{r.phone ?? r.email ?? ""}</div></td>
                  <td>{r.type}<div className="muted">{r.place}</div></td>
                  <td>{r.kind === "sale" ? <span className="pill pillInfo"><i />Vânzare</span> : r.purpose}{r.files > 0 && <div className="muted">{r.files} fișier{r.files > 1 ? "e" : ""}</div>}</td>
                  <td><span className="actions" style={{ gap: 6 }}>{r.urgent && <span className="pill pillErr"><i />Urgent</span>}<span className={`pill ${r.statusLabel[1]}`}><i />{r.statusLabel[0]}</span></span></td>
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
