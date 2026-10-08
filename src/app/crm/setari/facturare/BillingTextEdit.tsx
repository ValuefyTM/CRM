"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DEFAULT_TEXT, fillText, PLACEHOLDERS, type BillingText } from "@/lib/billing-text";

/**
 * What this bank's / firm's invoices say: service name, line description and mentions, with placeholders
 * ({contract}, {client}, {comanda}…) and a live preview on one of its recent reports.
 */
export function BillingTextEdit({ kind, id, party, custom, product }: { kind: "contract" | "collab"; id: string; party: string; custom: boolean; product: string }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<Required<BillingText>>({ product: "", line: DEFAULT_TEXT.line, mentions: DEFAULT_TEXT.mentions });
  const [sample, setSample] = useState<Record<string, string | null> | null>(null);
  const [focus, setFocus] = useState<"line" | "mentions">("line");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const refs = { line: useRef<HTMLTextAreaElement>(null), mentions: useRef<HTMLTextAreaElement>(null) };

  const load = async () => {
    setOpen(true); setMsg("");
    const r = await fetch(`/api/crm/billing/text?kind=${kind}&id=${encodeURIComponent(id)}`).catch(() => null);
    const d = (await r?.json().catch(() => null)) as { text: BillingText; sample: Record<string, string | null> | null } | null;
    setF({ product: d?.text.product ?? "", line: d?.text.line ?? DEFAULT_TEXT.line, mentions: d?.text.mentions ?? DEFAULT_TEXT.mentions });
    setSample(d?.sample ?? null);
  };
  const insert = (key: string) => {
    const el = refs[focus].current;
    const v = f[focus];
    const at = el?.selectionStart ?? v.length;
    const next = `${v.slice(0, at)}{${key}}${v.slice(el?.selectionEnd ?? at)}`;
    setF({ ...f, [focus]: next });
    requestAnimationFrame(() => { el?.focus(); const p = at + key.length + 2; el?.setSelectionRange(p, p); });
  };
  const save = async () => {
    setBusy(true); setMsg("");
    const r = await fetch("/api/crm/billing/text", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, id, ...f }) }).catch(() => null);
    setBusy(false);
    if (!r?.ok) return setMsg("Nu am putut salva.");
    location.reload();
  };
  const vals = sample ?? Object.fromEntries(PLACEHOLDERS.map(([k, l]) => [k, `‹${l}›`]));

  return (
    <>
      <button type="button" className="btn btnGhost btnSm" onClick={load}>{custom ? "Text factură ✓" : "Text factură"}</button>
      {open && createPortal(
        <div className="vfModal" role="dialog" aria-modal="true" aria-labelledby="btTitle" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="vfModalBox" style={{ width: "min(760px, 100%)" }}>
            <h2 id="btTitle">Textul facturilor · {party}</h2>
            <p className="hint">Ce scrie pe factură pentru fiecare raport al acestui partener. Câmpurile între acolade se completează din raport; dacă un câmp lipsește, dispare cu tot cu separatorul „·”.</p>
            <label className="field">Denumire serviciu <small>(gol = „{product}” din setări)</small><input className="input" value={f.product} placeholder={product} onChange={(e) => setF({ ...f, product: e.target.value })} /></label>
            <label className="field">Descrierea liniei
              <textarea ref={refs.line} className="textarea mono" rows={2} value={f.line} onFocus={() => setFocus("line")} onChange={(e) => setF({ ...f, line: e.target.value })} /></label>
            <label className="field">Mențiuni pe factură
              <textarea ref={refs.mentions} className="textarea mono" rows={2} value={f.mentions} onFocus={() => setFocus("mentions")} onChange={(e) => setF({ ...f, mentions: e.target.value })} /></label>
            <div className="btChips"><span className="muted">Inserează în „{focus === "line" ? "descriere" : "mențiuni"}”:</span>
              {PLACEHOLDERS.map(([k, l]) => <button key={k} type="button" className="btChip" title={l} onClick={() => insert(k)}>{`{${k}}`}</button>)}</div>
            <div className="btPreview">
              <div className="section">Previzualizare {sample ? `pe raportul ${sample.raport ?? ""}` : "(partenerul nu are încă rapoarte)"}</div>
              <b>{f.product || product}</b>
              <div>{fillText(f.line, vals) || <span className="muted">—</span>}</div>
              <small className="muted">Mențiuni: {fillText(f.mentions, vals) || "—"}</small>
            </div>
            {msg && <div className="error" role="alert">{msg}</div>}
            <div className="actions">
              <button type="button" className="btn btnGold" disabled={busy} onClick={save}>{busy ? "Se salvează…" : "Salvează"}</button>
              <button type="button" className="btn btnGhost" onClick={() => setF({ product: "", line: DEFAULT_TEXT.line, mentions: DEFAULT_TEXT.mentions })}>Textul implicit</button>
              <button type="button" className="btn btnGhost" onClick={() => setOpen(false)}>Renunță</button>
            </div>
          </div>
        </div>, document.body)}
    </>
  );
}
