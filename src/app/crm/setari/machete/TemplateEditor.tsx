"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Src, Template, TField } from "@/lib/report-templates";

const KIND: Record<TField["kind"], string> = { ai: "Text AI", facts: "Câmpuri scurte", market: "Parametri piață", legal: "Din analiza juridică" };

/** Editor of a report template: chapters (order, titles), their fields (AI instructions, sources, limits) and style examples. */
export function TemplateEditor({ initial, sources, changed, canEdit }: { initial: Template; sources: [Src, string][]; changed: string | null; canEdit: boolean }) {
  const router = useRouter();
  const [t, setT] = useState<Template>(initial);
  const [open, setOpen] = useState(initial.chapters.find((c) => c.key === "piata")?.key ?? initial.chapters[0]?.key ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [dirty, setDirty] = useState(false);
  const ch = t.chapters.find((c) => c.key === open) ?? t.chapters[0];

  const update = (fn: (x: Template) => Template) => { setT(fn(structuredClone(t))); setDirty(true); setMsg(""); };
  const setField = (key: string, patch: Partial<TField>) => update((x) => ({ ...x, chapters: x.chapters.map((c) => ({ ...c, fields: c.fields.map((f) => (f.key === key ? { ...f, ...patch } : f)) })) }));
  const move = <T,>(list: T[], i: number, d: number) => { const j = i + d; if (j < 0 || j >= list.length) return list; const l = [...list]; [l[i], l[j]] = [l[j], l[i]]; return l; };
  const setExamples = (key: string, list: string[]) => update((x) => ({ ...x, examples: { ...x.examples, [key]: list } }));

  const save = async () => {
    setBusy(true);
    const res = await fetch("/api/crm/report-templates", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: t.key, template: t }) }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return setMsg(((await res?.json().catch(() => ({}))) as { error?: string })?.error ?? "Nu s-a putut salva.");
    setDirty(false); setMsg("Macheta a fost salvată."); router.refresh();
  };
  const reset = async () => {
    if (!confirm("Readuci macheta la varianta inițială? Se pierd instrucțiunile și exemplele modificate.")) return;
    setBusy(true);
    await fetch(`/api/crm/report-templates?key=${encodeURIComponent(t.key)}`, { method: "DELETE" }).catch(() => null);
    setBusy(false);
    location.reload();
  };

  return (
    <div className="mtEdit">
      <section className="card">
        <div className="cardHead">
          <h2>{t.name} — capitole</h2>
          {canEdit && <span className="actions">
            {changed && <button type="button" className="btn btnGhost btnSm" disabled={busy} onClick={reset}>Varianta inițială</button>}
            <button type="button" className="btn btnGold btnSm" disabled={busy || !dirty} onClick={save}>{busy ? "Se salvează…" : "Salvează macheta"}</button>
          </span>}
        </div>
        <div className="mtChaps" role="tablist">
          {t.chapters.map((c, i) => (
            <span key={c.key} className="mtChap" aria-selected={c.key === ch?.key}>
              <button type="button" role="tab" aria-selected={c.key === ch?.key} onClick={() => setOpen(c.key)}>{c.title} <small className="mono">{c.fields.length}</small></button>
              {canEdit && c.key === ch?.key && <>
                <button type="button" className="mtMove" aria-label="Mută la stânga" onClick={() => update((x) => ({ ...x, chapters: move(x.chapters, i, -1) }))}>‹</button>
                <button type="button" className="mtMove" aria-label="Mută la dreapta" onClick={() => update((x) => ({ ...x, chapters: move(x.chapters, i, 1) }))}>›</button>
              </>}
            </span>
          ))}
        </div>
        {ch && canEdit && <label className="mtLine"><small>Titlul capitolului (în cuprins)</small><input value={ch.title} onChange={(e) => update((x) => ({ ...x, chapters: x.chapters.map((c) => (c.key === ch.key ? { ...c, title: e.target.value } : c)) }))} /></label>}
        {msg && <p className="hint" role="status">{msg}</p>}
      </section>

      {ch?.fields.map((f, i) => (
        <section key={f.key} className="card mtField">
          <div className="cardHead">
            <h2>{f.label} <span className="muted">{KIND[f.kind]}</span></h2>
            {canEdit && <span className="actions">
              <button type="button" className="btn btnGhost btnSm" aria-label="Mută mai sus" disabled={i === 0} onClick={() => update((x) => ({ ...x, chapters: x.chapters.map((c) => (c.key === ch.key ? { ...c, fields: move(c.fields, i, -1) } : c)) }))}>↑</button>
              <button type="button" className="btn btnGhost btnSm" aria-label="Mută mai jos" disabled={i === ch.fields.length - 1} onClick={() => update((x) => ({ ...x, chapters: x.chapters.map((c) => (c.key === ch.key ? { ...c, fields: move(c.fields, i, 1) } : c)) }))}>↓</button>
            </span>}
          </div>
          <div className="mtGrid">
            <label className="mtLine"><small>Numele în cuprins</small><input value={f.label} disabled={!canEdit} onChange={(e) => setField(f.key, { label: e.target.value })} /></label>
            <label className="mtLine"><small>Câmpul din aplicația băncii</small><input value={f.brd ?? ""} disabled={!canEdit} onChange={(e) => setField(f.key, { brd: e.target.value })} /></label>
            {f.kind === "ai" && <label className="mtLine mtNum"><small>Limită caractere</small><input type="number" min={0} step={100} value={f.limit} disabled={!canEdit} onChange={(e) => setField(f.key, { limit: Number(e.target.value) || 0 })} /></label>}
            <label className="mtCheck"><input type="checkbox" checked={f.required} disabled={!canEdit} onChange={(e) => setField(f.key, { required: e.target.checked })} /> Obligatoriu (intră în progres)</label>
          </div>
          {(f.kind === "ai" || f.kind === "market") && (
            <>
              <label className="mtLine"><small>Instrucțiuni pentru AI</small><textarea rows={3} value={f.prompt} disabled={!canEdit} onChange={(e) => setField(f.key, { prompt: e.target.value })} /></label>
              <div className="mtSrc"><small>Sursa datelor</small>
                <span>{sources.map(([k, l]) => (
                  <label key={k} className={`mtTag${f.sources.includes(k) ? " on" : ""}`}><input type="checkbox" checked={f.sources.includes(k)} disabled={!canEdit}
                    onChange={(e) => setField(f.key, { sources: e.target.checked ? [...f.sources, k] : f.sources.filter((s) => s !== k) })} />{l}</label>
                ))}</span>
              </div>
            </>
          )}
          {f.kind === "facts" && <p className="hint">Valori: {(f.facts ?? []).map((x) => x.label).join(", ")}. Se iau din bun, din raport și din răspunsurile fișei de inspecție.</p>}
          {f.kind === "legal" && <p className="hint">{f.legal === "opis" ? "Opisul actelor, ordonat, din analiza juridică." : "Descrierea dreptului de proprietate, din analiza juridică."}</p>}
          {f.kind === "ai" && (
            <div className="mtEx">
              <small>Exemple de stil <span className="muted">· AI-ul imită tonul, nu copiază conținutul; din raport, „Salvează ca exemplu” adaugă un text aici</span></small>
              {(t.examples[f.key] ?? []).map((e, j) => (
                <div key={j} className="mtExItem">
                  <textarea rows={3} value={e} disabled={!canEdit} onChange={(ev) => setExamples(f.key, (t.examples[f.key] ?? []).map((y, k) => (k === j ? ev.target.value : y)))} />
                  {canEdit && <button type="button" className="drLink" onClick={() => setExamples(f.key, (t.examples[f.key] ?? []).filter((_, k) => k !== j))}>Scoate</button>}
                </div>
              ))}
              {canEdit && (t.examples[f.key] ?? []).length < 6 && <button type="button" className="drLink" onClick={() => setExamples(f.key, [...(t.examples[f.key] ?? []), ""])}>+ Exemplu</button>}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
