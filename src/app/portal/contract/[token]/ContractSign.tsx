"use client";

import { useState } from "react";
import { SignaturePad } from "@/components/OfferAccept";

const post = async (token: string, body: Record<string, unknown>) => {
  const r = await fetch(`/api/contract/${encodeURIComponent(token)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  const d = (await r?.json().catch(() => ({}))) as { error?: string } | undefined;
  return r?.ok ? null : d?.error || "Nu am putut trimite. Verifică conexiunea și încearcă din nou.";
};

type B = { address: string; city: string; county: string; cui: string; reg_no: string; rep: string; rep_role: string };

/** The billing details the contract needs (address; for companies also CUI, registration number, legal representative). */
export function BillingForm({ token, company, initial, name }: { token: string; company: boolean; initial: B; name: string }) {
  const [f, setF] = useState(initial);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: keyof B) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <section className="ofCard">
      <h2>Date de facturare · {name}</h2>
      <p className="ofMuted">Apar în contract și pe factură. Le folosim doar pentru acest contract (vezi capitolul 8 din contract – protecția datelor).</p>
      <form className="ofForm" onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true); setMsg("");
        const err = await post(token, { action: "billing", ...f });
        setBusy(false);
        if (err) return setMsg(err);
        location.reload();
      }}>
        {company && (
          <div className="ofGrid2 flat tight">
            <label className="ofField">CUI<input value={f.cui} onChange={set("cui")} placeholder="ex. RO12345678" /></label>
            <label className="ofField">Nr. înregistrare Registrul Comerțului<input value={f.reg_no} onChange={set("reg_no")} placeholder="ex. J35/1234/2020" /></label>
          </div>
        )}
        <label className="ofField">{company ? "Sediul social / adresa de facturare" : "Adresa de facturare (domiciliu)"}<input value={f.address} onChange={set("address")} placeholder="Strada, număr, bloc, apartament" autoComplete="street-address" /></label>
        <div className="ofGrid2 flat tight">
          <label className="ofField">Localitate<input value={f.city} onChange={set("city")} autoComplete="address-level2" /></label>
          <label className="ofField">Județ<input value={f.county} onChange={set("county")} autoComplete="address-level1" /></label>
        </div>
        {company && (
          <div className="ofGrid2 flat tight">
            <label className="ofField">Reprezentant legal (nume și prenume)<input value={f.rep} onChange={set("rep")} /></label>
            <label className="ofField">Calitatea<input value={f.rep_role} onChange={set("rep_role")} placeholder="ex. Administrator" /></label>
          </div>
        )}
        {msg && <div role="alert" className="ofError">{msg}</div>}
        <button type="submit" className="ofBtnNavy" disabled={busy}>{busy ? "Se salvează…" : "Salvează și vezi contractul"} <i>→</i></button>
      </form>
    </section>
  );
}

/** Name, drawn signature and agreement; signing freezes the contract as shown. */
export function ContractSignForm({ token, version, number, defaultName }: { token: string; version: string; number: string; defaultName: string }) {
  const [name, setName] = useState(defaultName);
  const [sig, setSig] = useState("");
  const [agree, setAgree] = useState(false);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const today = new Date().toLocaleDateString("ro-RO");
  return (
    <section className="ofCard ofAccept no-print" id="semnare">
      <h2>Semnează contractul nr. {number}</h2>
      <p className="ofMuted">Semnătura electronică are aceeași valoare ca cea olografă (Legea nr. 455/2001 și Regulamentul (UE) nr. 910/2014). Păstrăm varianta semnată, data, ora și adresa IP, ca dovadă; primești o copie pe email.</p>
      <form className="ofForm" onSubmit={async (e) => {
        e.preventDefault();
        if (name.trim().split(/\s+/).length < 2) return setMsg("Scrie numele și prenumele complet.");
        if (!sig) return setMsg("Semnează în chenar.");
        if (!agree) return setMsg("Bifează că ai citit și accepți contractul.");
        setBusy(true); setMsg("");
        const err = await post(token, { action: "sign", name, signature: sig, agree, version });
        setBusy(false);
        if (err) return setMsg(err);
        location.reload();
      }}>
        <div className="ofGrid2 flat tight">
          <label className="ofField">Nume și prenume (semnatar)<input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></label>
          <label className="ofField">Data<input value={today} readOnly disabled /></label>
        </div>
        <SignaturePad onChange={setSig} disabled={busy} />
        <label className="ofCheck"><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
          <span>Am citit și accept Contractul de prestări servicii nr. {number}, cu anexele sale (Condiții speciale – termenii de referință ai evaluării și Condiții financiare), inclusiv capitolul privind protecția datelor cu caracter personal.</span></label>
        {msg && <div role="alert" className="ofError">{msg}</div>}
        <button type="submit" className="ofBtnNavy" disabled={busy}>{busy ? "Se semnează…" : "Semnează contractul"} <i>✓</i></button>
      </form>
    </section>
  );
}
