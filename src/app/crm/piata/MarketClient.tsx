"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ASSET_CATEGORIES } from "@/lib/asset-labels";
import { SUGGEST_KINDS, SUGGEST_SOURCES, suggestSearch } from "@/lib/market/suggest";

type Search = { id: string; name: string; source: string; url: string; category: string | null; type: string | null; transaction: string; enabled: number; max_pages: number; every_days?: number; max_details?: number };

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

const EMPTY = { name: "", source: "imobiliare.ro", url: "", category: "", type: "", transaction: "vanzare", enabled: true, max_pages: "20", every_days: "1", max_details: "0" };
const EVERY: [string, string][] = [["1", "la fiecare rulare programată"], ["2", "la 2 zile"], ["3", "la 3 zile"], ["7", "săptămânal"], ["14", "la 2 săptămâni"], ["30", "lunar"], ["0", "doar la cerere"]];

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
    const r = await fetch("/api/crm/market/searches", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, max_pages: Number(form.max_pages), every_days: Number(form.every_days), max_details: Number(form.max_details) }) }).catch(() => null);
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
  // „Propune adresa”: the results page built from kind, transaction and place
  const [sg, setSg] = useState({ kind: "apartamente", county: "Timiș", city: "Timișoara" });
  const propose = () => {
    if (!form) return;
    const p = suggestSearch(form.source, sg.kind, form.transaction === "inchiriere" ? "inchiriere" : "vanzare", sg.county, sg.city);
    if (!p) { setError("Completează județul."); return; }
    setError("");
    setForm({ ...form, url: p.url, name: form.name || p.name, category: p.category, type: p.type });
  };
  return (
    <>
      <ul className="mkSearches">
        {rows.map((s) => (
          <li key={s.id} className={s.enabled ? "" : "muted"}>
            <div><b>{s.name}</b> <span className="pill">{s.source}</span> {!s.enabled && <span className="pill">oprită</span>}</div>
            <small className="muted">
              {[categories.find(([k]) => k === s.category)?.[1] ?? s.category, s.type ? s.type.charAt(0) + s.type.slice(1).toLowerCase() : null, s.transaction === "inchiriere" ? "închiriere" : "vânzare", `${s.active} active`, EVERY.find(([k]) => k === String(s.every_days ?? 1))?.[1], s.max_details ? `max. ${s.max_details} anunțuri / rulare` : null,
                s.last_run_at ? `ultima rulare: ${s.last_count ?? 0} anunțuri${s.last_complete === 1 ? ", toate paginile" : s.last_complete === 0 ? ", incompletă" : ""}` : "nerulată"].filter(Boolean).join(" · ")}
            </small>
            {s.last_error && <small style={{ color: "var(--err)", display: "block" }}>{s.last_error}</small>}
            <span className="tdActs">
              <a className="btn btnGhost btnSm" href={s.url} target="_blank" rel="noreferrer">Pagina ↗</a>
              {edit && <>
                <button type="button" className="btn btnGhost btnSm" onClick={() => setForm({ ...EMPTY, ...s, category: s.category ?? "", type: s.type ?? "", enabled: !!s.enabled, max_pages: String(s.max_pages), every_days: String(s.every_days ?? 1), max_details: String(s.max_details ?? 0) })}>Modifică</button>
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
          <label className="field">Tranzacția
            <select className="input" value={form.transaction} onChange={(e) => set("transaction", e.target.value)}><option value="vanzare">Vânzare</option><option value="inchiriere">Închiriere</option></select>
          </label>
          {SUGGEST_SOURCES.includes(form.source) && (
            <fieldset className="mkSuggest">
              <legend>Propune adresa paginii</legend>
              <select className="input" aria-label="Tip" value={sg.kind} onChange={(e) => setSg({ ...sg, kind: e.target.value })}>{SUGGEST_KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}</select>
              <input className="input" aria-label="Județ" placeholder="Județ" value={sg.county} onChange={(e) => setSg({ ...sg, county: e.target.value })} />
              <input className="input" aria-label="Localitate" placeholder="Localitate (gol = tot județul)" value={sg.city} onChange={(e) => setSg({ ...sg, city: e.target.value })} />
              <button type="button" className="btn btnGhost btnSm" onClick={propose}>Propune</button>
              <small className="muted">Adresa e construită după forma căilor de pe {form.source}. Deschide-o cu „Verifică pagina” înainte de a salva.</small>
            </fieldset>
          )}
          <label className="field">Pagina de rezultate <small>(copiată din browser, cu filtrele dorite: zonă, tip, preț)</small><input className="input" value={form.url} onChange={(e) => set("url", e.target.value)} placeholder="https://www.imobiliare.ro/vanzare-apartamente/timisoara" required />
            {/^https?:\/\//.test(form.url) && <a className="link" href={form.url} target="_blank" rel="noreferrer">Verifică pagina ↗</a>}</label>
          <label className="field">Categoria (din CRM) <small>(după ea se caută comparabilele unei proprietăți)</small>
            <select className="input" value={form.category} onChange={(e) => set("category", e.target.value)}><option value="">—</option>{categories.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          </label>
          <label className="field">Tipul proprietății (din CRM) <small>(opțional; filtrul „Tip proprietate” din Analize de piață)</small>
            <select className="input" value={form.type} onChange={(e) => set("type", e.target.value)}>
              <option value="">— oricare —</option>
              {(ASSET_CATEGORIES.find(([k]) => k === form.category)?.[2] ?? ASSET_CATEGORIES.flatMap(([, , t]) => t)).map((t) => <option key={t} value={t}>{t.charAt(0) + t.slice(1).toLowerCase()}</option>)}
            </select>
          </label>
          <label className="field">Maximum pagini <small>(cel mult 300; dacă se atinge limita, căutarea rămâne „incompletă”)</small><input className="input" type="number" min={1} max={300} value={form.max_pages} onChange={(e) => set("max_pages", e.target.value)} /></label>
          <label className="field">Cât de des <small>(în rulările programate)</small>
            <select className="input" value={form.every_days} onChange={(e) => set("every_days", e.target.value)}>{EVERY.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          </label>
          <label className="field">Maximum anunțuri descărcate pe rulare <small>(0 = fără limită; restul se descarcă la rulările următoare)</small>
            <input className="input" type="number" min={0} max={5000} value={form.max_details} onChange={(e) => set("max_details", e.target.value)} /></label>
          <label className="check"><input type="checkbox" checked={form.enabled} onChange={(e) => set("enabled", e.target.checked)} /> Activă</label>
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
