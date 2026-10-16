"use client";
import { useState } from "react";

export type ViewAsUser = { id: string; name: string; role: string };

async function switchTo(user: string | null) {
  const r = await fetch("/api/crm/impersonate", user ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user }) } : { method: "DELETE" });
  if (!r.ok) {
    alert(((await r.json().catch(() => null)) as { error?: string } | null)?.error ?? "Nu am putut schimba utilizatorul.");
    return;
  }
  location.reload();
}

/**
 * "Vezi ca…" for owners and administrators: pick a team member and the CRM shows exactly what they see (read-only).
 * While on, a banner says whose CRM it is, with the list to move to the next person and the way back.
 */
export function ViewAs(props: { users: ViewAsUser[] | null; as?: { id: string; name: string; role: string } | null; realName: string }) {
  const [busy, setBusy] = useState(false);
  const go = async (id: string | null) => {
    setBusy(true);
    await switchTo(id);
    setBusy(false);
  };
  const select = props.users && (
    <select className="viewAsSelect" aria-label="Vezi CRM-ul ca" value={props.as?.id ?? ""} disabled={busy} onChange={(e) => go(e.target.value || null)}>
      <option value="">{props.as ? `← ${props.realName} (contul meu)` : "Vezi ca…"}</option>
      {props.users?.map((u) => <option key={u.id} value={u.id}>{u.name} · {u.role}</option>)}
    </select>
  );
  if (!props.as) return select ? <div className="viewAs">{select}</div> : null;
  return (
    <div className="viewAsBar" role="status">
      <span>Vezi CRM-ul ca <b>{props.as.name}</b> · {props.as.role} — doar citire</span>
      {select}
      <button type="button" className="btn btnSm" disabled={busy} onClick={() => go(null)}>Revino la contul meu</button>
    </div>
  );
}
