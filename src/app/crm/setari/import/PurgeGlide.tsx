"use client";

import { useState } from "react";
import type { PurgePlan } from "@/lib/glide/purge";

const n = (v: number) => v.toLocaleString("ro-RO");

/** Deletes every row imported from Glide (accounts stay), after showing what goes and asking for STERG. */
export function PurgeGlide() {
  const [plan, setPlan] = useState<PurgePlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [word, setWord] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState<number | null>(null);

  const preview = async () => {
    setBusy(true); setError(""); setDone(null);
    const r = await fetch("/api/crm/import/purge").catch(() => null);
    const d = (await r?.json().catch(() => null)) as (PurgePlan & { error?: string }) | null;
    if (!r?.ok || !d) setError(d?.error ?? "Nu s-a putut calcula. Încearcă din nou.");
    else setPlan(d);
    setBusy(false);
  };

  const purge = async () => {
    setBusy(true); setError("");
    const r = await fetch("/api/crm/import/purge", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ confirm: word.trim().toUpperCase() }) }).catch(() => null);
    const d = (await r?.json().catch(() => null)) as { deleted?: number; error?: string } | null;
    if (!r?.ok || !d) setError(d?.error ?? "Conexiunea s-a întrerupt. Verifică din nou ce a rămas.");
    else { setDone(d.deleted ?? 0); setPlan(null); setWord(""); }
    setBusy(false);
  };

  const glide = plan?.tables.reduce((s, t) => s + t.glide, 0) ?? 0;
  const crm = plan?.tables.reduce((s, t) => s + t.crm, 0) ?? 0;
  return (
    <section className="card">
      <h2>Șterge datele importate</h2>
      <p className="hint">
        Șterge tot ce a venit din vechiul CRM: clienți, contracte, comenzi, rapoarte, bunuri, proprietăți, inspecții, fișe și notițe, ca să poți importa
        din nou un export curat. Rămân conturile (echipa, colaboratorii), setările, site-ul și ce ați creat direct în CRM. Fotografiile deja mutate în R2
        se leagă la loc la următorul import. Cloudflare păstrează 30 de zile copii ale bazei, din care se poate reveni.
      </p>
      {done !== null && <div className="okMsg">Am șters {n(done)} rânduri. Apasă „Vezi ce se șterge” ca să verifici că nu a mai rămas nimic din vechiul CRM.</div>}
      {!plan ? (
        <button type="button" className="btn btnGhost" style={{ alignSelf: "flex-start" }} disabled={busy} onClick={preview}>{busy ? "Se calculează…" : "Vezi ce se șterge"}</button>
      ) : glide + crm === 0 ? (
        <div className="okMsg">Nu mai există date importate din vechiul CRM.</div>
      ) : (
        <>
          <div className="tableWrap">
            <table className="table">
              <thead><tr><th>Tabel</th><th style={{ textAlign: "right" }}>Din vechiul CRM</th><th style={{ textAlign: "right" }}>Create în CRM, legate de ele</th></tr></thead>
              <tbody>
                {plan.tables.map((t) => (
                  <tr key={t.table}><td>{t.label}</td><td style={{ textAlign: "right" }}>{n(t.glide)}</td><td style={{ textAlign: "right" }}>{t.crm ? <b style={{ color: "var(--err)" }}>{n(t.crm)}</b> : <span className="muted">—</span>}</td></tr>
                ))}
                <tr><td><b>Total</b></td><td style={{ textAlign: "right" }}><b>{n(glide)}</b></td><td style={{ textAlign: "right" }}><b>{n(crm)}</b></td></tr>
              </tbody>
            </table>
          </div>
          {crm > 0 && <p className="hint">Rândurile din coloana a doua au fost create în CRM (de exemplu fotografii sau fișe făcute în aplicația de inspecții, documente încărcate) pentru rapoarte sau inspecții din vechiul CRM. Nu pot exista fără ele, așa că se șterg și ele.</p>}
          {plan.kept.length > 0 && (
            <p className="hint">Rămân, pentru că sunt folosite de date create în CRM (la următorul import se actualizează, nu se dublează): {plan.kept.map((k) => `${k.label.toLowerCase()} ${n(k.n)}`).join(", ")}.</p>
          )}
          {plan.cleared.length > 0 && (
            <p className="hint">Legături golite în datele care rămân: {plan.cleared.map((c) => `${c.table}.${c.col} (${n(c.n)})`).join(", ")}.</p>
          )}
          {plan.files > 0 && <p className="hint">{n(plan.files)} fotografii din R2 sunt păstrate pentru următorul import.</p>}
          <div className="actions">
            <input className="search" style={{ maxWidth: 220 }} value={word} onChange={(e) => setWord(e.target.value)} placeholder="Scrie STERG" aria-label="Confirmare" />
            <button type="button" className="btn btnDangerSolid" disabled={busy || word.trim().toUpperCase() !== "STERG"} onClick={purge}>{busy ? "Se șterge…" : `Șterge ${n(glide + crm)} rânduri`}</button>
            <button type="button" className="btn btnGhost" disabled={busy} onClick={() => { setPlan(null); setWord(""); }}>Renunță</button>
          </div>
        </>
      )}
      {error && <div role="alert" className="error">{error}</div>}
    </section>
  );
}
