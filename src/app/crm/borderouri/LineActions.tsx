"use client";
// Adjusting a statement's lines (owner): take a line out, change its amount, put it back, add a line by hand,
// delete a manual one. Every adjustment carries a reason, kept on the line for the person to see.
import { useState } from "react";
import { createPortal } from "react-dom";
import { ReasonModal } from "./StatementActions";

const send = async (url: string, method: string, body?: object) => {
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined }).catch(() => null);
  const d = (await r?.json().catch(() => ({}))) as { error?: string };
  return r?.ok ? null : d.error ?? "Nu s-a salvat.";
};

export function LineActions({ statement, line, lineKey, manual, removed, amount }: { statement: string; line: string | null; lineKey: string | null; manual: boolean; removed: boolean; amount: number }) {
  const [mode, setMode] = useState<"" | "remove" | "change">("");
  const [val, setVal] = useState(String(amount));
  const [msg, setMsg] = useState("");
  const url = `/api/crm/statements/${statement}/lines`;
  const ref = line ? { line } : { key: lineKey };
  const done = (e: string | null) => { if (e) return e; location.reload(); return null; };
  return (
    <span className="stLineActs">
      {removed ? (
        <button type="button" className="linkBtn" onClick={async () => setMsg((await send(url, "PATCH", { ...ref, restore: true })) ?? (location.reload(), ""))}>pune la loc</button>
      ) : manual ? (
        <button type="button" className="linkBtn danger" onClick={async () => { if (confirm("Ștergi linia?")) setMsg((await send(`${url}?line=${line}`, "DELETE")) ?? (location.reload(), "")); }}>șterge</button>
      ) : (
        <>
          <button type="button" className="linkBtn" onClick={() => { setVal(String(amount)); setMode("change"); }}>modifică</button>
          <button type="button" className="linkBtn danger" onClick={() => setMode("remove")}>scoate</button>
          {line && lineKey && <button type="button" className="linkBtn" title="Înapoi la suma calculată" onClick={async () => setMsg((await send(url, "PATCH", { ...ref, restore: true })) ?? (location.reload(), ""))}>recalculează</button>}
        </>
      )}
      {msg && <small className="errTxt">{msg}</small>}
      {mode === "remove" && <ReasonModal title="Scoate linia din borderou" label="Scoate" danger onClose={() => setMode("")} hint="Linia rămâne vizibilă, tăiată, cu motivul; persoana o vede."
        onSave={(why) => send(url, "PATCH", { ...ref, removed: true, reason: why }).then(done)} />}
      {mode === "change" && createPortal(
        <div className="vfModal" role="dialog" aria-modal="true" aria-labelledby="chT" onClick={(e) => { if (e.target === e.currentTarget) setMode(""); }}>
          <div className="vfModalBox">
            <div className="cardHead"><h2 id="chT">Modifică suma</h2><button type="button" className="btn btnGhost btnSm" onClick={() => setMode("")} aria-label="Închide">×</button></div>
            <ChangeForm onCancel={() => setMode("")} value={val} setValue={setVal} onSave={(why) => send(url, "PATCH", { ...ref, amount: val, reason: why }).then(done)} />
          </div>
        </div>, document.body)}
    </span>
  );
}

function ChangeForm({ value, setValue, onSave, onCancel }: { value: string; setValue: (v: string) => void; onSave: (why: string) => Promise<string | null>; onCancel: () => void }) {
  const [why, setWhy] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  return (
    <>
      <label className="field">Suma (lei)<input className="input" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} autoFocus /></label>
      <label className="field">Motivul<textarea className="textarea" rows={2} value={why} onChange={(e) => setWhy(e.target.value)} placeholder="de ex. tarif negociat altfel, corecție" /></label>
      {msg && <div role="alert" className="error">{msg}</div>}
      <div className="actions">
        <button type="button" className="btn btnNavy" disabled={busy || !why.trim()} onClick={async () => { setBusy(true); setMsg(""); const e = await onSave(why.trim()); setBusy(false); if (e) setMsg(e); }}>{busy ? "…" : "Salvează"}</button>
        <button type="button" className="btn btnGhost" onClick={onCancel}>Renunță</button>
      </div>
    </>
  );
}

export function AddLine({ statement }: { statement: string }) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [why, setWhy] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  return (
    <>
      <button type="button" className="btn btnGhost btnSm" onClick={() => setOpen(true)}>+ Adaugă o linie</button>
      {open && createPortal(
        <div className="vfModal" role="dialog" aria-modal="true" aria-labelledby="alT" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="vfModalBox">
            <div className="cardHead"><h2 id="alT">Linie adăugată manual</h2><button type="button" className="btn btnGhost btnSm" onClick={() => setOpen(false)} aria-label="Închide">×</button></div>
            <label className="field">Ce reprezintă<input className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="de ex. bonus, deplasare, corecție luna trecută" autoFocus /></label>
            <label className="field">Suma (lei) <small>(negativă pentru reținere)</small><input className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
            <label className="field">Motivul / explicația<textarea className="textarea" rows={2} value={why} onChange={(e) => setWhy(e.target.value)} /></label>
            {msg && <div role="alert" className="error">{msg}</div>}
            <div className="actions">
              <button type="button" className="btn btnNavy" disabled={busy || !label.trim() || !amount.trim()} onClick={async () => {
                setBusy(true); setMsg("");
                const e = await send(`/api/crm/statements/${statement}/lines`, "POST", { label, amount, reason: why });
                setBusy(false);
                if (e) return setMsg(e);
                location.reload();
              }}>{busy ? "…" : "Adaugă"}</button>
              <button type="button" className="btn btnGhost" onClick={() => setOpen(false)}>Renunță</button>
            </div>
          </div>
        </div>, document.body)}
    </>
  );
}
