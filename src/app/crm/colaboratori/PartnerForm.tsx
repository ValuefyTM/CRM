"use client";

import { useState } from "react";

const KINDS: [string, string][] = [
  ["broker", "Broker de credite"], ["agency", "Agenție imobiliară"], ["bank", "Bancă / IFN"], ["legal", "Avocat / notar / executor"],
  ["accounting", "Contabil / consultant fiscal"], ["developer", "Dezvoltator imobiliar"], ["other", "Altul"],
];

export type PartnerValues = { name: string; kind: string; cui: string; reg_com: string; email: string; phone: string; city: string; address: string; notes: string };
const EMPTY: PartnerValues = { name: "", kind: "", cui: "", reg_com: "", email: "", phone: "", city: "", address: "", notes: "" };

/** Create (with the first contact person and invitation) or edit a partner. */
export function PartnerForm({ base, partnerId, initial }: { base: string; partnerId?: string; initial?: PartnerValues }) {
  const isNew = !partnerId;
  const [f, setF] = useState<PartnerValues>(initial ?? EMPTY);
  const [c, setC] = useState({ name: "", email: "", phone: "" });
  const [invite, setInvite] = useState(true);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof PartnerValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF((p) => ({ ...p, [k]: e.target.value }));
  const setCt = (k: keyof typeof c) => (e: React.ChangeEvent<HTMLInputElement>) => setC((p) => ({ ...p, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.name.trim()) return setMsg({ ok: false, text: "Completează denumirea colaboratorului." });
    if (!f.kind) return setMsg({ ok: false, text: "Alege tipul colaboratorului." });
    setBusy(true); setMsg(null);
    const r = await fetch(isNew ? "/api/crm/partners" : `/api/crm/partners/${partnerId}`, {
      method: isNew ? "POST" : "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(isNew ? { ...f, contact: c.email.trim() ? c : undefined, invite } : f),
    });
    const d = (await r.json().catch(() => ({}))) as { error?: string; id?: string; invited?: boolean };
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, text: d.error || "Nu am putut salva." });
    if (isNew && d.id) location.href = `${base}/colaboratori/${d.id}?nou=${c.email.trim() ? (d.invited ? "invitat" : invite ? "neinvitat" : "fara") : "fara"}`;
    else setMsg({ ok: true, text: "Modificările au fost salvate." });
  };

  return (
    <form onSubmit={submit} className="card" noValidate>
      <h2>{isNew ? "Date colaborator" : "Date colaborator"}</h2>
      <div className="grid2">
        <label className="field span2">Denumire *<input className="input" value={f.name} onChange={set("name")} placeholder="ex. Credit Expert SRL sau Ion Popescu (PFA)" /></label>
        <label className="field">Tip colaborator *
          <select className="select" value={f.kind} onChange={set("kind")}>
            <option value="">Alege</option>
            {KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>
        <label className="field">Localitate<input className="input" value={f.city} onChange={set("city")} placeholder="ex. Timișoara" /></label>
        <label className="field"><span>CUI <small>(opțional)</small></span><input className="input" value={f.cui} onChange={set("cui")} placeholder="ex. RO12345678" /></label>
        <label className="field"><span>Nr. Registrul Comerțului <small>(opțional)</small></span><input className="input" value={f.reg_com} onChange={set("reg_com")} placeholder="ex. J35/123/2020" /></label>
        <label className="field"><span>Email firmă <small>(opțional)</small></span><input className="input" type="email" value={f.email} onChange={set("email")} placeholder="office@firma.ro" /></label>
        <label className="field"><span>Telefon firmă <small>(opțional)</small></span><input className="input" type="tel" value={f.phone} onChange={set("phone")} /></label>
        <label className="field span2"><span>Adresă <small>(opțional)</small></span><input className="input" value={f.address} onChange={set("address")} /></label>
        <label className="field span2"><span>Note interne <small>(nu le vede colaboratorul)</small></span><textarea className="textarea" rows={3} value={f.notes} onChange={set("notes")} placeholder="ex. comision convenit, bănci cu care lucrează, persoana care l-a adus" /></label>
      </div>

      {isNew && (
        <>
          <div className="section">Persoana de contact · acces în portal</div>
          <p className="hint">Opțional. Persoana primește o invitație pe email și își activează singură contul. Poți adăuga mai multe persoane după salvare.</p>
          <div className="grid2">
            <label className="field">Nume și prenume<input className="input" value={c.name} onChange={setCt("name")} /></label>
            <label className="field">Email<input className="input" type="email" value={c.email} onChange={setCt("email")} placeholder="nume@firma.ro" /></label>
            <label className="field">Telefon<input className="input" type="tel" value={c.phone} onChange={setCt("phone")} /></label>
          </div>
          <label className="check"><input type="checkbox" checked={invite} onChange={(e) => setInvite(e.target.checked)} />Trimite acum invitația pe email</label>
        </>
      )}

      {msg && <div role={msg.ok ? "status" : "alert"} className={msg.ok ? "okMsg" : "error"}>{msg.text}</div>}
      <div className="actions">
        <button type="submit" className="btn btnNavy" disabled={busy}>{busy ? "Se salvează…" : isNew ? "Salvează colaboratorul" : "Salvează modificările"}</button>
        {isNew && <a href={`${base}/colaboratori`} className="btn btnGhost">Renunță</a>}
      </div>
    </form>
  );
}
