"use client";

import { useState } from "react";

type C = { id: string; name: string; role: string | null; phone: string | null; email: string | null; is_primary: number; portal: string | null };

/** Contact people of a company: add, make main contact, remove, give portal access. */
export function ContactsPanel({ clientId, contacts }: { clientId: string; contacts: C[] }) {
  const [open, setOpen] = useState(contacts.length === 0);
  const [f, setF] = useState({ name: "", role: "", phone: "", email: "" });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState("");
  const call = async (url: string, method: string, body?: object) => {
    const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    return { ok: r.ok, d: (await r.json().catch(() => ({}))) as { error?: string; invited?: boolean } };
  };
  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy("add"); setMsg(null);
    const r = await call(`/api/crm/clients/${clientId}/contacts`, "POST", { ...f, primary: contacts.length === 0 });
    setBusy("");
    if (!r.ok) return setMsg({ ok: false, text: r.d.error || "Nu am putut adăuga persoana." });
    location.reload();
  };
  const act = async (c: C, what: "primary" | "remove" | "portal") => {
    if (what === "remove" && !confirm(`Ștergi persoana de contact ${c.name}?`)) return;
    setBusy(c.id + what); setMsg(null);
    const r = what === "portal" ? await call(`/api/crm/clients/${clientId}/portal`, "POST", { contact: c.id })
      : await call(`/api/crm/clients/${clientId}/contacts?contact=${c.id}`, what === "primary" ? "PATCH" : "DELETE");
    setBusy("");
    if (!r.ok) return setMsg({ ok: false, text: r.d.error || "Acțiunea nu a reușit." });
    if (what === "portal" && !r.d.invited) return setMsg({ ok: false, text: "Contul a fost creat, dar emailul de invitație nu a putut fi trimis." });
    location.reload();
  };
  return (
    <section className="card">
      <div className="cardHead">
        <h2>Persoane de contact</h2>
        {!open && <button type="button" className="btn btnGhost btnSm" onClick={() => setOpen(true)}>+ Adaugă persoană</button>}
      </div>
      {contacts.length > 0 && (
        <ul className="people">
          {contacts.map((c) => (
            <li key={c.id}>
              <span className="avatar" style={{ background: c.is_primary ? "var(--acc)" : "var(--cream-2)" }}>{c.name[0]?.toUpperCase()}</span>
              <span className="who">
                <b>{c.name}{c.is_primary ? <span className="pill" style={{ marginLeft: 6 }}>Principal</span> : null}</b>
                <span className="muted">{[c.role, c.phone, c.email].filter(Boolean).join(" · ") || "—"}</span>
              </span>
              <span className="actions" style={{ gap: 6 }}>
                {c.portal ? <span className="pill pillOk"><i />Portal: {c.portal === "active" ? "activ" : c.portal === "invited" ? "invitat" : "dezactivat"}</span>
                  : c.email && <button type="button" className="btn btnGhost btnSm" disabled={!!busy} onClick={() => act(c, "portal")}>{busy === c.id + "portal" ? "Se trimite…" : "Activează portal"}</button>}
                {!c.is_primary && <button type="button" className="btn btnGhost btnSm" disabled={!!busy} onClick={() => act(c, "primary")}>Fă principal</button>}
                <button type="button" className="btn btnDanger btnSm" disabled={!!busy} onClick={() => act(c, "remove")}>Șterge</button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {contacts.length === 0 && !open && <div className="empty">Nicio persoană de contact.</div>}
      {open && (
        <form onSubmit={add} className="grid2" noValidate style={{ background: "var(--cream)", border: "1px solid var(--divider)", borderRadius: 16, padding: 14 }}>
          <label className="field">Nume și prenume *<input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
          <label className="field">Funcție<input className="input" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} placeholder="ex. Administrator" /></label>
          <label className="field">Telefon<input className="input" type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></label>
          <label className="field">Email<input className="input" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
          <div className="actions span2">
            <button type="submit" className="btn btnNavy btnSm" disabled={busy === "add"}>{busy === "add" ? "Se salvează…" : "Adaugă persoana"}</button>
            {contacts.length > 0 && <button type="button" className="btn btnGhost btnSm" onClick={() => setOpen(false)}>Renunță</button>}
          </div>
        </form>
      )}
      {msg && <div role={msg.ok ? "status" : "alert"} className={msg.ok ? "okMsg" : "error"}>{msg.text}</div>}
    </section>
  );
}
