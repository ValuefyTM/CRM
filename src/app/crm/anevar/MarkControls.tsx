"use client";
// One report's place in the ANEVAR report: in or out, and on which line / specialisation (the automatic one by default).
import { useRouter } from "next/navigation";
import { useState } from "react";
import { LINES, SPECS } from "@/lib/anevar-lines";

export function MarkControls({ report, excluded, line, spec, autoLine, autoSpec }: { report: string; excluded: boolean; line: number | null; spec: number | null; autoLine: number; autoSpec: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const save = async (body: Record<string, unknown>) => {
    setBusy(true); setErr("");
    const r = await fetch("/api/crm/anevar/marks", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ report, ...body }) }).catch(() => null);
    const d = (await r?.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!r?.ok) return setErr(d.error ?? "Nu s-a salvat.");
    router.refresh();
  };
  return (
    <div className="anvMark">
      <label className={`anvSwitch${excluded ? " off" : ""}`} title={excluded ? "Exclus din raportare — bifează ca să-l incluzi" : "Inclus în raportare — debifează ca să-l excluzi"}>
        <input type="checkbox" checked={!excluded} disabled={busy} onChange={(e) => save({ excluded: !e.target.checked })} /><span>{excluded ? "Exclus" : "Inclus"}</span>
      </label>
      <select className="anvSel" value={line ?? ""} disabled={busy || excluded} aria-label="Linia din Anexa 4" title="Tipul de lucrare (linia din Anexa 4)"
        onChange={(e) => save({ line: e.target.value ? Number(e.target.value) : null })}>
        <option value="">auto · linia {autoLine}</option>
        {LINES.map(([no, label]) => <option key={no} value={no}>{no} · {label}</option>)}
      </select>
      <select className="anvSel" value={spec ?? ""} disabled={busy || excluded} aria-label="Specializarea" title="Specializarea (rândul din Anexa 4)"
        onChange={(e) => save({ spec: e.target.value ? Number(e.target.value) : null })}>
        <option value="">auto · {SPECS.find(([n]) => n === autoSpec)?.[1]}</option>
        {SPECS.map(([no, code, label]) => <option key={no} value={no}>{code} · {label}</option>)}
      </select>
      {err && <small className="errTxt">{err}</small>}
    </div>
  );
}
