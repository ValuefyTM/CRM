"use client";

import { useState } from "react";

export function StatusToggle({ partnerId, status, canChange }: { partnerId: string; status: string; canChange: boolean }) {
  const [s, setS] = useState(status);
  const [busy, setBusy] = useState(false);
  if (!canChange) return null;
  const next = s === "active" ? "suspended" : "active";
  return (
    <button
      type="button"
      className={`btn btnSm ${s === "active" ? "btnDanger" : "btnGhost"}`}
      disabled={busy}
      onClick={async () => {
        if (next === "suspended" && !confirm("Suspenzi firma? Toate persoanele ei vor fi deconectate și nu se mai pot autentifica.")) return;
        setBusy(true);
        const r = await fetch(`/api/crm/partners/${partnerId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: next }) });
        setBusy(false);
        if (r.ok) { setS(next); location.reload(); }
      }}
    >
      {s === "active" ? "Suspendă firma" : "Reactivează firma"}
    </button>
  );
}
