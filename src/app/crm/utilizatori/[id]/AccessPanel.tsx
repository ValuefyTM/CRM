"use client";

import { useState } from "react";
import { STATUS_LABEL } from "@/lib/labels";

/** Account access: status, (re)send the invitation, disable / re-enable. */
export function AccessPanel(props: {
  userId: string; kind: string; email: string; status: string; invitedAt: string; activatedAt: string; lastLogin: string;
  canInvite: boolean; canDisable: boolean;
}) {
  const [status, setStatus] = useState(props.status);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState("");
  const internal = props.kind === "internal";
  const [label, cls] = STATUS_LABEL[status] ?? [status, ""];

  const act = async (action: string) => {
    if (action === "disable" && !confirm(`Dezactivezi contul ${props.email}? Persoana va fi deconectată și nu se mai poate autentifica.`)) return;
    setBusy(action); setMsg(null);
    const r = await fetch(`/api/crm/users/${props.userId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
    const d = (await r.json().catch(() => ({}))) as { error?: string; sent?: boolean; status?: string };
    setBusy("");
    if (!r.ok) return setMsg({ ok: false, text: d.error || "Acțiunea nu a reușit." });
    if (d.status) setStatus(d.status);
    if (action === "invite") setMsg({ ok: !!d.sent, text: d.sent ? `Emailul a fost trimis către ${props.email}.` : "Emailul nu a putut fi trimis. Verifică setările de email (RESEND_API_KEY, CRM_EMAIL_FROM)." });
  };

  const showInvite = props.canInvite && status !== "disabled" && (internal || status === "invited");
  return (
    <section className="card">
      <div className="cardHead">
        <h2>Acces</h2>
        <span className={`pill ${cls}`}><i />{label}</span>
      </div>
      <dl className="dl">
        <div><dt>Aplicație</dt><dd>{internal ? "CRM" : props.kind === "partner" ? "Portal colaboratori" : "Portal client"}</dd></div>
        <div><dt>Invitat</dt><dd>{props.invitedAt}</dd></div>
        <div><dt>Activat</dt><dd>{props.activatedAt}</dd></div>
        <div><dt>Ultima autentificare</dt><dd>{props.lastLogin}</dd></div>
      </dl>
      {status === "invited" && (
        <p className="hint">{internal ? "Contul devine activ la prima autentificare în CRM." : "Persoana trebuie să deschidă linkul din email și să-și activeze contul (valabil 7 zile)."}</p>
      )}
      {(showInvite || props.canDisable) && (
        <div className="actions">
          {showInvite && (
            <button type="button" className="btn btnGhost btnSm" disabled={!!busy} onClick={() => act("invite")}>
              {busy === "invite" ? "Se trimite…" : internal ? "Trimite emailul de acces" : "Retrimite invitația"}
            </button>
          )}
          {props.canDisable && (status !== "disabled"
            ? <button type="button" className="btn btnDanger btnSm" disabled={!!busy} onClick={() => act("disable")}>Dezactivează contul</button>
            : <button type="button" className="btn btnGhost btnSm" disabled={!!busy} onClick={() => act("enable")}>Reactivează contul</button>)}
        </div>
      )}
      {msg && <div role={msg.ok ? "status" : "alert"} className={msg.ok ? "okMsg" : "error"}>{msg.text}</div>}
    </section>
  );
}
