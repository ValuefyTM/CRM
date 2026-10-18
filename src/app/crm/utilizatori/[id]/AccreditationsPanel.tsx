"use client";
// Agreeri: the framework contracts (banks) a team member is accredited on. On those, whatever the role says, the
// person registers the bank's orders, processes them and runs their reports; "Adaugă comandă" shows on their dashboard.
import { useState } from "react";

export type AccredContract = { id: string; bank: string; number: string | null; closed: boolean };

export function AccreditationsPanel(props: { userId: string; contracts: AccredContract[]; initial: string[]; canEdit: boolean }) {
  const [sel, setSel] = useState(new Set(props.initial));
  const [saved, setSaved] = useState(new Set(props.initial));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const changed = sel.size !== saved.size || [...sel].some((x) => !saved.has(x));
  const toggle = (id: string) => { const n = new Set(sel); if (n.has(id)) n.delete(id); else n.add(id); setSel(n); setMsg(null); };
  const save = async () => {
    setBusy(true); setMsg(null);
    const r = await fetch(`/api/crm/users/${props.userId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "accreditations", contracts: [...sel] }) }).catch(() => null);
    const d = (await r?.json().catch(() => ({}))) as { error?: string; contracts?: string[] } | undefined;
    setBusy(false);
    if (!r?.ok) return setMsg({ ok: false, text: d?.error || "Nu s-a putut salva." });
    setSaved(new Set(d?.contracts ?? [...sel]));
    setMsg({ ok: true, text: "Agreerile au fost salvate. Persoana le vede la următoarea pagină deschisă." });
  };
  const list = props.contracts.filter((c) => !c.closed || sel.has(c.id));
  return (
    <section className="card">
      <div className="cardHead"><h2>Agreeri pe contracte cadru</h2>{saved.size > 0 && <span className="pill pillOk"><i />{saved.size} {saved.size === 1 ? "contract" : "contracte"}</span>}</div>
      <p className="hint" style={{ margin: 0 }}>Pe contractele bifate, persoana poate înregistra comenzile băncii (buton „Adaugă comandă” pe tabloul de bord), le poate procesa și le poate duce rapoartele, indiferent de drepturile rolului pe modulul Comenzi.</p>
      {list.length === 0 ? <p className="hint">Nu există contracte cadru deschise.</p> : (
        <ul className="accList">
          {list.map((c) => (
            <li key={c.id}>
              <label>
                <input type="checkbox" checked={sel.has(c.id)} disabled={!props.canEdit || busy} onChange={() => toggle(c.id)} />
                <span><b>{c.bank}</b><small>{c.number ? `contract nr. ${c.number}` : "fără număr"}{c.closed ? " · închis" : ""}</small></span>
              </label>
            </li>
          ))}
        </ul>
      )}
      {props.canEdit && changed && (
        <div className="actions">
          <button type="button" className="btn btnGold btnSm" disabled={busy} onClick={save}>{busy ? "Se salvează…" : "Salvează agreerile"}</button>
          <button type="button" className="btn btnGhost btnSm" disabled={busy} onClick={() => { setSel(new Set(saved)); setMsg(null); }}>Renunță</button>
        </div>
      )}
      {msg && <div role={msg.ok ? "status" : "alert"} className={msg.ok ? "okMsg" : "error"}>{msg.text}</div>}
    </section>
  );
}
