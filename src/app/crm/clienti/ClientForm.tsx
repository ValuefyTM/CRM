"use client";

import { useState } from "react";

export type ClientValues = {
  kind: string; name: string; cui: string; reg_no: string; billing_address: string; city: string; county: string;
  phone: string; email: string; vat_payer: boolean | null; caen: string; notes: string;
};
type ContactRow = { name: string; role: string; phone: string; email: string };

const EMPTY: ClientValues = { kind: "person", name: "", cui: "", reg_no: "", billing_address: "", city: "", county: "", phone: "", email: "", vat_payer: null, caen: "", notes: "" };
const OTHER_KINDS: [string, string][] = [["company", "Firmă"], ["bank", "Bancă"], ["ifn", "IFN"], ["uat", "Instituție publică (UAT)"], ["anaf", "ANAF"], ["broker", "Broker"], ["other", "Altul"]];
const ROLES = ["Administrator", "Director", "Contabil", "Reprezentant legal", "Persoană de contact"];

/**
 * New client (person or company) or edit of an existing one. Required: name, phone, email.
 * Companies: CUI with ANAF lookup, contact people and, on creation, portal access for one of them.
 */
export function ClientForm({ base, clientId, initial }: { base: string; clientId?: string; initial?: Partial<ClientValues> }) {
  const isNew = !clientId;
  const [f, setF] = useState<ClientValues>({ ...EMPTY, ...initial });
  const [contacts, setContacts] = useState<ContactRow[]>([{ name: "", role: "", phone: "", email: "" }]);
  const [portal, setPortal] = useState(false);
  const [portalContact, setPortalContact] = useState(0);
  const [anaf, setAnaf] = useState<{ ok: boolean; text: string } | null>(null);
  const [bad, setBad] = useState<string[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; dup?: { id: string; name: string } } | null>(null);
  const [busy, setBusy] = useState("");
  const company = f.kind !== "person";
  const set = (k: keyof ClientValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF((p) => ({ ...p, [k]: e.target.value }));
  const setC = (i: number, k: keyof ContactRow, v: string) => setContacts((l) => l.map((c, j) => (j === i ? { ...c, [k]: v } : c)));
  const inv = (k: string) => (bad.includes(k) ? { "aria-invalid": true as const } : {});

  const lookup = async () => {
    if (!f.cui.trim()) return setAnaf({ ok: false, text: "Scrie întâi CUI-ul." });
    setBusy("anaf"); setAnaf(null);
    const r = await fetch(`/api/crm/anaf?cui=${encodeURIComponent(f.cui)}`).catch(() => null);
    const d = (await r?.json().catch(() => null)) as (Record<string, unknown> & { error?: string }) | null;
    setBusy("");
    if (!r?.ok || !d) return setAnaf({ ok: false, text: d?.error ?? "ANAF nu răspunde momentan. Completează datele manual." });
    setF((p) => ({
      ...p, cui: String(d.cui ?? p.cui), name: (d.name as string) || p.name, reg_no: (d.reg_no as string) ?? p.reg_no,
      billing_address: (d.address as string) ?? p.billing_address, city: (d.city as string) ?? p.city, county: (d.county as string) ?? p.county,
      vat_payer: d.vat_payer as boolean, caen: (d.caen as string) ?? p.caen, phone: p.phone || ((d.phone as string) ?? ""),
    }));
    setAnaf({ ok: !d.inactive, text: `${d.inactive ? "Atenție: firmă declarată inactivă la ANAF. " : ""}${d.status ?? "Date preluate de la ANAF"}${d.vat_payer ? " · plătitor de TVA" : " · neplătitor de TVA"}.` });
  };

  const submit = async (force = false) => {
    const missing = [!f.name.trim() && "name", f.phone.replace(/\D/g, "").length < 9 && "phone", !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim()) && "email"].filter(Boolean) as string[];
    setBad(missing);
    if (missing.length) return setMsg({ ok: false, text: "Completează câmpurile obligatorii: nume, telefon (minimum 9 cifre) și email valid." });
    const list = company ? contacts.filter((c) => c.name || c.phone || c.email) : [];
    setBusy("save"); setMsg(null);
    const r = await fetch(isNew ? "/api/crm/clients" : `/api/crm/clients/${clientId}`, {
      method: isNew ? "POST" : "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...f, contacts: list, portal: isNew && portal, portalContact: company ? (portalContact < list.length ? portalContact : -1) : -1, force }),
    });
    const d = (await r.json().catch(() => ({}))) as { error?: string; id?: string; duplicate?: { id: string; name: string }; portal?: { invited: boolean; error?: string } | null };
    setBusy("");
    if (r.status === 409 && d.duplicate) return setMsg({ ok: false, text: d.error ?? "Client existent.", dup: d.duplicate });
    if (!r.ok) return setMsg({ ok: false, text: d.error || "Nu am putut salva." });
    if (isNew && d.id) {
      const p = d.portal;
      location.href = `${base}/clienti/${d.id}?nou=${p ? (p.invited ? "portal" : p.error ? "portal-eroare" : "portal-neinvitat") : "1"}`;
    } else setMsg({ ok: true, text: "Modificările au fost salvate." });
  };

  return (
    <form className="card" noValidate onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <div className="cardHead">
        <h2>Date client</h2>
        <div className="segment" role="group" aria-label="Tip client" style={{ minWidth: 300 }}>
          <button type="button" aria-pressed={!company} onClick={() => setF((p) => ({ ...p, kind: "person" }))}>Persoană fizică</button>
          <button type="button" aria-pressed={company} onClick={() => setF((p) => ({ ...p, kind: p.kind === "person" ? "company" : p.kind }))}>Persoană juridică</button>
        </div>
      </div>

      {company && (
        <div className="grid2">
          <label className={`field${f.kind === "company" && isNew ? " span2" : ""}`}>CUI
            <span className="actions" style={{ gap: 8, flexWrap: "nowrap", maxWidth: 480 }}>
              <input className="input" style={{ flex: 1, minWidth: 0 }} value={f.cui} onChange={set("cui")} placeholder="ex. RO38250411" onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); lookup(); } }} />
              <button type="button" className="btn btnNavy" style={{ flexShrink: 0 }} onClick={lookup} disabled={busy === "anaf"}>{busy === "anaf" ? "Se caută…" : "Preia de la ANAF"}</button>
            </span>
          </label>
          {f.kind !== "company" || !isNew ? (
            <label className="field">Tip entitate
              <select className="select" value={f.kind} onChange={set("kind")}>{OTHER_KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
            </label>
          ) : null}
          {anaf && <div className={anaf.ok ? "okMsg span2" : "note span2"}>{anaf.text}</div>}
        </div>
      )}

      <div className="grid2">
        <label className="field span2">{company ? "Denumire firmă *" : "Nume și prenume *"}<input className="input" value={f.name} onChange={set("name")} autoComplete="off" {...inv("name")} /></label>
        <label className="field">Telefon *<input className="input" type="tel" value={f.phone} onChange={set("phone")} placeholder="07xx xxx xxx" {...inv("phone")} /></label>
        <label className="field">Email *<input className="input" type="email" value={f.email} onChange={set("email")} placeholder={company ? "office@firma.ro" : "nume@exemplu.ro"} {...inv("email")} /></label>
        <label className="field span2"><span>{company ? "Adresă sediu" : "Adresă"} <small>(opțional)</small></span><input className="input" value={f.billing_address} onChange={set("billing_address")} /></label>
        <label className="field"><span>Localitate <small>(opțional)</small></span><input className="input" value={f.city} onChange={set("city")} /></label>
        <label className="field"><span>Județ <small>(opțional)</small></span><input className="input" value={f.county} onChange={set("county")} /></label>
        {company && (
          <>
            <label className="field"><span>Nr. Registrul Comerțului <small>(opțional)</small></span><input className="input" value={f.reg_no} onChange={set("reg_no")} placeholder="J35/123/2020" /></label>
            <label className="field"><span>Cod CAEN <small>(opțional)</small></span><input className="input" value={f.caen} onChange={set("caen")} /></label>
            <label className="check span2"><input type="checkbox" checked={f.vat_payer === true} onChange={(e) => setF((p) => ({ ...p, vat_payer: e.target.checked }))} />Plătitor de TVA</label>
          </>
        )}
        <label className="field span2"><span>Note interne <small>(opțional)</small></span><textarea className="textarea" rows={3} value={f.notes} onChange={set("notes")} /></label>
      </div>

      {isNew && company && (
        <>
          <div className="section">Persoane de contact</div>
          {contacts.map((c, i) => (
            <div key={i} className="grid2" style={{ background: "var(--cream)", border: "1px solid var(--divider)", borderRadius: 16, padding: 12 }}>
              <label className="field">Nume și prenume<input className="input" value={c.name} onChange={(e) => setC(i, "name", e.target.value)} /></label>
              <label className="field">Funcție
                <input className="input" list="roles" value={c.role} onChange={(e) => setC(i, "role", e.target.value)} placeholder="ex. Administrator" />
              </label>
              <label className="field">Telefon<input className="input" type="tel" value={c.phone} onChange={(e) => setC(i, "phone", e.target.value)} /></label>
              <label className="field">Email<input className="input" type="email" value={c.email} onChange={(e) => setC(i, "email", e.target.value)} /></label>
              {contacts.length > 1 && <button type="button" className="linkBtn" style={{ justifySelf: "start" }} onClick={() => setContacts((l) => l.filter((_, j) => j !== i))}>Șterge persoana</button>}
            </div>
          ))}
          <datalist id="roles">{ROLES.map((r) => <option key={r} value={r} />)}</datalist>
          <button type="button" className="btn btnGhost btnSm" style={{ alignSelf: "flex-start" }} onClick={() => setContacts((l) => [...l, { name: "", role: "", phone: "", email: "" }])}>+ Încă o persoană de contact</button>
        </>
      )}

      {isNew && (
        <>
          <div className="section">Portal client</div>
          <label className="check"><input type="checkbox" checked={portal} onChange={(e) => setPortal(e.target.checked)} />Activează contul în portalul client și trimite invitația pe email</label>
          {portal && company && (
            <label className="field" style={{ maxWidth: 420 }}>Contul se face pentru
              <select className="select" value={portalContact} onChange={(e) => setPortalContact(Number(e.target.value))}>
                {contacts.map((c, i) => (c.name || c.email) && <option key={i} value={i}>{c.name || "Persoana de contact"}{c.email ? ` · ${c.email}` : " (fără email)"}</option>)}
                <option value={-1}>Firmă · {f.email || "emailul firmei"}</option>
              </select>
            </label>
          )}
          {portal && <p className="hint">Clientul primește un link de activare; în portal își vede evaluările, încarcă documente și poate comanda o evaluare nouă.</p>}
        </>
      )}

      {msg && (
        <div role={msg.ok ? "status" : "alert"} className={msg.ok ? "okMsg" : msg.dup ? "note" : "error"}>
          {msg.text}
          {msg.dup && (
            <span className="actions" style={{ marginTop: 8 }}>
              <a className="btn btnGhost btnSm" href={`${base}/clienti/${msg.dup.id}`}>Deschide clientul existent</a>
              <button type="button" className="btn btnGhost btnSm" onClick={() => submit(true)}>Salvează oricum</button>
            </span>
          )}
        </div>
      )}
      <div className="actions">
        <button type="submit" className="btn btnNavy" disabled={busy === "save"}>{busy === "save" ? "Se salvează…" : isNew ? "Salvează clientul" : "Salvează modificările"}</button>
        {isNew && <a href={`${base}/clienti`} className="btn btnGhost">Renunță</a>}
      </div>
    </form>
  );
}
