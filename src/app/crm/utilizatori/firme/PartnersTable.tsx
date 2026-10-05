"use client";

import { useMemo, useState } from "react";

export type FirmRow = { id: string; name: string; kind: string; kindLabel: string; city: string | null; cui: string | null; status: string; users: number; active: number; invited: number; lastLogin: string };

const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Partner firms, shown in the "Colaboratori" tab of Utilizatori. `head` adds controls next to the search box. */
export function PartnersTable({ rows, base, initial = "all", head }: { rows: FirmRow[]; base: string; initial?: string; head?: React.ReactNode }) {
  const [q, setQ] = useState("");
  const [f, setF] = useState(initial);
  const counts = {
    all: rows.length,
    active: rows.filter((r) => r.status === "active" && r.active > 0).length,
    invited: rows.filter((r) => r.invited > 0).length,
    noaccess: rows.filter((r) => r.users === 0).length,
    suspended: rows.filter((r) => r.status === "suspended").length,
  };
  const shown = useMemo(() => {
    const t = fold(q.trim());
    return rows.filter((r) => {
      if (f === "active" && !(r.status === "active" && r.active > 0)) return false;
      if (f === "invited" && r.invited === 0) return false;
      if (f === "noaccess" && r.users !== 0) return false;
      if (f === "suspended" && r.status !== "suspended") return false;
      return !t || fold([r.name, r.kindLabel, r.city, r.cui].filter(Boolean).join(" ")).includes(t);
    });
  }, [rows, q, f]);
  const tabs: [string, string][] = [["all", "Toți"], ["active", "Cu acces activ"], ["invited", "Invitați"], ["noaccess", "Fără persoane"], ["suspended", "Suspendați"]];

  return (
    <section className="card">
      <div className="toolbar">
        <input className="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Caută firma după nume, tip, localitate, CUI…" aria-label="Caută" />
        {head}
      </div>
      <div className="filters" role="group" aria-label="Filtre">
        {tabs.map(([k, label]) => (
          <button key={k} type="button" aria-pressed={f === k} onClick={() => setF(k)}>{label} <small>{counts[k as keyof typeof counts]}</small></button>
        ))}
      </div>
      {shown.length === 0 ? (
        <div className="empty">{rows.length ? "Nicio firmă pentru filtrele alese." : "Nu ai adăugat încă nicio firmă parteneră."}</div>
      ) : (
        <div className="tableWrap">
          <table className="table">
            <thead><tr><th>Firmă</th><th>Tip</th><th>Localitate</th><th>Acces portal</th><th>Ultima autentificare</th><th>Status</th></tr></thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id}>
                  <td><a className="rowLink" href={`${base}/utilizatori/firme/${r.id}`}>{r.name}</a>{r.cui && <div className="muted mono">CUI {r.cui}</div>}</td>
                  <td>{r.kindLabel}</td>
                  <td>{r.city || <span className="muted">—</span>}</td>
                  <td>
                    {r.users === 0 ? <span className="muted">Nicio persoană</span> : (
                      <span className="actions" style={{ gap: 6 }}>
                        {r.active > 0 && <span className="pill pillOk"><i />{r.active} activ{r.active > 1 ? "e" : ""}</span>}
                        {r.invited > 0 && <span className="pill pillWarn"><i />{r.invited} invitat{r.invited > 1 ? "e" : ""}</span>}
                      </span>
                    )}
                  </td>
                  <td className="muted">{r.lastLogin}</td>
                  <td>{r.status === "active" ? <span className="pill pillOk"><i />Activ</span> : <span className="pill pillErr"><i />Suspendat</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
