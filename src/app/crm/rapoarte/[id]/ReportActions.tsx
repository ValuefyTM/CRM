"use client";

import { useRef, useState } from "react";

const STATUSES: [string, string][] = [["draft", "Draft"], ["in_progress", "În lucru"], ["suspended", "Suspendat"], ["done", "Finalizat"], ["cancelled", "Anulat"]];

async function send(url: string, init: RequestInit) {
  const r = await fetch(url, init).catch(() => null);
  const d = (await r?.json().catch(() => ({}))) as { error?: string } | undefined;
  return r?.ok ? null : d?.error || "Nu am putut salva. Încearcă din nou.";
}
const patch = (id: string, body: object) => send(`/api/crm/reports/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

/** "Schimbă status" in the report header: a small panel with the status and, for suspended, the reason. */
export function StatusButton({ id, status, reason }: { id: string; status: string; reason: string | null }) {
  const [open, setOpen] = useState(false);
  const [s, setS] = useState(status);
  const [why, setWhy] = useState(reason ?? "");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="popWrap">
      <button type="button" className="btn btnOnNavy btnSm" aria-expanded={open} onClick={() => setOpen(!open)}>Schimbă status</button>
      {open && (
        <form className="pop" onSubmit={async (e) => {
          e.preventDefault(); setBusy(true); setMsg("");
          const error = await patch(id, { status: s, suspend_reason: why });
          setBusy(false);
          if (error) return setMsg(error);
          location.reload();
        }}>
          <label className="field">Status
            <select className="select" value={s} onChange={(e) => setS(e.target.value)}>{STATUSES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          </label>
          {s === "suspended" && <label className="field">Motivul suspendării<textarea className="textarea" rows={3} value={why} onChange={(e) => setWhy(e.target.value)} required /></label>}
          {msg && <div role="alert" className="error">{msg}</div>}
          <div className="actions">
            <button type="submit" className="btn btnNavy btnSm" disabled={busy}>{busy ? "Se salvează…" : "Salvează"}</button>
            <button type="button" className="btn btnGhost btnSm" onClick={() => setOpen(false)}>Renunță</button>
          </div>
        </form>
      )}
    </div>
  );
}

export function NotesEditor({ id, notes }: { id: string; notes: string | null }) {
  const [v, setV] = useState(notes ?? "");
  const [saved, setSaved] = useState(notes ?? "");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form className="notesForm" onSubmit={async (e) => {
      e.preventDefault(); setBusy(true); setMsg(null);
      const error = await patch(id, { notes: v });
      setBusy(false);
      if (error) return setMsg({ ok: false, text: error });
      setSaved(v); setMsg({ ok: true, text: "Notele au fost salvate." });
    }}>
      <textarea className="textarea" rows={6} value={v} onChange={(e) => { setV(e.target.value); setMsg(null); }} placeholder="Ce trebuie să știe echipa despre acest raport: termene, documente cerute, acces la imobil…" aria-label="Note interne" />
      {msg && <div role={msg.ok ? "status" : "alert"} className={msg.ok ? "okMsg" : "error"}>{msg.text}</div>}
      {v !== saved && <button type="submit" className="btn btnNavy btnSm" style={{ alignSelf: "flex-start" }} disabled={busy}>{busy ? "Se salvează…" : "Salvează notele"}</button>}
    </form>
  );
}

/** File picker that uploads right away. `doc` fills a document that was marked as missing. */
export function UploadButton({ id, kind = "source", doc, label, className = "btn btnGhost btnSm", accept }: { id: string; kind?: "source" | "final"; doc?: string; label: string; className?: string; accept?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  return (
    <>
      <input ref={input} type="file" hidden accept={accept ?? (kind === "final" ? ".pdf" : ".pdf,.jpg,.jpeg,.png,.heic,.webp,.doc,.docx,.xls,.xlsx,.zip")} onChange={async (e) => {
        const f = e.target.files?.[0];
        if (!f) return;
        setBusy(true); setMsg("");
        const body = new FormData();
        body.set("file", f); body.set("kind", kind);
        if (doc) body.set("doc", doc);
        const error = await send(`/api/crm/reports/${id}/documents`, { method: "POST", body });
        setBusy(false); e.target.value = "";
        if (error) return setMsg(error);
        location.reload();
      }} />
      <button type="button" className={className} disabled={busy} onClick={() => input.current?.click()}>{busy ? "Se încarcă…" : label}</button>
      {msg && <span role="alert" className="error inlineErr">{msg}</span>}
    </>
  );
}

/** Drop zone for the signed final PDF. */
export function FinalDrop({ id }: { id: string }) {
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const upload = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true); setMsg("");
    const body = new FormData();
    body.set("file", f); body.set("kind", "final");
    const error = await send(`/api/crm/reports/${id}/documents`, { method: "POST", body });
    setBusy(false);
    if (error) return setMsg(error);
    location.reload();
  };
  return (
    <>
      <button type="button" className={`dropzone${over ? " over" : ""}`} disabled={busy} onClick={() => input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); upload(e.dataTransfer.files?.[0]); }}>
        <b>{busy ? "Se încarcă…" : "Fișierul final al raportului nu este încărcat"}</b>
        <span className="mono">PDF semnat · trage fișierul aici sau apasă</span>
      </button>
      <input ref={input} type="file" accept=".pdf" hidden onChange={(e) => upload(e.target.files?.[0])} />
      {msg && <div role="alert" className="error">{msg}</div>}
    </>
  );
}

export function MissingDoc({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [msg, setMsg] = useState("");
  if (!open) return <button type="button" className="linkBtn" onClick={() => setOpen(true)}>+ Marchează un document lipsă</button>;
  return (
    <form className="inlineForm" onSubmit={async (e) => {
      e.preventDefault();
      const error = await send(`/api/crm/reports/${id}/documents`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ missing: name }) });
      if (error) return setMsg(error);
      location.reload();
    }}>
      <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="ex. Extras CF 284120 (garaj)" aria-label="Document lipsă" autoFocus />
      <button type="submit" className="btn btnNavy btnSm">Adaugă</button>
      <button type="button" className="btn btnGhost btnSm" onClick={() => setOpen(false)}>Renunță</button>
      {msg && <span role="alert" className="error inlineErr">{msg}</span>}
    </form>
  );
}

export function DeleteDoc({ id, doc, name }: { id: string; doc: string; name: string }) {
  return (
    <button type="button" className="linkBtn danger" onClick={async () => {
      if (!confirm(`Ștergi „${name}”?`)) return;
      const error = await send(`/api/crm/reports/${id}/documents?doc=${doc}`, { method: "DELETE" });
      if (error) return alert(error);
      location.reload();
    }}>Șterge</button>
  );
}

export function DeliverButton({ id, ready }: { id: string; ready: boolean }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  return (
    <>
      <button type="button" className="btn btnNavy btnSm" style={{ alignSelf: "flex-start" }} disabled={busy || !ready} title={ready ? undefined : "Încarcă întâi PDF-ul semnat"} onClick={async () => {
        if (!confirm("Marchezi raportul ca predat? Statusul devine Finalizat.")) return;
        setBusy(true);
        const error = await patch(id, { delivered: true });
        setBusy(false);
        if (error) return setMsg(error);
        location.reload();
      }}>{busy ? "Se salvează…" : "Marchează ca predat"}</button>
      {msg && <div role="alert" className="error">{msg}</div>}
    </>
  );
}

const ROLES: [string, string][] = [["evaluator", "Evaluator"], ["inspector", "Inspector"], ["verifier", "Verificator"], ["assistant", "Asistent"]];

export function AddMember({ id, people }: { id: string; people: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState("");
  const [role, setRole] = useState("evaluator");
  const [msg, setMsg] = useState("");
  if (!open) return <button type="button" className="btn btnGhost btnSm" onClick={() => setOpen(true)}>+ Adaugă membru</button>;
  return (
    <form className="inlineForm" onSubmit={async (e) => {
      e.preventDefault();
      const error = await send(`/api/crm/reports/${id}/members`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user, role }) });
      if (error) return setMsg(error);
      location.reload();
    }}>
      <select className="select" value={user} onChange={(e) => setUser(e.target.value)} aria-label="Persoana" required>
        <option value="">Alege persoana…</option>
        {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <select className="select" value={role} onChange={(e) => setRole(e.target.value)} aria-label="Rol">{ROLES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      <button type="submit" className="btn btnNavy btnSm">Adaugă</button>
      <button type="button" className="btn btnGhost btnSm" onClick={() => setOpen(false)}>Renunță</button>
      {msg && <span role="alert" className="error inlineErr">{msg}</span>}
    </form>
  );
}

export function RemoveMember({ id, user, role, name }: { id: string; user: string; role: string; name: string }) {
  return (
    <button type="button" className="linkBtn danger" onClick={async () => {
      if (!confirm(`Scoți pe ${name} din echipa raportului?`)) return;
      const error = await send(`/api/crm/reports/${id}/members?user=${user}&role=${role}`, { method: "DELETE" });
      if (error) return alert(error);
      location.reload();
    }}>Scoate</button>
  );
}

/** Image that falls back to `fallback` (or disappears) when the file cannot be loaded. */
export function SafeImg({ src, alt = "", className, fallback = null }: { src: string; alt?: string; className?: string; fallback?: React.ReactNode }) {
  const [bad, setBad] = useState(false);
  // eslint-disable-next-line @next/next/no-img-element
  return bad ? <>{fallback}</> : <img src={src} alt={alt} className={className} loading="lazy" onError={() => setBad(true)} />;
}
