"use client";
// The collaborator's tick on an adjustment of their statement: "Accept ajustarea".
import { useState } from "react";

export function AcceptAdjust({ statement, line, accepted, locked }: { statement: string; line: string; accepted: boolean; locked?: boolean }) {
  const [on, setOn] = useState(accepted);
  const [busy, setBusy] = useState(false);
  const toggle = async (v: boolean) => {
    setBusy(true);
    const r = await fetch(`/api/crm/statements/${statement}/lines`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ line, accept: v }) }).catch(() => null);
    setBusy(false);
    if (r?.ok) setOn(v); else alert(((await r?.json().catch(() => null)) as { error?: string } | null)?.error ?? "Nu s-a salvat.");
  };
  return (
    <label className={`check stAccept${on ? " on" : ""}`}>
      <input type="checkbox" checked={on} disabled={busy || (locked && on)} onChange={(e) => toggle(e.target.checked)} />
      <span>{on ? "Ai acceptat ajustarea" : "Accept ajustarea"}</span>
    </label>
  );
}
