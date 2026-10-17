"use client";
// The documents of one asset, dropped under its map: each file gets a kind (act de proprietate, extras CF, releveu,
// certificat energetic, plan de amplasament, alte acte), guessed from its name and changeable. On a new work the files
// wait in the form and are uploaded once the report exists; on a report they are uploaded right away.
import { useEffect, useRef, useState } from "react";
import { DOC_KINDS, guessDocKind } from "@/lib/doc-kinds";

export type DraftDoc = { file: File; kind: string };
export type AssetDocsProps = { mode: "draft"; files: DraftDoc[]; onChange: (f: DraftDoc[]) => void } | { mode: "report"; report: string; asset: string };
type Saved = { id: string; filename: string; size_bytes: number | null; doc_type: string | null };

const OK = /\.(pdf|jpe?g|png|heic|heif|webp|docx?|xlsx?|zip)$/i;
const size = (n: number | null | undefined) => (n == null ? "" : n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const ext = (name: string) => (name.match(/\.(\w{2,4})$/)?.[1] ?? "doc").toUpperCase();

export function AssetDocs(p: AssetDocsProps) {
  const [over, setOver] = useState(false);
  const [saved, setSaved] = useState<Saved[]>([]);
  const [busy, setBusy] = useState(0);
  const [msg, setMsg] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const report = p.mode === "report" ? p : null;

  useEffect(() => {
    if (!report) return;
    fetch(`/api/crm/reports/${report.report}/documents?asset=${encodeURIComponent(report.asset)}`).then((r) => r.json() as Promise<{ docs?: Saved[] }>)
      .then((d) => setSaved(d.docs ?? [])).catch(() => {});
  }, [report?.report, report?.asset]); // eslint-disable-line react-hooks/exhaustive-deps

  const add = async (list: FileList | File[]) => {
    const files = [...list];
    const bad = files.filter((f) => !OK.test(f.name));
    setMsg(bad.length ? `Nu se pot atașa: ${bad.map((f) => f.name).join(", ")} (acceptăm PDF, imagini, Word, Excel, ZIP).` : "");
    const good = files.filter((f) => OK.test(f.name));
    if (!good.length) return;
    if (p.mode === "draft") { p.onChange([...p.files, ...good.map((file) => ({ file, kind: guessDocKind(file.name) }))]); return; }
    for (const file of good) {
      setBusy((n) => n + 1);
      const body = new FormData();
      const kind = guessDocKind(file.name);
      body.set("file", file); body.set("kind", "source"); body.set("doc_type", kind); body.set("asset", p.asset);
      const r = await fetch(`/api/crm/reports/${p.report}/documents`, { method: "POST", body }).catch(() => null);
      const d = (await r?.json().catch(() => ({}))) as { id?: string; error?: string };
      setBusy((n) => n - 1);
      if (!r?.ok || !d.id) { setMsg(d?.error ?? `„${file.name}” nu s-a putut încărca.`); continue; }
      setSaved((s) => [...s, { id: d.id!, filename: file.name, size_bytes: file.size, doc_type: kind }]);
    }
  };
  const setKind = async (i: number, kind: string) => {
    if (p.mode === "draft") { p.onChange(p.files.map((f, j) => (j === i ? { ...f, kind } : f))); return; }
    const d = saved[i];
    setSaved((s) => s.map((x, j) => (j === i ? { ...x, doc_type: kind } : x)));
    const r = await fetch(`/api/crm/reports/${p.report}/documents`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ doc: d.id, doc_type: kind, asset: p.asset }) }).catch(() => null);
    if (!r?.ok) setMsg("Tipul nu s-a putut salva.");
  };
  const remove = async (i: number) => {
    if (p.mode === "draft") { p.onChange(p.files.filter((_, j) => j !== i)); return; }
    const d = saved[i];
    if (!confirm(`Ștergi „${d.filename}”?`)) return;
    const r = await fetch(`/api/crm/reports/${p.report}/documents?doc=${d.id}`, { method: "DELETE" }).catch(() => null);
    if (r?.ok) setSaved((s) => s.filter((_, j) => j !== i));
    else setMsg("Documentul nu s-a putut șterge (ai dreptul de ștergere?).");
  };
  const rows = p.mode === "draft"
    ? p.files.map((f) => ({ name: f.file.name, size: f.file.size, kind: f.kind }))
    : saved.map((d) => ({ name: d.filename, size: d.size_bytes, kind: d.doc_type ?? guessDocKind(d.filename) }));

  return (
    <div className="adBox">
      <div className={`adDrop${over ? " over" : ""}`} role="button" tabIndex={0} aria-label="Adaugă acte pentru acest bun"
        onClick={() => input.current?.click()} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.current?.click(); } }}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); if (e.dataTransfer.files.length) add(e.dataTransfer.files); }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" /></svg>
        <b>{busy ? "Se încarcă…" : "Trage actele aici"}</b>
        <small>sau apasă ca să alegi · CF, releveu, act de proprietate…</small>
        <input ref={input} type="file" multiple hidden accept=".pdf,.jpg,.jpeg,.png,.heic,.heif,.webp,.doc,.docx,.xls,.xlsx,.zip"
          onChange={(e) => { if (e.target.files?.length) add(e.target.files); e.target.value = ""; }} />
      </div>
      {rows.length > 0 && (
        <ul className="adList">
          {rows.map((r, i) => (
            <li key={`${r.name}${i}`}>
              <span className="adExt">{ext(r.name)}</span>
              <span className="adName" title={r.name}><b>{r.name}</b><small>{size(r.size)}{p.mode === "draft" ? " · se încarcă la înregistrare" : ""}</small></span>
              <select className="select adKind" value={r.kind} aria-label={`Tipul actului ${r.name}`} onChange={(e) => setKind(i, e.target.value)}>
                {DOC_KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
              <button type="button" className="adDel" aria-label={`Scoate ${r.name}`} onClick={() => remove(i)}>×</button>
            </li>
          ))}
        </ul>
      )}
      {msg && <p className="adMsg" role="alert">{msg}</p>}
    </div>
  );
}
