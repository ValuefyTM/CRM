"use client";

import { useState } from "react";
import { STATUS_LABEL } from "@/lib/labels";

export type Person = { id: string; name: string; email: string; phone: string | null; role: string; status: string; invitedAt: string; lastLogin: string };

/** People of a partner firm with portal access. Quick add + invite here; everything else on the person's page. */
export function PeoplePanel({ base, partnerId, people }: { base: string; partnerId: string; people: Person[] }) {
  const [list, setList] = useState(people);
  const [open, setOpen] = useState(people.length === 0);
  const [f, setF] = useState({ name: "", email: "", phone: "", owner: false });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setMsg(null);
    const r = await fetch("/api/crm/users", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "partner", partner_id: partnerId, name: f.name, email: f.email, phone: f.phone, role: f.owner ? "owner" : "member" }),
    });
    const d = (await r.json().catch(() => ({}))) as { error?: string; id?: string; invited?: boolean };
    setBusy(false);
    if (!r.ok || !d.id) return setMsg({ ok: false, text: d.error || "Nu am putut adăuga persoana." });
    setList((l) => [...l, { id: d.id!, name: f.name, email: f.email.trim().toLowerCase(), phone: f.phone || null, role: f.owner ? "owner" : "member", status: "invited", invitedAt: "acum", lastLogin: "—" }]);
    setF({ name: "", email: "", phone: "", owner: false });
    setOpen(false);
    setMsg({ ok: !!d.invited, text: d.invited ? "Invitația a fost trimisă pe email." : "Persoana a fost adăugată, dar emailul nu a putut fi trimis. Retrimite invitația din pagina persoanei." });
  };

  return (
    <section className="card">
      <div className="cardHead">
        <h2>Persoane cu acces în portal</h2>
        {!open && <button type="button" className="btn btnGhost btnSm" onClick={() => setOpen(true)}>+ Adaugă persoană</button>}
      </div>
      <p className="hint">Fiecare persoană se autentifică cu propriul email, pe baza unui cod primit pe email. Toate persoanele văd comenzile firmei.</p>
      {list.length > 0 && (
        <ul className="people">
          {list.map((p) => {
            const [label, cls] = STATUS_LABEL[p.status] ?? [p.status, ""];
            return (
              <li key={p.id}>
                <span className="avatar" style={{ background: p.status === "active" ? "var(--acc)" : "var(--cream-2)" }}>{(p.name || p.email)[0].toUpperCase()}</span>
                <span className="who">
                  <a className="rowLink" href={`${base}/utilizatori/${p.id}`}>{p.name || p.email} {p.role === "owner" && <span className="pill" style={{ marginLeft: 4 }}>Administrator cont</span>}</a>
                  <span className="muted">{p.email}{p.phone ? ` · ${p.phone}` : ""}</span>
                  <span className="muted">{p.status === "invited" ? `Invitat ${p.invitedAt}` : `Ultima autentificare: ${p.lastLogin}`}</span>
                </span>
                <span className={`pill ${cls}`}><i />{label}</span>
                <a className="btn btnGhost btnSm" href={`${base}/utilizatori/${p.id}`}>Gestionează</a>
              </li>
            );
          })}
        </ul>
      )}
      {list.length === 0 && !open && <div className="empty">Nicio persoană cu acces încă.</div>}
      {open && (
        <form onSubmit={add} className="grid2" noValidate style={{ background: "var(--cream)", border: "1px solid var(--divider)", borderRadius: 16, padding: 14 }}>
          <label className="field">Nume și prenume<input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
          <label className="field">Email *<input className="input" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="nume@firma.ro" /></label>
          <label className="field">Telefon<input className="input" type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></label>
          <label className="check" style={{ alignSelf: "end", paddingBottom: 12 }}><input type="checkbox" checked={f.owner} onChange={(e) => setF({ ...f, owner: e.target.checked })} />Administrator al contului</label>
          <div className="actions span2">
            <button type="submit" className="btn btnNavy btnSm" disabled={busy}>{busy ? "Se trimite…" : "Adaugă și trimite invitația"}</button>
            {list.length > 0 && <button type="button" className="btn btnGhost btnSm" onClick={() => setOpen(false)}>Renunță</button>}
          </div>
        </form>
      )}
      {msg && <div role={msg.ok ? "status" : "alert"} className={msg.ok ? "okMsg" : "error"}>{msg.text}</div>}
    </section>
  );
}
