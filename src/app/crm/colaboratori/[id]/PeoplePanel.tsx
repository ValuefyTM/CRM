"use client";

import { useState } from "react";

export type Person = { id: string; name: string; email: string; phone: string | null; role: string; status: string; invitedAt: string; lastLogin: string };

const STATUS: Record<string, [string, string]> = {
  active: ["Activ", "pillOk"],
  invited: ["Invitat", "pillWarn"],
  disabled: ["Dezactivat", "pillErr"],
};

/** Portal users of a partner: add + invite, resend invitation, disable / enable, owner role. */
export function PeoplePanel({ partnerId, people }: { partnerId: string; people: Person[] }) {
  const [list, setList] = useState(people);
  const [open, setOpen] = useState(people.length === 0);
  const [f, setF] = useState({ name: "", email: "", phone: "", owner: false });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState("");

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy("add"); setMsg(null);
    const r = await fetch(`/api/crm/partners/${partnerId}/users`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: f.name, email: f.email, phone: f.phone, role: f.owner ? "owner" : "member" }),
    });
    const d = (await r.json().catch(() => ({}))) as { error?: string; id?: string; invited?: boolean };
    setBusy("");
    if (!r.ok || !d.id) return setMsg({ ok: false, text: d.error || "Nu am putut adăuga persoana." });
    setList((l) => [...l, { id: d.id!, name: f.name, email: f.email.trim().toLowerCase(), phone: f.phone || null, role: f.owner ? "owner" : "member", status: "invited", invitedAt: "acum", lastLogin: "—" }]);
    setF({ name: "", email: "", phone: "", owner: false });
    setOpen(false);
    setMsg({ ok: true, text: d.invited ? "Invitația a fost trimisă pe email." : "Persoana a fost adăugată, dar emailul nu a putut fi trimis. Verifică setările de email și retrimite invitația." });
  };

  const act = async (p: Person, action: string, extra: object = {}) => {
    if (action === "disable" && !confirm(`Dezactivezi accesul pentru ${p.email}? Persoana va fi deconectată.`)) return;
    setBusy(p.id + action); setMsg(null);
    const r = await fetch(`/api/crm/partner-users/${p.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...extra }) });
    const d = (await r.json().catch(() => ({}))) as { error?: string; sent?: boolean; status?: string };
    setBusy("");
    if (!r.ok) return setMsg({ ok: false, text: d.error || "Acțiunea nu a reușit." });
    setList((l) => l.map((x) => {
      if (x.id !== p.id) return x;
      if (action === "invite") return { ...x, status: "invited", invitedAt: "acum" };
      if (action === "disable") return { ...x, status: "disabled" };
      if (action === "enable") return { ...x, status: d.status ?? "invited" };
      if (action === "role") return { ...x, role: (extra as { role: string }).role };
      return x;
    }));
    if (action === "invite") setMsg({ ok: !!d.sent, text: d.sent ? `Invitația a fost retrimisă către ${p.email}.` : "Emailul nu a putut fi trimis. Verifică setările de email (RESEND_API_KEY, CRM_EMAIL_FROM)." });
  };

  return (
    <section className="card">
      <div className="cardHead">
        <h2>Persoane cu acces în portal</h2>
        {!open && <button type="button" className="btn btnGhost btnSm" onClick={() => setOpen(true)}>+ Adaugă persoană</button>}
      </div>
      <p className="hint">Fiecare persoană se autentifică cu propriul email, pe baza unui cod primit pe email. Toate persoanele văd comenzile colaboratorului.</p>
      {list.length > 0 && (
        <ul className="people">
          {list.map((p) => {
            const [label, cls] = STATUS[p.status] ?? [p.status, ""];
            return (
              <li key={p.id}>
                <span className="avatar" style={{ background: p.status === "active" ? "var(--acc)" : "var(--cream-2)" }}>{(p.name || p.email)[0].toUpperCase()}</span>
                <span className="who">
                  <b>{p.name || "—"} {p.role === "owner" && <span className="pill" style={{ marginLeft: 4 }}>Administrator cont</span>}</b>
                  <span className="muted">{p.email}{p.phone ? ` · ${p.phone}` : ""}</span>
                  <span className="muted">{p.status === "invited" ? `Invitat ${p.invitedAt}` : `Ultima autentificare: ${p.lastLogin}`}</span>
                </span>
                <span className={`pill ${cls}`}><i />{label}</span>
                <span className="actions" style={{ gap: 6 }}>
                  {p.status !== "active" && <button type="button" className="btn btnGhost btnSm" disabled={!!busy} onClick={() => act(p, "invite")}>{p.status === "disabled" ? "Reinvită" : "Retrimite invitația"}</button>}
                  {p.status === "active" && <button type="button" className="btn btnGhost btnSm" disabled={!!busy} onClick={() => act(p, "role", { role: p.role === "owner" ? "member" : "owner" })}>{p.role === "owner" ? "Fă membru" : "Fă administrator"}</button>}
                  {p.status !== "disabled"
                    ? <button type="button" className="btn btnDanger btnSm" disabled={!!busy} onClick={() => act(p, "disable")}>Dezactivează</button>
                    : <button type="button" className="btn btnGhost btnSm" disabled={!!busy} onClick={() => act(p, "enable")}>Reactivează</button>}
                </span>
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
            <button type="submit" className="btn btnNavy btnSm" disabled={busy === "add"}>{busy === "add" ? "Se trimite…" : "Adaugă și trimite invitația"}</button>
            {list.length > 0 && <button type="button" className="btn btnGhost btnSm" onClick={() => setOpen(false)}>Renunță</button>}
          </div>
        </form>
      )}
      {msg && <div role={msg.ok ? "status" : "alert"} className={msg.ok ? "okMsg" : "error"}>{msg.text}</div>}
    </section>
  );
}
