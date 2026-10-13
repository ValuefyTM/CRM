"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Msg = { id: string; author: string; mine: boolean; staff: boolean; body: string; file: string | null; at: string };

/** Conversation on a report or an order: the old Glide chat and the messages written in the CRM. */
export function Messages({ entity, id, rows }: { entity: "report" | "order"; id: string; rows: Msg[] }) {
  const router = useRouter();
  const [v, setV] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const send = async () => {
    if (!v.trim()) return;
    setBusy(true); setErr("");
    const r = await fetch("/api/crm/messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entity, id, body: v }) }).catch(() => null);
    const d = (await r?.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!r?.ok) return setErr(d?.error ?? "Mesajul nu a putut fi trimis.");
    setV(""); router.refresh();
  };
  return (
    <section className="card">
      <div className="cardHead"><h2>Mesaje</h2>{rows.length > 0 && <span className="muted">{rows.length}</span>}</div>
      {rows.length === 0 ? <p className="hint">Niciun mesaj încă.</p> : (
        <ul className="msgList">
          {rows.map((m) => (
            <li key={m.id} className={m.mine ? "mine" : m.staff ? "staff" : ""}>
              <span className="msgHead"><b>{m.author}</b><time>{new Date(m.at).toLocaleString("ro-RO", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</time></span>
              <p>{m.body}</p>
              {m.file && <a href={m.file} target="_blank" rel="noreferrer" className="msgFile">Fișier atașat ↗</a>}
            </li>
          ))}
        </ul>
      )}
      <div className="msgCompose">
        <textarea className="textarea" rows={2} value={v} onChange={(e) => setV(e.target.value)} placeholder="Scrie un mesaj pentru echipă…" aria-label="Mesaj nou"
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); } }} />
        <button type="button" className="btn btnNavy btnSm" disabled={busy || !v.trim()} onClick={send}>{busy ? "Se trimite…" : "Trimite"}</button>
      </div>
      {err && <div role="alert" className="error">{err}</div>}
    </section>
  );
}
