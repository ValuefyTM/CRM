"use client";

import { niceName } from "@/lib/labels";
import { useMemo, useState } from "react";
import { FilterSelect } from "@/components/FilterSelect";
import { VIEWS, type CrmOrderRow } from "./OrdersTable";
import { ClickRow } from "@/components/ClickRow";

const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const lei = (n: number | null) => (n == null ? "—" : `${n.toLocaleString("ro-RO")} lei`);


/**
 * Bank orders under framework contracts: historical ones from Glide, and new ones that will come from the banks'
 * notification emails (forwarded to the CRM, parsed per bank).
 */
export function BankOrdersTable({ rows, base, initial = "all" }: { rows: CrmOrderRow[]; base: string; initial?: string }) {
  const [q, setQ] = useState("");
  const [bank, setBank] = useState("");
  const [f, setF] = useState(VIEWS.some(([k]) => k === initial) ? initial : "");
  const [limit, setLimit] = useState(100);
  const banks = [...new Set(rows.map((r) => r.bank).filter(Boolean))] as string[];
  const test = VIEWS.find(([k]) => k === f)?.[2] ?? (() => true);
  const byBank = (r: CrmOrderRow) => !bank || r.bank === bank;
  const shown = useMemo(() => {
    const t = fold(q.trim());
    return rows.filter((r) => test(r) && byBank(r) && (!t || fold([r.ref, r.bankRef, r.client, r.branch, r.bank, r.contract].filter(Boolean).join(" ")).includes(t)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, q, bank, f]);
  const active = [q.trim(), f, bank].filter(Boolean).length;

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
      <div className="filterBar">
        <input className="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Caută după nr. comandă, client, agenție…" aria-label="Caută" />
        <FilterSelect label="Bancă" value={bank} onChange={setBank} options={banks.map((b) => [b, b, rows.filter((r) => r.bank === b && test(r)).length])} />
        <FilterSelect label="Situație" value={f} onChange={setF} options={VIEWS.map(([k, l, t]) => [k, l, rows.filter((r) => byBank(r) && t(r)).length])} />
      </div>
      <div className="resultLine">
        <span><b style={{ color: "var(--ink)" }}>{shown.length.toLocaleString("ro-RO")}</b> din {rows.length.toLocaleString("ro-RO")} comenzi</span>
        {active > 0 && <button type="button" className="resetLink" style={{ height: "auto", padding: 0 }} onClick={() => { setQ(""); setF(""); setBank(""); }}>✕ Resetează filtrele</button>}
      </div>
      {shown.length === 0 ? <div className="empty">Nicio comandă pentru filtrele alese.</div> : (
        <div className="tableWrap">
          <table className="table">
            <thead><tr><th>Comandă</th><th>Bancă · agenție</th><th>Client</th><th>Tip raport</th><th style={{ textAlign: "right" }}>Tarif</th><th>Status</th></tr></thead>
            <tbody>
              {shown.slice(0, limit).map((r) => (
                <ClickRow key={r.id} href={`${base}/comenzi/${r.id}`} className={r.unread ? "unread" : undefined}>
                  <td><a className="ref rowLink" href={`${base}/comenzi/${r.id}`}>{r.bankRef ?? r.ref}</a><div className="muted">{r.created}</div></td>
                  <td>{r.bank ?? "—"}{r.branch && <div className="muted">{r.branch}</div>}</td>
                  <td><b>{niceName(r.client)}</b>{r.clientPhone && <div className="muted" style={{ whiteSpace: "nowrap" }}>{r.clientPhone}</div>}</td>
                  <td>{r.reportType ?? r.type}</td>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>{lei(r.fee)}</td>
                  <td><span className="actions" style={{ gap: 6 }}>{r.unread && <span className="pill pillInfo"><i />Nouă</span>}<span className={`pill ${r.status[1]}`}><i />{r.status[0]}</span></span></td>
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
