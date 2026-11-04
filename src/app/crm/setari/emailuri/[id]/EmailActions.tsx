"use client";
// The text of an email received, and what can be done with it: the rules run again, ignored, or — for administrators —
// a new rule made from it: select the order number, the client's name, or a phrase that identifies this kind of email,
// and the rule's patterns are proposed (the words before the number / the name, the code's letters).
import { useRef, useState } from "react";

type Draft = { body_has: string; ref_after: string; ref_shape: string; client_after: string };
const before = (text: string, at: number) => {
  const line = text.slice(0, at).split("\n").pop() ?? "";
  const words = line.trimEnd().split(/\s+/).filter(Boolean);
  // the last word or two before the selection ("client", "Numele clientului:", "ID de cerere:")
  const take = words.length >= 2 && /:$/.test(words[words.length - 1]) ? words.slice(-2) : words.slice(-1);
  return take.join(" ").replace(/[,;]$/, "");
};

export function EmailActions({ email, body, subject, from, base, admin }: { email: string; body: string; subject: string; from: string; base: string; admin: boolean }) {
  const box = useRef<HTMLPreElement>(null);
  const [sel, setSel] = useState<{ text: string; at: number } | null>(null);
  const [draft, setDraft] = useState<Draft>({ body_has: "", ref_after: "", ref_shape: "", client_after: "" });
  const [busy, setBusy] = useState(false);
  const pick = () => {
    const s = window.getSelection();
    if (!s || s.isCollapsed || !box.current?.contains(s.anchorNode)) return setSel(null);
    const r = s.getRangeAt(0), pre = document.createRange();
    pre.selectNodeContents(box.current); pre.setEnd(r.startContainer, r.startOffset);
    const text = s.toString().trim();
    if (text) setSel({ text: text.slice(0, 200), at: pre.toString().length });
  };
  const use = (what: "ref" | "client" | "cond") => {
    if (!sel) return;
    if (what === "ref") setDraft({ ...draft, ref_after: before(body, sel.at), ref_shape: sel.text.match(/^[A-Za-z]{1,8}(?=\d)/)?.[0]?.toUpperCase() ?? "" });
    if (what === "client") setDraft({ ...draft, client_after: before(body, sel.at) });
    if (what === "cond") setDraft({ ...draft, body_has: draft.body_has ? `${draft.body_has} | ${sel.text}` : sel.text });
    setSel(null); window.getSelection()?.removeAllRanges();
  };
  const act = async (action: "rerun" | "ignore") => {
    setBusy(true);
    const r = await fetch(`/api/crm/inbox/${email}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) }).catch(() => null);
    const d = (await r?.json().catch(() => ({}))) as { error?: string; status?: string; task?: string } | undefined;
    setBusy(false);
    if (!r?.ok) return alert(d?.error ?? "Nu s-a putut.");
    if (action === "rerun" && d?.status === "unmatched") alert("Nicio regulă nu se potrivește cu acest email.");
    location.reload();
  };
  const started = draft.body_has || draft.ref_after || draft.client_after;
  const q = new URLSearchParams({ din: email, ...draft, ...(from && !draft.body_has ? { from_has: from.split("@")[1] ?? "" } : {}), ...(subject ? { subiect: subject.slice(0, 80) } : {}) });
  return (
    <>
      <div className="actions" style={{ marginBottom: 10 }}>
        <button type="button" className="btn btnGhost btnSm" disabled={busy} onClick={() => act("rerun")}>Aplică regulile din nou</button>
        <button type="button" className="btn btnGhost btnSm" disabled={busy} onClick={() => act("ignore")}>Ignoră</button>
      </div>
      {admin && <p className="hint" style={{ margin: "0 0 8px" }}>Regulă nouă din acest email: selectează cu mouse-ul numărul comenzii, numele clientului sau o frază care apare în toate emailurile de acest fel.</p>}
      <pre ref={box} className="ibBody" onMouseUp={admin ? pick : undefined} onTouchEnd={admin ? pick : undefined}>{body || "(email fără text)"}</pre>
      {admin && sel && (
        <div className="ibPick" role="toolbar" aria-label="Folosește selecția">
          <span className="muted">„{sel.text.slice(0, 40)}{sel.text.length > 40 ? "…" : ""}” este:</span>
          <button type="button" className="chip" onClick={() => use("ref")}>Nr. comandă</button>
          <button type="button" className="chip" onClick={() => use("client")}>Numele clientului</button>
          <button type="button" className="chip" onClick={() => use("cond")}>Fraza care recunoaște emailul</button>
        </div>
      )}
      {admin && started && (
        <div className="ibDraft">
          <b>Regulă nouă</b>
          <ul>
            {draft.body_has && <li>Se aplică dacă textul conține: <b>{draft.body_has}</b></li>}
            {draft.ref_after && <li>Nr. comandă: codul de după „<b>{draft.ref_after}</b>”{draft.ref_shape ? <> (începe cu <b>{draft.ref_shape}</b>)</> : null}</li>}
            {draft.client_after && <li>Clientul: cuvintele de după „<b>{draft.client_after}</b>”</li>}
          </ul>
          {!draft.body_has && <p className="hint" style={{ margin: 0 }}>Alege și fraza care recunoaște emailul, altfel regula se aplică după expeditor.</p>}
          <a className="btn btnGold btnSm" href={`${base}/setari/emailuri/reguli?${q}`}>Continuă la regulă →</a>
        </div>
      )}
    </>
  );
}
