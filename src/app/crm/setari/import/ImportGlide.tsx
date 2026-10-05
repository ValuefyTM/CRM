"use client";

import { useState } from "react";
import { unzipSync } from "fflate";
import { anomaliesCsv, TABLE_LABEL, transform, type ImportPlan } from "@/lib/glide/transform";

const BATCH = 100;

/** Glide export → preview (counts and anomalies, computed in the browser) → import in batches. */
export function ImportGlide({ base }: { base: string }) {
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [progress, setProgress] = useState<{ done: number; total: number; table: string } | null>(null);
  const [finished, setFinished] = useState(false);

  const read = async (list: FileList | null) => {
    const files = [...(list ?? [])];
    if (!files.length) return;
    setError(""); setPlan(null); setFinished(false); setBusy("Se citesc fișierele…");
    try {
      const csv: Record<string, string> = {};
      const dec = new TextDecoder("utf-8");
      for (const f of files) {
        if (/\.zip$/i.test(f.name)) {
          const entries = unzipSync(new Uint8Array(await f.arrayBuffer()), { filter: (e) => /\.csv$/i.test(e.name) && !e.name.startsWith("__MACOSX") });
          for (const [name, data] of Object.entries(entries)) csv[name] = dec.decode(data);
        } else if (/\.csv$/i.test(f.name)) csv[f.name] = await f.text();
      }
      if (!Object.keys(csv).length) throw new Error("Nu am găsit fișiere CSV. Încarcă arhiva .zip exportată din Glide sau fișierele .csv.");
      setBusy("Se analizează datele…");
      await new Promise((r) => setTimeout(r, 30));
      setPlan(transform(csv));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusy("");
  };

  const download = () => {
    if (!plan) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([anomaliesCsv(plan.anomalies)], { type: "text/csv;charset=utf-8" }));
    a.download = "anomalii-import-glide.csv";
    a.click();
  };

  const run = async () => {
    if (!plan || !confirm("Imporți datele în CRM? Rândurile importate deja se actualizează, nu se dublează.")) return;
    const total = plan.tables.reduce((n, t) => n + t.rows.length, 0);
    let done = 0;
    setError(""); setFinished(false);
    for (const t of plan.tables) {
      for (let i = 0; i < t.rows.length; i += BATCH) {
        setProgress({ done, total, table: TABLE_LABEL[t.name] });
        const rows = t.rows.slice(i, i + BATCH);
        const r = await fetch("/api/crm/import", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ table: t.name, rows, last: i + BATCH >= t.rows.length }),
        }).catch(() => null);
        if (!r?.ok) {
          const d = (await r?.json().catch(() => ({}))) as { error?: string } | undefined;
          setProgress(null);
          return setError(`${d?.error || "Conexiunea s-a întrerupt."} Poți porni din nou importul: ce s-a importat deja nu se dublează.`);
        }
        done += rows.length;
      }
    }
    setProgress({ done: total, total, table: "" });
    setFinished(true);
  };

  const groups = plan
    ? Object.entries(plan.anomalies.reduce<Record<string, number>>((m, a) => ({ ...m, [`${a.issue}`]: (m[a.issue] ?? 0) + (/^\d+ /.test(a.detail) && a.id === "—" ? parseInt(a.detail) : 1) }), {}))
    : [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 980 }}>
      <section className="card">
        <h2>1. Alege exportul din Glide</h2>
        <p className="hint">Arhiva .zip cu tabelele VFY_* sau fișierele .csv. Datele sunt analizate în browserul tău; nimic nu se trimite până nu confirmi importul.</p>
        <label className="btn btnNavy" style={{ alignSelf: "flex-start" }}>
          {busy || "↑ Alege fișierul"}
          <input type="file" hidden accept=".zip,.csv" multiple disabled={!!busy || !!progress} onChange={(e) => { read(e.target.files); e.target.value = ""; }} />
        </label>
        {error && <div role="alert" className="error">{error}</div>}
      </section>

      {plan && (
        <>
          <section className="card">
            <h2>2. Ce se importă</h2>
            <div className="tableWrap">
              <table className="table" style={{ minWidth: 0 }}>
                <thead><tr><th>Date în CRM</th><th style={{ textAlign: "right" }}>Rânduri</th></tr></thead>
                <tbody>{plan.tables.map((t) => <tr key={t.name}><td>{TABLE_LABEL[t.name]}</td><td style={{ textAlign: "right" }} className="mono">{t.rows.length.toLocaleString("ro-RO")}</td></tr>)}</tbody>
              </table>
            </div>
            <p className="hint">Din: {Object.entries(plan.sources).map(([k, v]) => `${k} (${v})`).join(" · ")}</p>
          </section>

          <section className="card">
            <div className="cardHead">
              <h2>3. De verificat</h2>
              <button type="button" className="btn btnGhost btnSm" onClick={download}>↓ Descarcă lista completă (CSV)</button>
            </div>
            <p className="hint">Nimic nu se pierde: rândurile cu probleme se importă cât de complet se poate, iar lista îți arată ce merită corectat.</p>
            <ul className="people">
              {groups.map(([issue, n]) => (
                <li key={issue}><span className="who"><b>{issue}</b></span><span className="pill pillWarn"><i />{n.toLocaleString("ro-RO")}</span></li>
              ))}
            </ul>
          </section>

          <section className="card">
            <h2>4. Importă</h2>
            {progress && (
              <>
                <div className="progress" style={{ gridTemplateColumns: "1fr" }}><i data-on style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }} /></div>
                <p className="hint">{finished ? "Import finalizat." : `${progress.table}… ${Math.round((progress.done / progress.total) * 100)}%`}</p>
              </>
            )}
            {finished ? (
              <div className="okMsg">Datele au fost importate. <a className="rowLink" href={`${base}/comenzi?tab=banci`}>Vezi comenzile de la bănci →</a> · <a className="rowLink" href={`${base}/rapoarte`}>Vezi rapoartele →</a></div>
            ) : (
              <button type="button" className="btn btnGold" style={{ alignSelf: "flex-start" }} disabled={!!progress} onClick={run}>{progress ? "Se importă…" : "Importă în CRM"}</button>
            )}
          </section>
        </>
      )}
    </div>
  );
}
