"use client";
// Placing properties on the map from their cadastral number (Tools cadastral locator): all at once, or one property.
import { useState } from "react";

type Counts = { todo: number; tried: number };

export function LocateAll({ initial, enabled }: { initial: Counts; enabled: boolean }) {
  const [c, setC] = useState(initial);
  const [run, setRun] = useState<{ located: number; processed: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const start = async (retry: boolean) => {
    setBusy(true); setMsg(""); setRun({ located: 0, processed: 0 });
    let total = { located: 0, processed: 0 }, first = true;
    for (;;) {
      const r = await fetch("/api/crm/properties/locate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ limit: 150, retry: retry && first }) }).catch(() => null);
      const d = (await r?.json().catch(() => ({}))) as { located?: number; processed?: number; todo?: number; tried?: number; error?: string } | undefined;
      if (!r?.ok || !d) { setMsg(d?.error || "Localizatorul nu a răspuns. Încearcă din nou."); break; }
      first = false;
      total = { located: total.located + (d.located ?? 0), processed: total.processed + (d.processed ?? 0) };
      setRun(total); setC({ todo: d.todo ?? 0, tried: d.tried ?? 0 });
      if (!d.processed || !d.todo) break;
    }
    setBusy(false);
  };
  const [check, setCheck] = useState<{ ok: boolean; steps: { ok: boolean; text: string }[] } | null>(null);
  const [checking, setChecking] = useState(false);
  const verify = async () => {
    setChecking(true); setCheck(null);
    const r = await fetch("/api/crm/properties/locate?check=1").catch(() => null);
    setCheck(((await r?.json().catch(() => null)) as typeof check) ?? { ok: false, steps: [{ ok: false, text: "CRM-ul nu a răspuns." }] });
    setChecking(false);
  };
  const checkBox = check && (
    <div className={check.ok ? "note" : "error"} role="status" style={{ flexBasis: "100%" }}>
      <b>{check.ok ? "Legătura cu localizatorul funcționează." : "Legătura cu localizatorul nu funcționează:"}</b>
      <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>{check.steps.map((x, i) => <li key={i}>{x.ok ? "✓" : "✗"} {x.text}</li>)}</ul>
    </div>
  );
  if (!enabled) return <div className="note">Localizarea automată din cadastru se activează cu variabila <b>LOCATOR_API_TOKEN</b> (aceeași valoare în Tools și în CRM). Dacă ai setat-o, fă deploy din nou la CRM: variabilele noi intră în vigoare la următoarea versiune.</div>;
  return (
    <div className="locateBar">
      <span className="locateIc" aria-hidden="true">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></svg>
      </span>
      <span className="locateText">
        <b>Localizare din cadastru</b>
        <small>
          {run ? `${run.located} din ${run.processed} proprietăți au primit coordonate (centrul parcelei din planul UAT).`
            : c.todo ? `${c.todo.toLocaleString("ro-RO")} proprietăți fără coordonate au număr cadastral sau CF și pot fi puse pe hartă.`
            : "Toate proprietățile cu număr cadastral au fost verificate."}
          {c.tried > 0 && ` ${c.tried.toLocaleString("ro-RO")} nu au fost găsite în planuri.`}
        </small>
        {msg && <span role="alert" className="error inlineErr">{msg}</span>}
      </span>
      {busy ? <span className="locateRun"><i />Se localizează… {c.todo.toLocaleString("ro-RO")} rămase</span> : (
        <span className="actions">
          {c.todo > 0 && <button type="button" className="btn btnNavy btnSm" onClick={() => start(false)}>Localizează {c.todo.toLocaleString("ro-RO")}</button>}
          {c.tried > 0 && <button type="button" className="btn btnGhost btnSm" onClick={() => start(true)}>Reîncearcă negăsitele</button>}
          <button type="button" className="btn btnGhost btnSm" disabled={checking} onClick={verify}>{checking ? "Se verifică…" : "Verifică legătura"}</button>
        </span>
      )}
      {checkBox}
    </div>
  );
}

export function LocateOne({ id }: { id: string }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  return (
    <span className="actions" style={{ alignItems: "center" }}>
      <button type="button" className="btn btnNavy btnSm" disabled={busy} onClick={async () => {
        setBusy(true); setMsg("");
        const r = await fetch("/api/crm/properties/locate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) }).catch(() => null);
        const d = (await r?.json().catch(() => ({}))) as { ok?: boolean; note?: string; error?: string } | undefined;
        setBusy(false);
        if (r?.ok && d?.ok) return location.reload();
        setMsg(d?.error || d?.note || "Nu am găsit parcela în planuri.");
      }}>{busy ? "Se caută…" : "Localizează din cadastru"}</button>
      {msg && <span className="hint">{msg}</span>}
    </span>
  );
}
