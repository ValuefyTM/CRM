"use client";

import { useState } from "react";
import { PROPERTY_TYPES, PURPOSES } from "@/lib/order-labels";
import { DocsConfirm } from "@/components/DocsConfirm";

type Contract = { id: string; number: string | null; bank: string; bank_code: string | null; fee: number | null; report_type: string | null; purpose: string | null };
type Collab = { id: string; number: string | null; firm: string; share: number | null };
type Person = { id: string; name: string; role: string };

/** Bank (framework contract) or collaboration order: the statement line and the report file, in one form. */
export function ContractOrderForm(p: {
  base: string; me: string; initialKind: "bank" | "collab"; contracts: Contract[]; collabs: Collab[]; evaluators: Person[]; inspectors: Person[];
}) {
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Bucharest" });
  const [kind, setKind] = useState(p.initialKind);
  const [f, setF] = useState({
    contract_id: p.contracts.length === 1 ? p.contracts[0].id : "", collaboration_id: "", bank_ref: "", bank_branch: "", ordered_on: today, report_type: "", purpose: "",
    fee: "", client_name: "", client_phone: "", client_email: "", property_type: "apartment", city: "", address: "", surface_area: "",
    contact_name: "", contact_phone: "", inspection_notes: "", notes: "",
    evaluator_id: p.evaluators.some((e) => e.id === p.me) ? p.me : "", verifier_id: "", inspector_id: "", inspection_due: "", due_on: "", urgent: false, confirm_missing: false,
  });
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const contract = p.contracts.find((c) => c.id === f.contract_id);
  const collab = p.collabs.find((c) => c.id === f.collaboration_id);
  const feeNum = parseFloat(f.fee.replace(",", "."));

  const pickContract = (id: string) => {
    const c = p.contracts.find((x) => x.id === id);
    setF({ ...f, contract_id: id, fee: f.fee || (c?.fee ? String(c.fee) : ""), report_type: f.report_type || c?.report_type || "", purpose: f.purpose || c?.purpose || "" });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (f.inspector_id && !f.confirm_missing) return setMsg("Extrasul CF și releveul nu sunt încărcate: bifează că aloci inspecția fără ele sau alege „O aloc mai târziu”.");
    setBusy(true); setMsg("");
    const r = await fetch("/api/crm/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...f, kind }) }).catch(() => null);
    const d = (await r?.json().catch(() => ({}))) as { report?: string; error?: string; inspectionError?: string | null } | undefined;
    setBusy(false);
    if (!r?.ok || !d?.report) { setMsg(d?.error || "Nu am putut salva. Încearcă din nou."); return; }
    if (d.inspectionError) alert(`Lucrarea s-a înregistrat, dar inspecția nu a fost alocată: ${d.inspectionError}`);
    location.href = `${p.base}/rapoarte/${d.report}`;
  };

  return (
    <form onSubmit={submit} noValidate style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 920 }}>
      <section className="card">
        <h2>De unde vine lucrarea</h2>
        <div className="segment" role="group" aria-label="Tip lucrare" style={{ maxWidth: 460 }}>
          <button type="button" aria-pressed={kind === "bank"} onClick={() => setKind("bank")}>Bancă · contract cadru</button>
          <button type="button" aria-pressed={kind === "collab"} onClick={() => setKind("collab")}>Colaborare · firmă de evaluare</button>
        </div>
        {kind === "bank" ? (
          <>
            <div className="formRow">
              <label className="field">Contract cadru
                <select className="select" value={f.contract_id} onChange={(e) => pickContract(e.target.value)}>
                  <option value="">Alege banca și contractul…</option>
                  {p.contracts.map((c) => <option key={c.id} value={c.id}>{c.bank}{c.number ? ` · contract ${c.number}` : ""}{c.fee ? ` · ${c.fee} lei` : ""}</option>)}
                </select>
              </label>
              <label className="field">Nr. comandă în aplicația băncii<input className="input mono" value={f.bank_ref} onChange={set("bank_ref")} placeholder="ex. 2026-104587" /></label>
            </div>
            {p.contracts.length === 0 && <div className="note">Nu există contracte cadru în CRM. Se importă din Glide sau se adaugă la clientul băncii.</div>}
            <div className="formRow">
              <label className="field">Agenție / sucursală <small>(opțional)</small><input className="input" value={f.bank_branch} onChange={set("bank_branch")} /></label>
              <label className="field">Data comenzii<input className="input" type="date" value={f.ordered_on} onChange={set("ordered_on")} /></label>
            </div>
          </>
        ) : (
          <div className="formRow">
            <label className="field">Firma colaboratoare
              <select className="select" value={f.collaboration_id} onChange={set("collaboration_id")}>
                <option value="">Alege colaborarea…</option>
                {p.collabs.map((c) => <option key={c.id} value={c.id}>{c.firm}{c.number ? ` · ${c.number}` : ""}{c.share != null ? ` · cota VALUEFY ${Math.round(c.share * 100)}%` : ""}</option>)}
              </select>
            </label>
            <label className="field">Data comenzii<input className="input" type="date" value={f.ordered_on} onChange={set("ordered_on")} /></label>
          </div>
        )}
        <div className="formRow">
          <label className="field">Tip raport <small>(opțional)</small><input className="input" value={f.report_type} onChange={set("report_type")} placeholder="ex. Garanție ipotecară" /></label>
          <label className="field">Scop
            <select className="select" value={f.purpose} onChange={set("purpose")}>
              <option value="">{kind === "bank" ? "Credit bancar" : "—"}</option>
              {PURPOSES.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          </label>
          <label className="field">Onorariu fără TVA (lei)<input className="input" inputMode="decimal" value={f.fee} onChange={set("fee")} placeholder={contract?.fee ? String(contract.fee) : ""} /></label>
        </div>
        {kind === "collab" && collab?.share != null && Number.isFinite(feeNum) && <p className="hint">Cota VALUEFY: {Math.round(collab.share * 100)}% · {(feeNum * collab.share).toLocaleString("ro-RO", { maximumFractionDigits: 2 })} lei</p>}
      </section>

      <section className="card">
        <h2>Client și proprietate</h2>
        <div className="formRow">
          <label className="field">Client (nume)<input className="input" value={f.client_name} onChange={set("client_name")} /></label>
          <label className="field">Telefon <small>(opțional)</small><input className="input" type="tel" value={f.client_phone} onChange={set("client_phone")} /></label>
          <label className="field">Email <small>(opțional)</small><input className="input" type="email" value={f.client_email} onChange={set("client_email")} /></label>
        </div>
        <div className="formRow">
          <label className="field">Tip proprietate
            <select className="select" value={f.property_type} onChange={set("property_type")}>{PROPERTY_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          </label>
          <label className="field">Localitate<input className="input" value={f.city} onChange={set("city")} /></label>
          <label className="field">Suprafață utilă mp <small>(opțional)</small><input className="input" inputMode="decimal" value={f.surface_area} onChange={set("surface_area")} /></label>
        </div>
        <label className="field">Adresa<input className="input" value={f.address} onChange={set("address")} placeholder="Strada, număr, bloc, apartament" /></label>
        <div className="formRow">
          <label className="field">Contact la inspecție <small>(dacă nu e clientul)</small><input className="input" value={f.contact_name} onChange={set("contact_name")} /></label>
          <label className="field">Telefon contact<input className="input" type="tel" value={f.contact_phone} onChange={set("contact_phone")} /></label>
        </div>
        <label className="field">Observații pentru inspecție <small>(opțional)</small><textarea className="textarea" rows={2} value={f.inspection_notes} onChange={set("inspection_notes")} /></label>
      </section>

      <section className="card">
        <h2>Dosar și echipă</h2>
        <div className="formRow">
          <label className="field">Evaluator principal
            <select className="select" value={f.evaluator_id} onChange={set("evaluator_id")}>
              <option value="">Alege…</option>
              {p.evaluators.map((x) => <option key={x.id} value={x.id}>{x.id === p.me ? `${x.name} (eu)` : x.name}</option>)}
            </select>
          </label>
          <label className="field">Verificator <small>(opțional)</small>
            <select className="select" value={f.verifier_id} onChange={set("verifier_id")}>
              <option value="">Mai târziu</option>
              {p.evaluators.filter((x) => x.id !== f.evaluator_id).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </label>
          <label className="field">Termen predare raport <small>(opțional)</small><input className="input" type="date" value={f.due_on} onChange={set("due_on")} /></label>
        </div>
        <div className="formRow">
          <label className="field">Inspecția o face <small>(opțional)</small>
            <select className="select" value={f.inspector_id} onChange={set("inspector_id")}>
              <option value="">O aloc mai târziu</option>
              {p.inspectors.map((x) => <option key={x.id} value={x.id}>{x.id === p.me ? `${x.name} (eu)` : x.name} · {x.role}</option>)}
            </select>
          </label>
          <label className="field">Inspecție până la <small>(opțional)</small><input className="input" type="date" value={f.inspection_due} onChange={set("inspection_due")} disabled={!f.inspector_id} /></label>
        </div>
        {f.inspector_id && <DocsConfirm have={{ cf: false, rlv: false }} checked={f.confirm_missing} onChange={(v) => setF({ ...f, confirm_missing: v })}
          hint="Dosarul e nou: le încarci după ce se deschide, la „Documente & Livrare”, sau aloci inspecția de acolo după ce le ai." />}
        <label className="check"><input type="checkbox" checked={f.urgent} onChange={(e) => setF({ ...f, urgent: e.target.checked })} /><span>Urgent</span></label>
        <label className="field">Note interne <small>(opțional)</small><textarea className="textarea" rows={2} value={f.notes} onChange={set("notes")} /></label>
      </section>

      {msg && <div role="alert" className="error">{msg}</div>}
      <div className="actions">
        <button type="submit" className="btn btnGold" disabled={busy}>{busy ? "Se înregistrează…" : "Înregistrează și deschide dosarul"}</button>
        <a className="btn btnGhost" href={`${p.base}/comenzi?tab=banci`}>Renunță</a>
      </div>
    </form>
  );
}
