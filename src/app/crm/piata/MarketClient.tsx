"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Search = { id: string; name: string; source: string; url: string; category: string | null; type: string | null; transaction: string; enabled: number; max_pages: number };

/** „Rulează acum”: a run of every enabled search (the cron continues it every 5 minutes). */
export function RunNow() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run = async () => {
    setBusy(true); setMsg(null);
    const r = await fetch("/api/crm/market", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }).catch(() => null);
    const d = (await r?.json().catch(() => ({}))) as { searches?: number; error?: string };
    setBusy(false);
    setMsg(r?.ok ? { ok: true, text: `Rularea a pornit pentru ${d.searches ?? 0} căutări. Continuă singură, la fiecare 5 minute; reîncarcă pagina ca să vezi progresul.` } : { ok: false, text: d?.error ?? "Nu am putut porni rularea." });
    router.refresh();
  };
  return (
    <>
      <button type="button" className="btn btnGold btnSm" onClick={run} disabled={busy}>{busy ? "Se pornește…" : "Rulează acum"}</button>
      {msg && <div role="status" className={msg.ok ? "okMsg" : "error"}>{msg.text}</div>}
    </>
  );
}

const EMPTY = { name: "", source: "imobiliare.ro", url: "", category: "", type: "", transaction: "vanzare", enabled: true, max_pages: "20" };

/** The searches: list, add, edit, enable / disable, delete. */
export function Searches({ rows, sources, categories, edit }: { rows: (Search & { active: number; last_run_at: string | null; last_complete: number | null; last_count: number | null; last_error: string | null })[];
  sources: string[]; categories: [string, string][]; edit: boolean }) {
  const router = useRouter();
  const [form, setForm] = useState<(typeof EMPTY & { id?: string }) | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const save = async () => {
    if (!form) return;
    setBusy(true); setError("");
    const r = await fetch("/api/crm/market/searches", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, max_pages: Number(form.max_pages) }) }).catch(() => null);
    const d = (await r?.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!r?.ok) { setError(d?.error ?? "Nu am putut salva."); return; }
    setForm(null); router.refresh();
  };
  const toggle = async (s: Search) => {
    await fetch("/api/crm/market/searches", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...s, enabled: !s.enabled }) }).catch(() => null);
    router.refresh();
  };
  const remove = async (s: Search) => {
    if (!confirm(`Ștergi căutarea „${s.name}” (${s.source})? Anunțurile găsite rămân.`)) return;
    await fetch(`/api/crm/market/searches?id=${encodeURIComponent(s.id)}`, { method: "DELETE" }).catch(() => null);
    router.refresh();
  };
  const set = (k: string, v: string | boolean) => setForm((f) => (f ? { ...f, [k]: v } : f));
  return (
    <>
      <ul className="mkSearches">
        {rows.map((s) => (
          <li key={s.id} className={s.enabled ? "" : "muted"}>
            <div><b>{s.name}</b> <span className="pill">{s.source}</span> {!s.enabled && <span className="pill">oprită</span>}</div>
            <small className="muted">
              {[categories.find(([k]) => k === s.category)?.[1] ?? s.category, s.transaction === "inchiriere" ? "închiriere" : "vânzare", `${s.active} active`,
                s.last_run_at ? `ultima rulare: ${s.last_count ?? 0} anunțuri${s.last_complete === 1 ? ", toate paginile" : s.last_complete === 0 ? ", incompletă" : ""}` : "nerulată"].filter(Boolean).join(" · ")}
            </small>
            {s.last_error && <small style={{ color: "var(--err)", display: "block" }}>{s.last_error}</small>}
            <span className="tdActs">
              <a className="btn btnGhost btnSm" href={s.url} target="_blank" rel="noreferrer">Pagina ↗</a>
              {edit && <>
                <button type="button" className="btn btnGhost btnSm" onClick={() => setForm({ ...EMPTY, ...s, category: s.category ?? "", type: s.type ?? "", enabled: !!s.enabled, max_pages: String(s.max_pages) })}>Modifică</button>
                <button type="button" className="btn btnGhost btnSm" onClick={() => toggle(s)}>{s.enabled ? "Oprește" : "Pornește"}</button>
                <button type="button" className="btn btnGhost btnSm" onClick={() => remove(s)}>Șterge</button>
              </>}
            </span>
          </li>
        ))}
      </ul>
      {edit && !form && <button type="button" className="btn btnNavy btnSm" onClick={() => setForm({ ...EMPTY })}>+ Căutare nouă</button>}
      {form && (
        <form className="mkForm" onSubmit={(e) => { e.preventDefault(); save(); }}>
          <label className="field">Nume<input className="input" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="ex. Apartamente 2 camere, Timișoara" required /></label>
          <label className="field">Site
            <select className="input" value={form.source} onChange={(e) => set("source", e.target.value)}>{sources.map((x) => <option key={x}>{x}</option>)}</select>
          </label>
          <label className="field">Pagina de rezultate <small>(copiată din browser, cu filtrele dorite: zonă, tip, preț)</small><input className="input" value={form.url} onChange={(e) => set("url", e.target.value)} placeholder="https://www.imobiliare.ro/vanzare-apartamente/timisoara" required /></label>
          <label className="field">Categoria (din CRM) <small>(după ea se caută comparabilele unei proprietăți)</small>
            <select className="input" value={form.category} onChange={(e) => set("category", e.target.value)}><option value="">—</option>{categories.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          </label>
          <label className="field">Tranzacția
            <select className="input" value={form.transaction} onChange={(e) => set("transaction", e.target.value)}><option value="vanzare">Vânzare</option><option value="inchiriere">Închiriere</option></select>
          </label>
          <label className="field">Maximum pagini<input className="input" type="number" min={1} max={50} value={form.max_pages} onChange={(e) => set("max_pages", e.target.value)} /></label>
          <label className="check"><input type="checkbox" checked={form.enabled} onChange={(e) => set("enabled", e.target.checked)} /> Activă (rulează în fiecare noapte)</label>
          {error && <div className="error" role="alert">{error}</div>}
          <span className="actions">
            <button type="submit" className="btn btnGold btnSm" disabled={busy}>{busy ? "Se salvează…" : "Salvează"}</button>
            <button type="button" className="btn btnGhost btnSm" onClick={() => setForm(null)}>Renunță</button>
          </span>
        </form>
      )}
    </>
  );
}
