"use client";

import { PersonPicker, type PickPerson } from "@/components/PersonPicker";
import { useState } from "react";
import type { OfferDoc, OfferInput } from "@/lib/offers";

type Status = {
  number: string; status: "draft" | "sent" | "accepted" | "declined"; link: string; created_at: string; sent_at: string | null; sent_to: string | null;
  viewed_at: string | null; accepted_at: string | null; accepted_name: string | null; accepted_urgent: number | null; total: string; accepted_total: string | null;
  declined_at: string | null; decline_reason: string | null; expired: boolean;
};

const when = (d: string | null) => (d ? new Date(d).toLocaleString("ro-RO", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Bucharest" }) : "");
const lei = (n: number) => `${n.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} lei`;
const num = (s: string) => { const n = parseFloat(s.replace(/\s/g, "").replace(",", ".")); return Number.isFinite(n) ? n : 0; };

/** Offer card on a CRM order: status of the offer sent, and the form to prepare / edit / send it. */
export function OfferEditor({ orderId, base, initial, status, evaluators }: {
  orderId: string; base: string; initial: OfferInput; status: Status | null; evaluators: PickPerson[];
}) {
  const s = (v: number | null | undefined) => (v == null ? "" : String(v).replace(".", ","));
  const [f, setF] = useState({
    ...initial, fee: s(initial.fee || null), urgent_fee: s(initial.urgent_fee), vat_rate: s(initial.vat_rate),
    term_days: s(initial.term_days), urgent_days: s(initial.urgent_days), payment_terms: initial.payment_terms ?? "",
    message: initial.message ?? "", evaluator_id: initial.evaluator_id ?? "",
  });
  const [docs, setDocs] = useState<OfferDoc[]>(initial.documents);
  const [newDoc, setNewDoc] = useState("");
  const [open, setOpen] = useState(status?.status === "draft");
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF((p) => ({ ...p, [k]: e.target.value }));
  const locked = status?.status === "accepted";
  const net = num(f.fee);
  const urgent = num(f.urgent_fee) > 0;
  const preview = `${base}/comenzi/${orderId}/oferta`;
  const vat = Math.round(net * num(f.vat_rate || "21")) / 100;

  /** Saves the form; "preview" then opens the offer as the client will see it, where it is sent from. */
  const submit = async (then: "stay" | "preview") => {
    setBusy(then); setMsg(null);
    const r = await fetch(`/api/crm/orders/${orderId}/offer`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...f, urgent_days: urgent ? f.urgent_days : "", documents: docs, action: "save" }),
    }).catch(() => null);
    const d = (await r?.json().catch(() => ({}))) as { error?: string } | undefined;
    if (!r?.ok) { setBusy(""); return setMsg({ ok: false, text: d?.error || "Nu am putut salva oferta." }); }
    if (then === "preview") location.href = preview;
    else location.reload();
  };

  const copy = async () => {
    if (!status) return;
    try { await navigator.clipboard.writeText(status.link); setMsg({ ok: true, text: "Linkul ofertei a fost copiat." }); } catch { prompt("Copiază linkul ofertei:", status.link); }
  };

  const steps: [string, string, boolean][] = status ? [
    ["Creată", when(status.created_at), true],
    ["Trimisă", status.sent_at ? `${when(status.sent_at)} · ${status.sent_to}` : "", !!status.sent_at],
    ["Deschisă de client", when(status.viewed_at), !!status.viewed_at],
    status.status === "declined" ? ["Refuzată", `${when(status.declined_at)}${status.decline_reason ? ` · „${status.decline_reason}”` : ""}`, true]
      : ["Acceptată și semnată", status.accepted_at ? `${when(status.accepted_at)} · ${status.accepted_name}` : "", !!status.accepted_at],
  ] : [];

  return (
    <section className="card offerCard">
      <div className="cardHead">
        <h2>Ofertă{status ? ` ${status.number}` : ""}</h2>
        {status && (
          <span className={`pill ${status.status === "accepted" ? "pillOk" : status.status === "declined" || status.expired ? "pillErr" : status.status === "sent" ? "pillInfo" : ""}`}><i />
            {status.status === "accepted" ? "Acceptată" : status.status === "declined" ? "Refuzată" : status.expired ? "Expirată" : status.status === "sent" ? (status.viewed_at ? "Deschisă de client" : "Trimisă") : "Ciornă"}
          </span>
        )}
      </div>

      {status && status.status !== "draft" && (
        <>
          <ol className="timeline">
            {steps.map(([l, d, done], i) => (
              <li key={i} className={done ? (l === "Refuzată" ? "warn" : "past") : ""}><span className="dot">{done ? (l === "Refuzată" ? "!" : "✓") : ""}</span><span>{l}{d && <span className="muted"> · {d}</span>}</span></li>
            ))}
          </ol>
          <p className="hint">Total: <b>{status.accepted_total ?? status.total}</b> cu TVA{status.accepted_urgent ? " · regim urgent ales de client" : ""}.</p>
          <div className="actions">
            <a className="btn btnGhost btnSm" href={preview}>{locked ? "Vezi oferta semnată" : "Previzualizează"}</a>
            <button type="button" className="btn btnGhost btnSm" onClick={copy}>Copiază linkul clientului</button>
            {status.status === "sent" && <a className="btn btnGhost btnSm" href={preview}>Retrimite pe email</a>}
            {!locked && !open && <button type="button" className="btn btnNavy btnSm" onClick={() => setOpen(true)}>{status.status === "declined" ? "Pregătește o ofertă nouă" : "Modifică oferta"}</button>}
          </div>
        </>
      )}
      {!status && !open && <button type="button" className="btn btnGold" onClick={() => setOpen(true)}>Pregătește oferta</button>}

      {open && !locked && (
        <form className="offerForm" noValidate onSubmit={(e) => { e.preventDefault(); submit("stay"); }}>
          {status?.status === "sent" && <div className="note">Oferta a fost deja trimisă. Modificările apar la același link; după salvare o vezi în previzualizare, de unde o poți retrimite clientului.</div>}
          <div className="section">Onorariu și termen</div>
          <div className="grid4">
            <label className="field">Onorariu raport (lei, fără TVA) *<input className="input" inputMode="decimal" value={f.fee} onChange={set("fee")} placeholder="ex. 1200" /></label>
            <label className="field">TVA (%)<input className="input" inputMode="decimal" value={f.vat_rate} onChange={set("vat_rate")} /></label>
            <label className="field">Termen (zile lucrătoare) *<input className="input" inputMode="numeric" value={f.term_days} onChange={set("term_days")} /></label>
            <label className="field">Valabilă până la *<input className="input" type="date" value={f.valid_until} onChange={set("valid_until")} /></label>
          </div>
          <div className="grid4">
            <label className="field"><span>Tarif regim urgent (lei, fără TVA) <small>(opțional)</small></span><input className="input" inputMode="decimal" value={f.urgent_fee} onChange={set("urgent_fee")} placeholder="gol = fără regim urgent" /></label>
            {urgent && <label className="field">Termen urgent (zile lucrătoare) *<input className="input" inputMode="numeric" value={f.urgent_days} onChange={set("urgent_days")} placeholder="ex. 2" /></label>}
          </div>
          <p className="hint">{urgent ? "Clientul poate alege regimul urgent la acceptarea ofertei." : "Regimul urgent apare în ofertă doar dacă îi completezi tariful."} Deplasarea este inclusă în onorariu.</p>
          <dl className="summary">
            <div><dt>Subtotal</dt><dd>{lei(net)}</dd></div>
            <div><dt>TVA</dt><dd>{lei(vat)}</dd></div>
            <div><dt>Total cu TVA</dt><dd>{lei(net + vat)}</dd></div>
            {urgent && <div><dt>Cu regim urgent</dt><dd>{lei((net + num(f.urgent_fee)) * (1 + num(f.vat_rate || "21") / 100))}</dd></div>}
          </dl>
          <label className="field">Condiții de plată<textarea className="textarea" rows={2} value={f.payment_terms} onChange={set("payment_terms")} /></label>

          <div className="section">Client și evaluator</div>
          <div className="grid2">
            <label className="field">Nume client<input className="input" value={f.client_name} onChange={set("client_name")} /></label>
            <label className="field">Email pentru ofertă<input className="input" type="email" value={f.client_email} onChange={set("client_email")} /></label>
            <div className="field">Evaluator desemnat
              <PersonPicker label="Evaluator desemnat" value={f.evaluator_id} onChange={(v) => setF({ ...f, evaluator_id: v })} people={evaluators}
                extras={[{ value: "", label: "Se comunică ulterior" }]} placeholder="Se comunică ulterior" />
            </div>
            <label className="field span2"><span>Mesaj personal <small>(opțional, apare sus în ofertă)</small></span><textarea className="textarea" rows={2} value={f.message} onChange={set("message")} /></label>
          </div>

          <div className="section">Oferta tehnică</div>
          <div className="grid2">
            <label className="field span2">Obiectul evaluării<textarea className="textarea" rows={2} value={f.object_text} onChange={set("object_text")} /></label>
            <label className="field">Tipul valorii<textarea className="textarea" rows={2} value={f.value_type} onChange={set("value_type")} /></label>
            <label className="field">Abordări de evaluare<textarea className="textarea" rows={2} value={f.approaches} onChange={set("approaches")} /></label>
            <label className="field span2">Standarde<textarea className="textarea" rows={2} value={f.standards} onChange={set("standards")} /></label>
          </div>

          <div className="section">Documente necesare</div>
          <ul className="docList">
            {docs.map((d, i) => (
              <li key={i}>
                <label className="check" style={{ flex: 1 }}>
                  <input type="checkbox" checked={d.received} onChange={(e) => setDocs((l) => l.map((x, j) => (j === i ? { ...x, received: e.target.checked } : x)))} />
                  <span>{d.label}{d.optional ? <span className="muted"> · opțional</span> : null}</span>
                </label>
                <span className="muted">{d.received ? "Primit" : "De trimis"}</span>
                <button type="button" className="linkBtn danger" onClick={() => setDocs((l) => l.filter((_, j) => j !== i))}>Scoate</button>
              </li>
            ))}
          </ul>
          <div className="inlineForm">
            <input className="input" value={newDoc} onChange={(e) => setNewDoc(e.target.value)} placeholder="Alt document necesar…" aria-label="Document nou" />
            <button type="button" className="btn btnGhost btnSm" onClick={() => { if (newDoc.trim()) { setDocs((l) => [...l, { label: newDoc.trim(), received: false }]); setNewDoc(""); } }}>Adaugă</button>
          </div>

          <div className="section">Termenii de referință ai evaluării</div>
          <p className="hint">Clientul îi acceptă odată cu oferta. Fiecare rând care începe cu „## ” deschide o secțiune nouă. Textul e completat din comandă; ajustează-l unde e cazul.</p>
          <textarea className="textarea mono" rows={16} value={f.terms} onChange={set("terms")} aria-label="Termenii de referință" />

          {msg && <div role={msg.ok ? "status" : "alert"} className={msg.ok ? "okMsg" : "error"}>{msg.text}</div>}
          <div className="actions">
            <button type="submit" className="btn btnGhost" disabled={!!busy}>{busy === "stay" ? "Se salvează…" : "Salvează ciorna"}</button>
            <button type="button" className="btn btnGold" disabled={!!busy} onClick={() => submit("preview")}>{busy === "preview" ? "Se salvează…" : "Previzualizează și trimite →"}</button>
            {status && status.status !== "draft" && <button type="button" className="btn btnGhost" onClick={() => setOpen(false)}>Închide</button>}
          </div>
        </form>
      )}
      {!open && msg && <div role={msg.ok ? "status" : "alert"} className={msg.ok ? "okMsg" : "error"}>{msg.text}</div>}
    </section>
  );
}
