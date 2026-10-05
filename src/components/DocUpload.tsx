"use client";

import { useRef, useState } from "react";
import { ACCEPT, MAX_FILE_MB } from "@/lib/order-labels";

/** Upload button for one document of an existing order; reloads the page when done. */
export function DocUpload({ orderId, kind, label = "↑ Încarcă" }: { orderId: string; kind: string; label?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const upload = async (list: FileList | null) => {
    const files = [...(list ?? [])];
    if (!files.length) return;
    const big = files.find((f) => f.size > MAX_FILE_MB * 1024 * 1024);
    if (big) return setError(`Peste ${MAX_FILE_MB} MB`);
    setBusy(true); setError("");
    for (const file of files) {
      const fd = new FormData();
      fd.set("kind", kind); fd.set("file", file);
      const r = await fetch(`/api/portal/orders/${orderId}/documents`, { method: "POST", body: fd }).catch(() => null);
      if (!r?.ok) {
        const d = (await r?.json().catch(() => ({}))) as { error?: string } | undefined;
        setBusy(false);
        return setError(d?.error || "Nu s-a putut încărca.");
      }
    }
    location.reload();
  };
  return (
    <span className="actions" style={{ gap: 6 }}>
      {error && <span className="error" style={{ fontSize: 12 }}>{error}</span>}
      <button type="button" className="btn btnGhost btnSm" disabled={busy} onClick={() => ref.current?.click()}>{busy ? "Se încarcă…" : label}</button>
      <input ref={ref} type="file" hidden accept={ACCEPT} multiple={kind === "other"} onChange={(e) => { upload(e.target.files); e.target.value = ""; }} />
    </span>
  );
}
