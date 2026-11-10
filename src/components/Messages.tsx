"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "./Avatar";

type Msg = { id: string; author_id: string | null; photo: string | null; author: string; mine: boolean; staff: boolean; body: string; file: string | null; at: string; tag?: "portal" | "broker" | "order" | null };
const TAGS = { portal: ["din portal", "Scris de colaborator în portal"], broker: ["către broker", "Trimis colaboratorului: îl vede în portal și pe email"], order: ["pe comandă", "Scris în chatul comenzii"] } as const;

const when = (iso: string) => {
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  return today
    ? d.toLocaleTimeString("ro-RO", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleString("ro-RO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).replace(".", "");
};
const dayOf = (iso: string) => {
  const d = new Date(iso), t = new Date();
  const y = new Date(t); y.setDate(t.getDate() - 1);
  if (d.toDateString() === t.toDateString()) return "Azi";
  if (d.toDateString() === y.toDateString()) return "Ieri";
  return d.toLocaleDateString("ro-RO", { weekday: "long", day: "numeric", month: "long" });
};

/**
 * Conversation on a report or an order between the CRM users (the old Glide chat too). Enter sends, Shift+Enter adds a
 * line; the list opens on the latest message. `full` is the big chat of the Mesaje tab (with the days between messages);
 * `limit` + `more` show only the latest few, with a link to the whole chat.
 */
export function Messages({ entity, id, rows, title = "Mesaje", hint, full, limit, more, readOnly, post, empty, broker }: {
  entity: "report" | "order"; id: string; rows: Msg[]; title?: string; hint?: string; full?: boolean; limit?: number; more?: string;
  /** Only read (a finished report): no new messages. */
  readOnly?: string | null;
  /** where a new message goes (the portal: the order's own address, `{ body }`); the CRM's by default */
  post?: string;
  /** the text of an empty chat */
  empty?: string;
  /** a report from a collaborator's portal order: their name, for the "send to them too" tick */
  broker?: string | null;
}) {
  const router = useRouter();
  const [v, setV] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [toBroker, setToBroker] = useState(false);
  const list = useRef<HTMLUListElement>(null);
  useEffect(() => { if (list.current) list.current.scrollTop = list.current.scrollHeight; }, [rows.length]);
  const send = async () => {
    if (!v.trim() || busy) return;
    setBusy(true); setErr("");
    const r = await fetch(post ?? "/api/crm/messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(post ? { body: v } : { entity, id, body: v, ...(broker && toBroker ? { broker: true } : {}) }) }).catch(() => null);
    const d = (await r?.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!r?.ok) return setErr(d?.error ?? "Mesajul nu a putut fi trimis.");
    setV(""); setToBroker(false); router.refresh();
  };
  const shown = limit ? rows.slice(-limit) : rows;
  return (
    <section className={`card msgCard${full ? " msgFull" : ""}`}>
      <div className="cardHead">
        <h2>{title}</h2>
        {more && rows.length > 0 ? <a className="link msgMore" href={more}>{rows.length > shown.length ? `toate ${rows.length}` : "deschide chatul"} →</a>
          : rows.length > 0 && <span className="muted">{rows.length} {rows.length === 1 ? "mesaj" : "mesaje"}</span>}
      </div>
      {hint && <p className="hint msgHint">{hint}</p>}
      {shown.length === 0 ? (
        <div className="msgEmpty">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.8 7L3 21l2-6.2A8 8 0 1 1 21 12z" /></svg>
          <span>{empty ?? "Niciun mesaj încă. Scrie primul mesaj pentru echipă."}</span>
        </div>
      ) : (
        <ul className="msgList" ref={list}>
          {shown.map((m, i) => {
            const prev = shown[i - 1];
            const newDay = full && (!prev || new Date(prev.at).toDateString() !== new Date(m.at).toDateString());
            const same = !newDay && !!prev && prev.author === m.author && Date.parse(m.at) - Date.parse(prev.at) < 10 * 60000;
            return [
              newDay ? <li key={`d${m.id}`} className="msgDay"><span>{dayOf(m.at)}</span></li> : null,
              <li key={m.id} className={`${m.mine ? "mine" : m.staff ? "staff" : ""}${same ? " cont" : ""}${m.tag ? ` tag-${m.tag}` : ""}`}>
                <span className="msgAv">{!same && <Avatar id={m.author_id ?? m.author} name={m.author} size={full ? 32 : 26} photo={m.photo} />}</span>
                <div className="msgBubble">
                  {(!same || m.tag) && <span className="msgHead">{!same && <b>{m.mine ? "Tu" : m.author}</b>}{m.tag && <span className={`msgTag ${m.tag}`} title={TAGS[m.tag][1]}>{TAGS[m.tag][0]}</span>}{!same && <time dateTime={m.at}>{when(m.at)}</time>}</span>}
                  <p>{m.body}</p>
                  {m.file && <a href={m.file} target="_blank" rel="noreferrer" className="msgFile">Fișier atașat ↗</a>}
                </div>
              </li>,
            ];
          })}
        </ul>
      )}
      {readOnly ? <p className="msgLocked">{readOnly}</p> : <div className="msgCompose">
        <textarea className="textarea" rows={full ? 3 : 2} value={v} onChange={(e) => setV(e.target.value)} placeholder={toBroker ? `Mesaj către ${broker}… (Enter trimite)` : full ? "Scrie un mesaj echipei… (Enter trimite, Shift+Enter rând nou)" : "Scrie un mesaj… (Enter trimite)"} aria-label="Mesaj nou"
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }} />
        {broker && <label className="msgBroker"><input type="checkbox" checked={toBroker} onChange={(e) => setToBroker(e.target.checked)} />
          <span>Scrie către <b>{broker}</b> (broker): vede mesajul în portal și îl primește pe email</span></label>}
        <button type="button" className="btn btnNavy btnSm msgSend" disabled={busy || !v.trim()} onClick={send} aria-label="Trimite mesajul">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m22 2-7 20-4-9-9-4 20-7z" /><path d="M22 2 11 13" /></svg>
          {busy ? "…" : "Trimite"}
        </button>
      </div>}
      {err && <div role="alert" className="error">{err}</div>}
    </section>
  );
}
