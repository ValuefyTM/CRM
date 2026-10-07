"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { DocsConfirm, missingOf, type DocState } from "@/components/DocsConfirm";

export type Pick_ = { id: string; name: string; role: string };

/**
 * "Deschide dosarul": the order becomes a report file — main evaluator, verifier, deadline and, if wanted,
 * the inspection given at once. For portal / website orders it opens by itself when the client signs the offer.
 */
export function DossierOpen(p: {
  order: string; base: string; evaluators: Pick_[]; inspectors: Pick_[]; me: string; evaluator: string | null;
  label: string; hint: string; warn?: string | null; dueDefault?: string | null; primary?: boolean; docs: DocState;
}) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({
    evaluator_id: p.evaluator ?? (p.evaluators.some((e) => e.id === p.me) ? p.me : ""), verifier_id: "", inspector_id: "", inspection_due: "",
    due_on: p.dueDefault ?? "", notes: "", confirm_missing: false,
  });
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.evaluator_id) return setMsg("Alege evaluatorul principal.");
    if (f.inspector_id && missingOf(p.docs).length && !f.confirm_missing) return setMsg(`Lipsesc ${missingOf(p.docs).join(" și ")}: bifează că aloci inspecția fără ele sau alege „O aloc mai târziu”.`);
    setBusy(true); setMsg("");
    const r = await fetch(`/api/crm/orders/${p.order}/dossier`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) }).catch(() => null);
    const d = (await r?.json().catch(() => ({}))) as { id?: string; error?: string; inspectionError?: string | null } | undefined;
    setBusy(false);
    if (!r?.ok || !d?.id) return setMsg(d?.error || "Nu am putut deschide dosarul. Încearcă din nou.");
    if (d.inspectionError) alert(`Dosarul s-a deschis, dar inspecția nu a fost alocată: ${d.inspectionError}`);
    location.href = `${p.base}/rapoarte/${d.id}`;
  };

  return (
    <>
      <button type="button" className={p.primary === false ? "btn btnGhost btnSm" : "btn btnGold"} onClick={() => setOpen(true)}>{p.label}</button>
      {open && createPortal(
        <div className="vfModal" role="dialog" aria-modal="true" aria-labelledby="dosTitle" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <form className="vfModalBox" onSubmit={submit}>
            <h2 id="dosTitle">Deschide dosarul</h2>
            <p className="hint">{p.hint}</p>
            {p.warn && <div className="note">{p.warn}</div>}
            <div className="formRow">
              <label className="field">Evaluator principal
                <select className="select" value={f.evaluator_id} onChange={set("evaluator_id")} required>
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
            </div>
            <div className="formRow">
              <label className="field">Inspecția o face <small>(opțional)</small>
                <select className="select" value={f.inspector_id} onChange={set("inspector_id")}>
                  <option value="">O aloc mai târziu</option>
                  {p.inspectors.map((x) => <option key={x.id} value={x.id}>{x.id === p.me ? `${x.name} (eu)` : x.name} · {x.role}</option>)}
                </select>
              </label>
              <label className="field">Inspecție până la <small>(opțional)</small>
                <input className="input" type="date" value={f.inspection_due} onChange={set("inspection_due")} disabled={!f.inspector_id} />
              </label>
            </div>
            {f.inspector_id && <DocsConfirm have={p.docs} checked={f.confirm_missing} onChange={(v) => setF({ ...f, confirm_missing: v })}
              hint="Le poți încărca pe comandă (sau în dosar, după deschidere); apar singure în aplicația de inspecții." />}
            <label className="field">Termen de predare a raportului <small>{p.dueDefault === undefined ? "(opțional; altfel din ofertă, de la inspecție)" : ""}</small>
              <input className="input" type="date" value={f.due_on} onChange={set("due_on")} />
            </label>
            <label className="field">Note interne <small>(opțional)</small>
              <textarea className="textarea" rows={2} value={f.notes} onChange={set("notes")} />
            </label>
            {msg && <div role="alert" className="error">{msg}</div>}
            <div className="actions">
              <button type="submit" className="btn btnNavy" disabled={busy}>{busy ? "Se deschide…" : "Deschide dosarul"}</button>
              <button type="button" className="btn btnGhost" onClick={() => setOpen(false)}>Renunță</button>
            </div>
          </form>
        </div>,
        document.body,
      )}
    </>
  );
}
