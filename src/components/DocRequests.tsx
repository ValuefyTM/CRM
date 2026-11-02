"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";

/** „Solicită acte”: the documents asked of the collaborator who sent the order (they hear by email, upload in the portal). */
export function RequestDocs({ order, suggestions }: { order: string; suggestions: string[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [other, setOther] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const names = [...picked, ...other.split("\n").map((x) => x.trim()).filter(Boolean)];
  const send = async () => {
    if (!names.length) return setMsg("Alege sau scrie actele solicitate.");
    setBusy(true); setMsg("");
    const r = await fetch(`/api/crm/orders/${encodeURIComponent(order)}/doc-requests`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ names, note }) }).catch(() => null);
    const d = (await r?.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!r?.ok) return setMsg(d?.error ?? "Nu s-a putut trimite.");
    setOpen(false); setPicked([]); setOther(""); setNote("");
    router.refresh();
  };
  return (
    <>
      <button type="button" className="btn btnGold btnSm" onClick={() => setOpen(true)}>Solicită acte</button>
      {open && createPortal(
        <div className="vfModal" role="dialog" aria-modal="true" aria-labelledby="rqT" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="vfModalBox">
            <h2 id="rqT">Solicită acte colaboratorului</h2>
            <p className="hint">Fiecare act apare ca lipsă în comandă, colaboratorul primește email cu lista și îl încarcă din portal, în dreptul lui. Cererea apare și în mesaje.</p>
            {suggestions.length > 0 && (
              <span className="chips" role="group" aria-label="Acte">
                {suggestions.map((s) => (
                  <button key={s} type="button" className="chip" role="checkbox" aria-checked={picked.includes(s)} onClick={() => setPicked(picked.includes(s) ? picked.filter((x) => x !== s) : [...picked, s])}>{s}</button>
                ))}
              </span>
            )}
            <label className="field">Alte acte <small>(câte unul pe rând)</small><textarea className="textarea" rows={2} value={other} onChange={(e) => setOther(e.target.value)} placeholder="ex. Autorizație de construire" /></label>
            <label className="field">Mesaj <small>(opțional)</small><textarea className="textarea" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="ex. Extrasul CF trebuie să fie emis în ultimele 30 de zile." /></label>
            {msg && <div role="alert" className="error">{msg}</div>}
            <div className="actions" style={{ justifyContent: "flex-end" }}>
              <button type="button" className="btn btnGhost" onClick={() => setOpen(false)}>Renunță</button>
              <button type="button" className="btn btnGold" disabled={busy || !names.length} onClick={send}>{busy ? "Se trimite…" : `Solicită ${names.length || ""} ${names.length === 1 ? "act" : "acte"}`}</button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

/** A request withdrawn (the document is no longer needed). */
export function CancelDocRequest({ order, request }: { order: string; request: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button type="button" className="linkBtn" disabled={busy} onClick={async () => {
      if (!confirm("Retragi cererea pentru acest act?")) return;
      setBusy(true);
      await fetch(`/api/crm/orders/${encodeURIComponent(order)}/doc-requests?request=${encodeURIComponent(request)}`, { method: "DELETE" }).catch(() => null);
      router.refresh();
    }}>{busy ? "…" : "Retrage"}</button>
  );
}
