"use client";
import { useState } from "react";

type Matrix = Record<string, string[]>;

/** The roles × permissions grid; saved in one go. */
export function PermMatrix(props: { perms: [string, string, string][]; roles: [string, string, number][]; initial: Matrix; defaults: Matrix }) {
  const [m, setM] = useState<Matrix>(props.initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<[string, boolean] | null>(null);
  const dirty = JSON.stringify(m) !== JSON.stringify(props.initial);
  const toggle = (role: string, perm: string) => {
    if (role === "admin" && perm === "admin") return; // administrators keep the settings (else only the owner could undo)
    setMsg(null);
    setM((x) => ({ ...x, [role]: x[role].includes(perm) ? x[role].filter((p) => p !== perm) : [...x[role], perm] }));
  };
  const save = async () => {
    setBusy(true);
    const r = await fetch("/api/crm/perms", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ matrix: m }) });
    const d = (await r.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!r.ok) return setMsg([d.error ?? "Nu am putut salva.", false]);
    setMsg(["Salvat. Se aplică la următoarea pagină deschisă de fiecare utilizator.", true]);
    location.reload();
  };
  return (
    <section className="card">
      <div className="cardHead">
        <h2>Matricea de permisiuni</h2>
        <span className="actions">
          <button type="button" className="btn btnGhost btnSm" disabled={busy} onClick={() => { setM(props.defaults); setMsg(null); }}>Valorile inițiale</button>
          <button type="button" className="btn btnSm" disabled={busy || !dirty} onClick={save}>{busy ? "Se salvează…" : "Salvează"}</button>
        </span>
      </div>
      {msg && <div className={msg[1] ? "note ok" : "note err"}>{msg[0]}</div>}
      <div className="tableWrap">
        <table className="table permTable">
          <thead>
            <tr>
              <th>Modul / funcționalitate</th>
              <th className="c">Proprietar</th>
              {props.roles.map(([k, l, n]) => <th key={k} className="c">{l}<div className="muted">{n} {n === 1 ? "cont" : "conturi"}</div></th>)}
            </tr>
          </thead>
          <tbody>
            {props.perms.map(([k, l, h]) => (
              <tr key={k}>
                <td><b>{l}</b>{h && <div className="muted">{h}</div>}</td>
                <td className="c"><input type="checkbox" checked disabled aria-label={`${l} · Proprietar`} /></td>
                {props.roles.map(([r, rl]) => (
                  <td key={r} className="c">
                    <input type="checkbox" checked={m[r]?.includes(k) ?? false} disabled={busy || (r === "admin" && k === "admin")} onChange={() => toggle(r, k)} aria-label={`${l} · ${rl}`} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
