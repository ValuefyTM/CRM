"use client";
import { useState } from "react";

type Firm = { id: string; name: string; color: string | null; fallback: string; reports: number };

/** The colour of every issuing firm: the stripe of its reports in the list. Saved as soon as it is picked. */
export function IssuerColors({ firms, edit }: { firms: Firm[]; edit: boolean }) {
  const [colors, setColors] = useState<Record<string, string | null>>(Object.fromEntries(firms.map((f) => [f.id, f.color])));
  const [msg, setMsg] = useState<string | null>(null);
  const save = async (id: string, color: string | null) => {
    setColors((c) => ({ ...c, [id]: color }));
    const r = await fetch(`/api/crm/issuers/${encodeURIComponent(id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ color }) }).catch(() => null);
    const d = (await r?.json().catch(() => ({}))) as { error?: string } | undefined;
    setMsg(r?.ok ? null : d?.error ?? "Nu am putut salva culoarea.");
  };
  return (
    <div className="issuerColors">
      {firms.map((f) => {
        const cur = colors[f.id] ?? f.fallback;
        return (
          <label key={f.id} className="issuerRow">
            <i style={{ background: cur }} />
            <span className="who"><b>{f.name}</b><small>{f.reports} rapoarte{colors[f.id] ? "" : " · culoare implicită"}</small></span>
            <input type="color" value={cur} disabled={!edit} onChange={(e) => save(f.id, e.target.value)} aria-label={`Culoarea firmei ${f.name}`} />
            {edit && colors[f.id] && <button type="button" className="linkBtn" onClick={() => save(f.id, null)}>implicit</button>}
          </label>
        );
      })}
      {msg && <div className="error">{msg}</div>}
    </div>
  );
}
