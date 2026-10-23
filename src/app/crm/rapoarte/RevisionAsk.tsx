"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * "Solicită completări" on an inspection card: a small field for what the inspector should complete; saving sends
 * the sheet back to the inspector's phone (with a notification) to be changed and sent again.
 */
export function RevisionAsk({ report, inspection, inspector }: { report: string; inspection: string; inspector: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const save = async () => {
    if (note.trim().length < 3) return setMsg("Scrie ce trebuie completat.");
    setBusy(true); setMsg("");
    const r = await fetch(`/api/crm/reports/${encodeURIComponent(report)}/inspections`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ revision: note, inspection }),
    }).catch(() => null);
    const d = (await r?.json().catch(() => ({}))) as { error?: string } | undefined;
    setBusy(false);
    if (!r?.ok) return setMsg(d?.error || "Cererea nu a putut fi trimisă.");
    setOpen(false); setNote("");
    router.refresh();
  };

  if (!open) return <button type="button" className="btn ghost bvRevBtn" onClick={() => setOpen(true)}>Solicită completări</button>;
  return (
    <div className="bvRevAsk">
      <label>
        <span>Ce trebuie să completeze {inspector ?? "inspectorul"}?</span>
        <textarea rows={3} autoFocus value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)}
          placeholder="ex.: lipsesc fotografiile la baie și bucătărie; verifică suprafața dormitorului 2" />
      </label>
      {msg && <small className="err">{msg}</small>}
      <div className="bvRevRow">
        <button type="button" className="btn ghost" onClick={() => { setOpen(false); setMsg(""); }} disabled={busy}>Renunță</button>
        <button type="button" className="btn" onClick={save} disabled={busy}>{busy ? "Se trimite…" : "Salvează și trimite"}</button>
      </div>
      <small className="muted">Fișa revine pe telefonul inspectorului, cu mesajul tău și o notificare.</small>
    </div>
  );
}
