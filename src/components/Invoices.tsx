"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import type { Draft, InvoiceRow } from "@/lib/billing";

const lei = (n: number | null | undefined) => (n == null ? "—" : `${n.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} lei`);
const day = (d: string | null) => (d ? d.slice(0, 10).split("-").reverse().join(".") : "—");
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Bucharest" });

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return createPortal(
    <div className="vfModal" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}>
      <div className="vfModalBox" style={{ width: "min(860px, 100%)" }}><h2>{title}</h2>{children}</div>
    </div>, document.body);
}

/** "Emite factura / proforma": shows exactly what goes to Oblio (client, lines, totals) before issuing. */
export function IssueInvoice({ contract, report, kind = "invoice", label, primary = true }: { contract?: string; report?: string; kind?: "invoice" | "proforma"; label: string; primary?: boolean }) {
  const [open, setOpen] = useState(false);
  const [d, setD] = useState<Draft | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const what = kind === "proforma" ? "proforma" : "factura";
  const load = async () => {
    setOpen(true); setD(null); setMsg("");
    const q = report ? `report=${encodeURIComponent(report)}` : `contract=${encodeURIComponent(contract ?? "")}&kind=${kind}`;
    const r = await fetch(`/api/crm/billing/draft?${q}`).catch(() => null);
    const j = (await r?.json().catch(() => ({}))) as Draft & { error?: string };
    if (!r?.ok) setMsg(j?.error || "Nu am putut pregăti documentul."); else setD(j);
  };
  const go = async () => {
    if (!d) return;
    setBusy(true); setMsg("");
    const r = await fetch("/api/crm/billing/issue", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contract, report, kind, total: d.totals.total }) }).catch(() => null);
    const j = (await r?.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!r?.ok) return setMsg(j?.error || "Nu am putut emite documentul.");
    location.reload();
  };
  return (
    <>
      <button type="button" className={primary ? "btn btnGold btnSm" : "btn btnGhost btnSm"} onClick={load}>{label}</button>
      {open && (
        <Modal title={`Emite ${what} în Oblio`} onClose={() => setOpen(false)}>
          {!d && !msg && <p className="hint">Se pregătește…</p>}
          {d && (
            <>
              {/* Laid out like the invoice Oblio will issue; the number comes from the series at issue time. */}
              <div className="invDoc">
                <div className="invDocHead">
                  <div>
                    <span className="invDocKind">{d.kind === "proforma" ? "FACTURĂ PROFORMĂ" : "FACTURĂ"}</span>
                    <span className="mono">Seria {d.series || "—"} nr. <i>se alocă la emitere</i></span>
                  </div>
                  <div className="invDocDates">
                    <span>Data emiterii: <b>{day(d.issueDate)}</b></span>
                    {d.dueDate && <span>Scadență: <b>{day(d.dueDate)}</b></span>}
                  </div>
                </div>
                <div className="invDocParties">
                  <div><small>Furnizor</small><b>{d.supplier.name}</b><span>CIF {d.supplier.cui} · {d.supplier.reg}</span><span>{d.supplier.address}</span><span className="mono">{d.supplier.iban}</span></div>
                  <div><small>Client</small><b>{d.party.name}</b>{d.party.cif && <span>CIF {d.party.cif}{d.party.rc ? ` · ${d.party.rc}` : ""}</span>}
                    <span>{[d.party.address, d.party.city, d.party.county].filter(Boolean).join(", ") || <em className="invMissing">adresă lipsă</em>}</span></div>
                </div>
                <table className="invDocTable">
                  <thead><tr><th>Nr.</th><th>Denumire produs / serviciu</th><th>UM</th><th>Cant.</th><th>Preț unitar</th><th>Valoare</th><th>TVA {d.vatPercent}%</th></tr></thead>
                  <tbody>
                    {d.lines.map((l, i) => (
                      <tr key={i}><td>{i + 1}</td><td><b>{l.name}</b><div>{l.description}</div></td><td>{d.unit}</td><td>{l.quantity}</td>
                        <td>{lei(l.price)}</td><td>{lei(l.price * l.quantity)}</td><td>{lei(Math.round(l.price * l.quantity * d.vatPercent) / 100)}</td></tr>
                    ))}
                  </tbody>
                </table>
                <div className="invDocTotals">
                  <span>Total fără TVA <b>{lei(d.totals.net)}</b></span>
                  <span>TVA <b>{lei(d.totals.vat)}</b></span>
                  <span className="grand">Total de plată <b>{lei(d.totals.total)}</b></span>
                </div>
                {d.mentions && <div className="invDocNote"><small>Mențiuni</small>{d.mentions}</div>}
              </div>
              {d.problems.length > 0 && <div className="error" role="alert">De rezolvat întâi: {d.problems.join("; ")}.</div>}
            </>
          )}
          {msg && <div className="error" role="alert">{msg}</div>}
          <div className="actions">
            {d && <button type="button" className="btn btnGold" disabled={busy || d.problems.length > 0} onClick={go}>{busy ? "Se emite…" : `Emite ${what}`}</button>}
            <button type="button" className="btn btnGhost" onClick={() => setOpen(false)}>Renunță</button>
          </div>
          {d && <p className="hint">Documentul se emite imediat în Oblio, cu număr din serie; PDF-ul se păstrează și în CRM.</p>}
        </Modal>
      )}
    </>
  );
}

/** Invoices and proformas of a contract / report, with the PDF and (for administrators) payment and cancellation. */
export function InvoiceList({ rows, admin, empty }: { rows: InvoiceRow[]; admin: boolean; empty?: string }) {
  const [paying, setPaying] = useState<InvoiceRow | null>(null);
  const [f, setF] = useState({ type: "Ordin de plata", document: "", date: today() });
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const act = async (id: string, body: Record<string, unknown>) => {
    setBusy(true); setMsg("");
    const r = await fetch(`/api/crm/invoices/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const j = (await r?.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!r?.ok) { setMsg(j?.error || "Nu am putut actualiza documentul."); return false; }
    location.reload(); return true;
  };
  if (!rows.length) return <p className="hint" style={{ margin: 0 }}>{empty ?? "Niciun document emis."}</p>;
  return (
    <>
      <ul className="invList">
        {rows.map((i) => (
          <li key={i.id} className={i.status === "cancelled" ? "off" : undefined}>
            <span className={`invKind ${i.kind}`}>{i.kind === "proforma" ? "Proformă" : "Factură"}</span>
            <span className="who">
              <b className="mono">{i.series} {i.number}</b>
              <small className="muted">{day(i.issue_date)}{i.kind === "invoice" && i.due_date ? ` · scadentă ${day(i.due_date)}` : ""} · {lei(i.total)}</small>
            </span>
            <span className={`pill ${i.status === "paid" ? "pillOk" : i.status === "cancelled" ? "" : i.kind === "invoice" && i.due_date && i.due_date < today() ? "pillErr" : "pillWarn"}`}><i />
              {i.status === "paid" ? `Încasată ${day(i.paid_at)}` : i.status === "cancelled" ? "Anulată" : i.kind === "proforma" ? "Emisă" : i.due_date && i.due_date < today() ? "Scadentă" : "De încasat"}</span>
            <a className="btn btnGhost btnSm" href={`/api/crm/invoices/${i.id}/pdf`} target="_blank" rel="noopener">PDF</a>
            {admin && i.status === "issued" && i.kind === "invoice" && <button type="button" className="btn btnGhost btnSm" onClick={() => { setMsg(""); setPaying(i); }}>Încasată</button>}
            {admin && i.status === "issued" && <button type="button" className="linkBtn danger" disabled={busy} onClick={() => { if (confirm(`Anulezi ${i.kind === "proforma" ? "proforma" : "factura"} ${i.series} ${i.number} în Oblio?`)) act(i.id, { action: "cancel" }); }}>Anulează</button>}
          </li>
        ))}
      </ul>
      {msg && !paying && <div className="error" role="alert">{msg}</div>}
      {paying && (
        <Modal title={`Încasare ${paying.series} ${paying.number} · ${lei(paying.total)}`} onClose={() => setPaying(null)}>
          <div className="formRow">
            <label className="field">Tip<select className="select" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
              {["Ordin de plata", "Chitanta", "Card", "Numerar"].map((x) => <option key={x}>{x}</option>)}
            </select></label>
            <label className="field">Nr. document <small>(opțional)</small><input className="input" value={f.document} onChange={(e) => setF({ ...f, document: e.target.value })} /></label>
            <label className="field">Data<input className="input" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></label>
          </div>
          {msg && <div className="error" role="alert">{msg}</div>}
          <div className="actions">
            <button type="button" className="btn btnGold" disabled={busy} onClick={() => act(paying.id, { action: "paid", ...f })}>{busy ? "Se înregistrează…" : "Înregistrează încasarea"}</button>
            <button type="button" className="btn btnGhost" onClick={() => setPaying(null)}>Renunță</button>
          </div>
          <p className="hint">Încasarea se înregistrează și în Oblio, pe factură.</p>
        </Modal>
      )}
    </>
  );
}
