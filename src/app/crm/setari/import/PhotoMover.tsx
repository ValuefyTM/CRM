"use client";

import { useEffect, useState } from "react";

type Counts = { pending: number; moved: number; lost: number };

/** Moves the photos and logos still hosted by Glide into R2, a few per request, until none are left. */
export function PhotoMover() {
  const [c, setC] = useState<Counts | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/crm/import/photos").then((r) => (r.ok ? (r.json() as Promise<Counts>) : null)).then((d) => { if (d) setC(d); }).catch(() => {});
  }, []);

  const run = async () => {
    setRunning(true); setError("");
    let idle = 0;
    for (;;) {
      const r = await fetch("/api/crm/import/photos", { method: "POST" }).catch(() => null);
      const d = (await r?.json().catch(() => null)) as (Counts & { batchMoved: number; batchLost: number; error?: string }) | null;
      if (!r?.ok || !d) { setError(d?.error ?? "Conexiunea s-a întrerupt. Apasă din nou: continuă de unde a rămas."); break; }
      setC(d);
      if (d.pending === 0) break;
      idle = d.batchMoved + d.batchLost === 0 ? idle + 1 : 0;
      if (idle >= 3) { setError("Serverele Glide nu răspund momentan. Încearcă din nou mai târziu: continuă de unde a rămas."); break; }
    }
    setRunning(false);
  };

  const total = c ? c.pending + c.moved + c.lost : 0;
  const pct = total ? Math.round(((c!.moved + c!.lost) / total) * 100) : 0;
  return (
    <section className="card">
      <h2>Fotografii din Glide → R2</h2>
      <p className="hint">Fotografiile bunurilor, pozele din fișele de inspecție, semnăturile și siglele băncilor sunt încă pe serverele Glide. Le copiem în spațiul VALUEFY (R2), ca să nu mai depindem de Glide. Se poate opri și relua oricând.</p>
      {!c ? <p className="hint">Se verifică…</p> : total === 0 ? <p className="hint">Nu există fotografii din Glide. Rulează întâi importul de date.</p> : (
        <>
          <dl className="dl">
            <div><dt>Mutate în R2</dt><dd>{c.moved.toLocaleString("ro-RO")}</dd></div>
            <div><dt>Rămase în Glide</dt><dd>{c.pending.toLocaleString("ro-RO")}</dd></div>
            <div><dt>Indisponibile în Glide</dt><dd>{c.lost.toLocaleString("ro-RO")}</dd></div>
          </dl>
          <div className="progress" style={{ gridTemplateColumns: "1fr" }}><i data-on style={{ width: `${pct}%` }} /></div>
          {c.pending === 0 ? (
            <div className="okMsg">Toate fotografiile disponibile sunt în R2{c.lost ? `; ${c.lost} nu mai existau în Glide` : ""}.</div>
          ) : (
            <button type="button" className="btn btnGold" style={{ alignSelf: "flex-start" }} disabled={running} onClick={run}>
              {running ? `Se mută… ${pct}%` : c.moved ? "Continuă mutarea" : `Mută ${c.pending.toLocaleString("ro-RO")} fotografii în R2`}
            </button>
          )}
        </>
      )}
      {error && <div role="alert" className="error">{error}</div>}
    </section>
  );
}
