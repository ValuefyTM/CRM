"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "./Avatar";

type Msg = { id: string; author_id: string | null; photo: string | null; author: string; mine: boolean; staff: boolean; body: string; file: string | null; at: string };

const when = (iso: string) => {
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  return today
    ? d.toLocaleTimeString("ro-RO", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleString("ro-RO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).replace(".", "");
};

/**
 * Conversation on a report or an order between the CRM users (the old Glide chat too). Enter sends, Shift+Enter adds a
 * line; the list opens on the latest message.
 */
export function Messages({ entity, id, rows, title = "Mesaje", hint }: { entity: "report" | "order"; id: string; rows: Msg[]; title?: string; hint?: string }) {
  const router = useRouter();
  const [v, setV] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const list = useRef<HTMLUListElement>(null);
  useEffect(() => { if (list.current) list.current.scrollTop = list.current.scrollHeight; }, [rows.length]);
  const send = async () => {
    if (!v.trim() || busy) return;
    setBusy(true); setErr("");
    const r = await fetch("/api/crm/messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entity, id, body: v }) }).catch(() => null);
    const d = (await r?.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!r?.ok) return setErr(d?.error ?? "Mesajul nu a putut fi trimis.");
    setV(""); router.refresh();
  };
  return (
    <section className="card msgCard">
      <div className="cardHead"><h2>{title}</h2>{rows.length > 0 && <span className="muted">{rows.length}</span>}</div>
      {hint && <p className="hint msgHint">{hint}</p>}
      {rows.length === 0 ? <p className="hint msgEmpty">Niciun mesaj încă. Scrie primul mesaj pentru echipă.</p> : (
        <ul className="msgList" ref={list}>
          {rows.map((m, i) => {
            const same = i > 0 && rows[i - 1].author === m.author && Date.parse(m.at) - Date.parse(rows[i - 1].at) < 10 * 60000;
            return (
              <li key={m.id} className={`${m.mine ? "mine" : m.staff ? "staff" : ""}${same ? " cont" : ""}`}>
                {!m.mine && <span className="msgAv">{!same && <Avatar id={m.author_id ?? m.author} name={m.author} size={26} photo={m.photo} />}</span>}
                <div className="msgBubble">
                  {!same && <span className="msgHead">{!m.mine && <b>{m.author}</b>}<time dateTime={m.at}>{when(m.at)}</time></span>}
                  <p>{m.body}</p>
                  {m.file && <a href={m.file} target="_blank" rel="noreferrer" className="msgFile">Fișier atașat ↗</a>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <div className="msgCompose">
        <textarea className="textarea" rows={2} value={v} onChange={(e) => setV(e.target.value)} placeholder="Scrie un mesaj echipei… (Enter trimite)" aria-label="Mesaj nou"
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }} />
        <button type="button" className="btn btnNavy btnSm" disabled={busy || !v.trim()} onClick={send}>{busy ? "…" : "Trimite"}</button>
      </div>
      {err && <div role="alert" className="error">{err}</div>}
    </section>
  );
}
