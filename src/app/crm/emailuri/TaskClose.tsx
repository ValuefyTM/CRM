"use client";
// Closes a task from an email: "Rezolvat" (a plain task), or "Închide fără comandă" (a bank request not taken, a
// duplicate…) with a reason.
import { useState } from "react";

export function TaskClose({ task, done = false, base }: { task: string; done?: boolean; base: string }) {
  const [busy, setBusy] = useState(false);
  const close = async () => {
    const note = done ? (prompt("Ce s-a făcut? (opțional)") ?? null) : prompt("De ce se închide fără comandă? (ex. dublură, cerere refuzată)");
    if (note === null) return;
    if (!done && !note.trim()) return alert("Scrie motivul.");
    setBusy(true);
    const r = await fetch(`/api/crm/mail-tasks/${encodeURIComponent(task)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: done ? "done" : "dismiss", note }) }).catch(() => null);
    setBusy(false);
    if (!r?.ok) return alert(((await r?.json().catch(() => ({}))) as { error?: string })?.error ?? "Nu s-a putut închide.");
    location.href = base || "/";
  };
  return <button type="button" className={done ? "btn btnGold btnSm" : "btn btnGhost btnSm"} disabled={busy} onClick={close}>{busy ? "…" : done ? "Marchează rezolvat" : "Închide fără comandă"}</button>;
}
