"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

/** „Pornește pilotul” (a batch of N reports) and „Verifică rezultatele” (brings in what the batches finished). */
export function MdControls({ waiting, enabled }: { waiting: number; enabled: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [n, setN] = useState(10);
  const go = async (action: "pilot" | "sync") => {
    setBusy(action); setMsg(null);
    const r = await fetch("/api/crm/settings/markdown", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, limit: n }) }).catch(() => null);
    const d = (await r?.json().catch(() => ({}))) as { error?: string; sent?: number; skipped?: string[]; waiting?: number; done?: number };
    setBusy("");
    if (!r?.ok) return setMsg({ ok: false, t: d.error ?? "Nu a mers." });
    setMsg({ ok: true, t: action === "pilot" ? `${d.sent} rapoarte trimise la citire${d.skipped?.length ? ` (sărite, prea mari: ${d.skipped.join(", ")})` : ""}. Rezultatele vin în câteva minute până la o oră: apasă „Verifică rezultatele”.`
      : d.done ? `${d.done} rezultate aduse${d.waiting ? `; ${d.waiting} încă în lucru` : ""}.` : d.waiting ? `Încă în lucru (${d.waiting}). Mai verifică peste câteva minute.` : "Nimic nou." });
    router.refresh();
  };
  return (
    <div className="mdCtl">
      <label className="mdN">Rapoarte <input className="input" type="number" min={1} max={50} value={n} onChange={(e) => setN(Number(e.target.value))} /></label>
      <button type="button" className="btn btnGold" disabled={!enabled || !!busy} onClick={() => go("pilot")}>{busy === "pilot" ? "Se trimit…" : `Pornește citirea pe ${n} rapoarte`}</button>
      <button type="button" className="btn btnGhost" disabled={!enabled || !!busy} onClick={() => go("sync")}>{busy === "sync" ? "Se verifică…" : `Verifică rezultatele${waiting ? ` (${waiting} în lucru)` : ""}`}</button>
      {msg && <p className={msg.ok ? "okMsg" : "error"} role={msg.ok ? "status" : "alert"}>{msg.t}</p>}
    </div>
  );
}
