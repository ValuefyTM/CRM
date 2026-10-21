"use client";
// Export of a statement to Excel: the columns are chosen (line, report, asset, team) and kept for the next export.
import { useState } from "react";
import { createPortal } from "react-dom";
import { DEFAULT_EXPORT, EXPORT_FIELDS } from "@/lib/statement-labels";

const GROUPS = ["Linie", "Raport", "Bun", "Echipă"] as const;

export function ExportXlsx({ id, evaluator }: { id: string; evaluator?: string | null }) {
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const show = async () => {
    setOpen(true); setMsg("");
    if (sel) return;
    const d = (await fetch(`/api/crm/statements/${id}/export`).then((r) => r.json()).catch(() => ({}))) as { fields?: string[] };
    setSel(d.fields?.length ? d.fields : DEFAULT_EXPORT);
  };
  const toggle = (k: string) => setSel((s) => (s ? (s.includes(k) ? s.filter((x) => x !== k) : [...s, k]) : s));
  const group = (g: string, on: boolean) => setSel((s) => { const keys = EXPORT_FIELDS.filter((f) => f.group === g).map((f) => f.key); const base = (s ?? []).filter((k) => !keys.includes(k)); return on ? [...base, ...keys] : base; });
  const run = async () => {
    if (!sel?.length) return setMsg("Alege cel puțin o coloană.");
    setBusy(true); setMsg("");
    const r = await fetch(`/api/crm/statements/${id}/export`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fields: sel, evaluator }) }).catch(() => null);
    setBusy(false);
    if (!r?.ok) { const d = (await r?.json().catch(() => ({}))) as { error?: string }; return setMsg(d.error ?? "Exportul nu a reușit."); }
    const blob = await r.blob();
    const cd = r.headers.get("Content-Disposition") ?? "";
    const m = cd.match(/filename\*=UTF-8''([^;]+)/);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = m ? decodeURIComponent(m[1]) : "borderou.xlsx";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    setOpen(false);
  };
  return (
    <>
      <button type="button" className="btn btnGhost btnSm" onClick={show}>Export Excel</button>
      {open && createPortal(
        <div className="vfModal sheet" role="dialog" aria-modal="true" aria-labelledby="exT" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="vfModalBox exBox">
            <div className="cardHead"><h2 id="exT">Export Excel</h2><button type="button" className="btn btnGhost btnSm" onClick={() => setOpen(false)} aria-label="Închide">×</button></div>
            {!sel ? <p className="hint">Se încarcă…</p> : (
              <>
                <p className="hint" style={{ margin: 0 }}>Bifează coloanele. Alegerea rămâne salvată pentru exportul următor.</p>
                <div className="exGroups">
                  {GROUPS.map((g) => {
                    const fs = EXPORT_FIELDS.filter((f) => f.group === g);
                    const all = fs.every((f) => sel.includes(f.key));
                    return (
                      <fieldset key={g} className="exGroup">
                        <legend><label className="check"><input type="checkbox" checked={all} onChange={(e) => group(g, e.target.checked)} /><b>{g}</b></label></legend>
                        {fs.map((f) => <label key={f.key} className="check"><input type="checkbox" checked={sel.includes(f.key)} onChange={() => toggle(f.key)} /><span>{f.label}</span></label>)}
                      </fieldset>
                    );
                  })}
                </div>
                <div className="actions">
                  <button type="button" className="btn btnNavy" disabled={busy || !sel.length} onClick={run}>{busy ? "Se generează…" : `Descarcă .xlsx (${sel.length} coloane)`}</button>
                  <button type="button" className="linkBtn" onClick={() => setSel(DEFAULT_EXPORT)}>coloanele implicite</button>
                  <button type="button" className="btn btnGhost" onClick={() => setOpen(false)}>Renunță</button>
                </div>
                {msg && <div role="alert" className="error">{msg}</div>}
              </>
            )}
          </div>
        </div>, document.body)}
    </>
  );
}
