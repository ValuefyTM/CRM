"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { SimilarRow } from "@/lib/similar-reports";

const RADII: [string, string][] = [["0.5", "500 m"], ["1", "1 km"], ["2", "2 km"], ["5", "5 km"]];
const num = (n: number | null | undefined, d = 0) => (n == null ? "—" : n.toLocaleString("ro-RO", { maximumFractionDigits: d }));
const date = (s: string | null) => (s ? s.slice(0, 10).split("-").reverse().join(".") : "—");
const dist = (km: number) => (km < 1 ? `${Math.round(km * 1000)} m` : `${km.toLocaleString("ro-RO", { maximumFractionDigits: 1 })} km`);
const cap = (s: string | null) => (s ? s.charAt(0) + s.slice(1).toLowerCase() : "");
const tone = (v: number) => (v >= 75 ? "hi" : v >= 50 ? "mid" : "lo");

type Data = { radius: number; located: boolean; subject: { type: string | null; bank: string | null; hasUser: boolean } | null; rows: SimilarRow[] };

/**
 * „N rapoarte similare în raza de 1 km”: opens the list of reports that valued the same type of property nearby,
 * newest first, with their similarity to this report's subject; radius and "only the same designated user" to choose.
 */
export function SimilarReports({ report, base, count, bank }: { report: string; base: string; count: number; bank: string | null }) {
  const [open, setOpen] = useState(false);
  const [radius, setRadius] = useState("1");
  const [same, setSame] = useState(false);
  const [data, setData] = useState<Data | null>(null);
  const [busy, setBusy] = useState(false);
  const [row, setRow] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let off = false;
    setBusy(true);
    fetch(`/api/crm/reports/${encodeURIComponent(report)}/similar?raza=${radius}${same ? "&acelasi=1" : ""}`, { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<Data>) : null)).then((d) => { if (!off) { setData(d); setBusy(false); } })
      .catch(() => { if (!off) setBusy(false); });
    return () => { off = true; };
  }, [open, radius, same, report]);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [open]);

  const rows = data?.rows ?? [];
  const sqm = rows.map((r) => r.sqm).filter((x): x is number => x != null && x > 0).sort((a, b) => a - b);
  const median = sqm.length ? sqm[Math.floor((sqm.length - 1) / 2)] : null;
  const cur = rows.find((r) => r.currency)?.currency === "EUR" ? "EUR" : "lei";

  return (
    <>
      <button type="button" className="simChip" onClick={() => setOpen(true)}>
        <b>{count}</b> {count === 1 ? "raport similar" : "rapoarte similare"} în raza de 1 km<span aria-hidden="true">→</span>
      </button>
      {open && createPortal(
        <div className="vfModal" role="dialog" aria-modal="true" aria-labelledby="simT" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="vfModalBox simBox">
            <div className="simHead">
              <div>
                <h2 id="simT">Rapoarte similare în apropiere</h2>
                <p className="muted">{data?.subject?.type ? `${cap(data.subject.type)} · ` : ""}același tip de proprietate, în raza aleasă · cele mai noi evaluări întâi</p>
              </div>
              <button type="button" className="btn btnGhost btnSm" onClick={() => setOpen(false)} aria-label="Închide">✕</button>
            </div>
            <div className="simBar">
              <div className="simRadii" role="group" aria-label="Raza">
                {RADII.map(([k, l]) => <button key={k} type="button" aria-pressed={radius === k} onClick={() => setRadius(k)}>{l}</button>)}
              </div>
              {bank && (
                <label className="simSame"><input type="checkbox" checked={same} onChange={(e) => setSame(e.target.checked)} />Doar la același utilizator <b>{bank}</b></label>
              )}
              <span className="simSum">{busy ? "Se caută…" : `${rows.length} ${rows.length === 1 ? "raport" : "rapoarte"}${median ? ` · mediana ${num(median)} ${cur}/mp` : ""}`}</span>
            </div>
            {!busy && data && !data.located && <p className="hint pad">Bunul acestui raport nu are coordonate: localizează-l (pagina bunului) ca să găsim rapoartele din jur.</p>}
            {!busy && data?.located && rows.length === 0 && <p className="hint pad">Niciun raport cu același tip de proprietate în raza aleasă{same ? ", la același utilizator" : ""}. Mărește raza.</p>}
            {rows.length > 0 && (
              <div className="tableWrap simWrap">
                <table className="table simTable">
                  <thead><tr><th>Data evaluării</th><th>Raport</th><th>Bun</th><th style={{ textAlign: "right" }}>Suprafață</th><th style={{ textAlign: "right" }}>Distanță</th><th style={{ textAlign: "right" }}>Valoare</th><th style={{ textAlign: "right" }}>/mp</th><th>Similaritate</th></tr></thead>
                  <tbody>
                    {rows.map((r) => {
                      const k = `${r.report_id}:${r.asset_id}`;
                      const on = row === k;
                      const c = r.currency === "EUR" ? "EUR" : "lei";
                      return [
                        <tr key={k} className={`simRow${on ? " on" : ""}`} onClick={() => setRow(on ? null : k)} aria-expanded={on}>
                          <td className="mono">{date(r.date)}</td>
                          <td><a className="link" href={`${base}/rapoarte/${r.report_id}`} onClick={(e) => e.stopPropagation()}>{r.number ? `nr. ${r.number}` : "raport"}</a>{r.bank && <small className="block muted">{r.bank}</small>}</td>
                          <td><b>{cap(r.type) || "Bun"}</b><small className="block muted simAddr" title={r.address ?? ""}>{r.address ?? r.city ?? "—"}</small></td>
                          <td style={{ textAlign: "right" }} className="mono">{r.usable_area ? `${num(r.usable_area, 1)} mp` : r.land_area ? `${num(r.land_area)} mp teren` : "—"}</td>
                          <td style={{ textAlign: "right" }} className="mono">{dist(r.km)}</td>
                          <td style={{ textAlign: "right" }} className="mono">{r.value ? `${num(r.value)} ${c}` : "—"}</td>
                          <td style={{ textAlign: "right" }} className="mono">{r.sqm ? num(r.sqm) : "—"}</td>
                          <td><span className={`simScore ${tone(r.score)}`}><span className="simTrack"><i style={{ width: `${r.score}%` }} /></span><b>{r.score}%</b></span></td>
                        </tr>,
                        on && (
                          <tr key={`${k}:d`} className="simDetail">
                            <td colSpan={8}>
                              <dl>
                                <div><dt>Adresă</dt><dd>{r.address ?? r.city ?? "—"}</dd></div>
                                <div><dt>Suprafață utilă</dt><dd>{r.usable_area ? `${num(r.usable_area, 2)} mp` : "—"}</dd></div>
                                {r.land_area ? <div><dt>Teren</dt><dd>{num(r.land_area)} mp</dd></div> : null}
                                <div><dt>Camere</dt><dd>{r.rooms ?? "—"}</dd></div>
                                <div><dt>Etaj</dt><dd>{r.floor ?? "—"}</dd></div>
                                <div><dt>An construcție</dt><dd>{r.year_built ?? "—"}</dd></div>
                                <div><dt>CF</dt><dd className="mono">{r.cf ?? "—"}</dd></div>
                                <div><dt>Utilizator</dt><dd>{r.bank ?? "—"}</dd></div>
                              </dl>
                              <div className="simParts">
                                <span className="muted">Gradul de similaritate:</span>
                                {r.parts.map((p) => <span key={p.k} className={`simPart ${tone(p.v)}`}>{p.k} <b>{p.v}%</b></span>)}
                                <a className="btn btnGhost btnSm" href={`${base}/rapoarte/${r.report_id}/bun/${r.asset_id}`}>Detaliu bun →</a>
                              </div>
                            </td>
                          </tr>
                        ),
                      ];
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <p className="hint simFoot">Similaritatea ține cont de distanță (35%), suprafață (30%), anul construcției (15%), numărul de camere (10%) și cât de recentă e evaluarea (10%), doar unde datele există la ambele bunuri.</p>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
