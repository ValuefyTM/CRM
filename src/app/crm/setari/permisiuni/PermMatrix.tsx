"use client";
import { Fragment, useState } from "react";
import {
  BUILTIN_ROLES, FEE_VIEWS, MODULES, RIGHTS, TEAM_RIGHTS, TEAM_ROLES,
  type Cell, type FeeView, type ModKey, type PermConfig, type Right, type TeamRight, type TeamRole,
} from "@/lib/perms";

type Mod = (typeof MODULES)[number];
const GROUPS = [...new Set(MODULES.map((m) => m.group))].map((g) => [g, MODULES.filter((m) => m.group === g)] as const);
const OFF: Cell = { on: false, r: [], sp: [] };
const scopeOf = (m: Mod) => ("scope" in m ? m.scope : null);
const spOf = (m: Mod): readonly (readonly [string, string])[] => ("sp" in m ? m.sp : []);
const hintOf = (m: Mod) => ("hint" in m ? m.hint : "");

/** One cell, in short: V A E Ș lit or dim, "ale lui" for own records, +n special actions. */
function CellView({ m, c }: { m: Mod; c: Cell }) {
  if (!c.on) return <span className="pmOff">—</span>;
  const scope = scopeOf(m);
  const meta = [c.own && scope ? <b key="s">{scope[1].toLowerCase()}</b> : null, c.sp.length ? `+${c.sp.length}` : null].filter(Boolean);
  return (
    <>
      <span className="pmLetters">
        {RIGHTS.filter(([k]) => k === "V" || (m.rights as readonly string[]).includes(k)).map(([k]) => (
          <i key={k} className={k === "V" || c.r.includes(k as Right) ? "on" : ""}>{k === "D" ? "Ș" : k}</i>
        ))}
      </span>
      {meta.length > 0 && <span className="pmMeta">{meta.map((x, i) => <Fragment key={i}>{i ? " · " : ""}{x}</Fragment>)}</span>}
    </>
  );
}

/**
 * Setări → Permisiuni: roles × modules (click a cell to set it), new roles, and the rights inside a report's team.
 * Only the owner saves (`edit`); the others see it read-only.
 */
export function PermMatrix(props: { initial: PermConfig; defaults: PermConfig; counts: Record<string, number>; owners: number; edit: boolean }) {
  const [cfg, setCfg] = useState<PermConfig>(props.initial);
  const [pick, setPick] = useState<{ role: string; mod: ModKey }>({ role: props.initial.roles.find((r) => r.id === "evaluator")?.id ?? props.initial.roles[0]?.id, mod: "reports" });
  const [newName, setNewName] = useState("");
  const [copyFrom, setCopyFrom] = useState("evaluator");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const dirty = JSON.stringify(cfg) !== JSON.stringify(props.initial);
  const ro = !props.edit || busy;

  const role = cfg.roles.find((r) => r.id === pick.role) ?? cfg.roles[0];
  const mod = MODULES.find((m) => m.k === pick.mod)!;
  const cell = role?.cells[mod.k] ?? OFF;

  const setCell = (patch: Partial<Cell>) => {
    setMsg(null);
    setCfg((x) => ({ ...x, roles: x.roles.map((r) => (r.id === role.id ? { ...r, cells: { ...r.cells, [mod.k]: { ...(r.cells[mod.k] ?? OFF), ...patch } } } : r)) }));
  };
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const setRoleName = (name: string) => setCfg((x) => ({ ...x, roles: x.roles.map((r) => (r.id === role.id ? { ...r, name } : r)) }));
  const removeRole = () => {
    setCfg((x) => ({ ...x, roles: x.roles.filter((r) => r.id !== role.id) }));
    setPick({ role: "evaluator", mod: pick.mod });
  };
  const addRole = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    const from = cfg.roles.find((r) => r.id === copyFrom) ?? cfg.roles[0];
    const id = `r_${Date.now().toString(36)}`;
    setCfg((x) => ({ ...x, roles: [...x.roles, { id, name: name.slice(0, 60), cells: structuredClone(from.cells) }] }));
    setPick({ role: id, mod: pick.mod });
    setNewName("");
  };
  const setTeam = (t: TeamRole, patch: { r?: TeamRight[]; fee?: FeeView }) => { setMsg(null); setCfg((x) => ({ ...x, team: { ...x.team, [t]: { ...x.team[t], ...patch } } })); };

  const save = async () => {
    setBusy(true);
    const r = await fetch("/api/crm/perms", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ config: cfg }) });
    const d = (await r.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!r.ok) return setMsg(d.error ?? "Nu am putut salva permisiunile.");
    location.reload();
  };

  return (
    <>
      <section className="card pmCard">
        <div className="cardHead">
          <div><h2>Roluri × module</h2><p className="hint" style={{ margin: "2px 0 0" }}>Apasă pe o celulă ca să setezi ce face rolul în acel modul. Un modul oprit nu apare în meniu.</p></div>
          <span className="pmLegend"><span><i>V</i> vede</span><span><i>A</i> adaugă</span><span><i>E</i> editează</span><span><i>Ș</i> șterge</span><span><b>ale lui</b> doar înregistrările lui</span><span>+n acțiuni speciale</span></span>
        </div>
        <div className="pmArea">
          <div className="pmScroll">
            <table className="pmTable">
              <thead>
                <tr className="pmGroups"><th className="pmRole" rowSpan={2}>Rol</th>{GROUPS.map(([g, ms]) => <th key={g} colSpan={ms.length}>{g}</th>)}</tr>
                <tr className="pmMods">{MODULES.map((m) => <th key={m.k} scope="col">{m.l}</th>)}</tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row" className="pmRole"><b>Proprietar</b><small>{props.owners} {props.owners === 1 ? "cont" : "conturi"} · acces complet</small></th>
                  {MODULES.map((m) => <td key={m.k}><span className="pmCell fixed"><CellView m={m} c={{ on: true, r: [...m.rights], sp: spOf(m).map(([s]) => s) }} /></span></td>)}
                </tr>
                {cfg.roles.map((r) => (
                  <tr key={r.id}>
                    <th scope="row" className="pmRole">
                      <b>{r.name}</b>
                      <small>{props.counts[r.id] ?? 0} {(props.counts[r.id] ?? 0) === 1 ? "cont" : "conturi"}{BUILTIN_ROLES.includes(r.id) ? "" : " · rol nou"}</small>
                    </th>
                    {MODULES.map((m) => {
                      const sel = pick.role === r.id && pick.mod === m.k;
                      return (
                        <td key={m.k}>
                          <button type="button" className={`pmCell${sel ? " sel" : ""}`} onClick={() => setPick({ role: r.id, mod: m.k })} aria-pressed={sel} aria-label={`${r.name} · ${m.l}`}>
                            <CellView m={m} c={r.cells[m.k] ?? OFF} />
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            {props.edit && (
              <form className="pmAdd" onSubmit={addRole}>
                <b>+ Rol nou</b>
                <input className="input" id="pm-new-role" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="ex. Evaluator senior" aria-label="Numele rolului" />
                <label htmlFor="pm-copy" className="hint">pornește de la</label>
                <select className="select" id="pm-copy" value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)}>
                  {cfg.roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
                <button type="submit" className="btn btnGhost btnSm" disabled={!newName.trim()}>Adaugă rolul</button>
              </form>
            )}
          </div>

          {role && (
            <aside className="pmEditor" aria-live="polite">
              <div>
                <h3>{mod.l}</h3>
                <span className="hint">pentru rolul <b>{role.name}</b></span>
                {hintOf(mod) && <p className="hint" style={{ margin: "6px 0 0" }}>{hintOf(mod)}</p>}
              </div>
              <label className="pmSwitch">
                <span>Modul activ <small>(apare în meniu)</small></span>
                <input type="checkbox" checked={cell.on} disabled={ro} onChange={(e) => setCell({ on: e.target.checked })} />
              </label>
              <fieldset className="pmFields" disabled={ro || !cell.on}>
                <div className="pmBlock">
                  <b>Drepturi</b>
                  <label className="check"><input type="checkbox" checked disabled /> Vede</label>
                  {RIGHTS.filter(([k]) => (mod.rights as readonly string[]).includes(k)).map(([k, l]) => (
                    <label key={k} className="check"><input type="checkbox" checked={cell.r.includes(k as Right)} onChange={() => setCell({ r: toggle(cell.r, k as Right) })} /> {l}</label>
                  ))}
                </div>
                {scopeOf(mod) && (
                  <div className="pmBlock">
                    <b>Pe ce date</b>
                    <div className="segment" role="group" aria-label="Pe ce date">
                      {scopeOf(mod)!.map((l, i) => (
                        <button key={l} type="button" aria-pressed={!!cell.own === (i === 1)} onClick={() => setCell({ own: i === 1 })}>{l}</button>
                      ))}
                    </div>
                  </div>
                )}
                {spOf(mod).length > 0 && (
                  <div className="pmBlock">
                    <b>Acțiuni speciale</b>
                    {spOf(mod).map(([k, l]) => (
                      <label key={k} className="check"><input type="checkbox" checked={cell.sp.includes(k)} onChange={() => setCell({ sp: toggle(cell.sp, k) })} /> {l}</label>
                    ))}
                  </div>
                )}
              </fieldset>
              {props.edit && (
                <div className="pmBlock">
                  <b>Rolul</b>
                  <input className="input" value={role.name} onChange={(e) => setRoleName(e.target.value)} aria-label="Numele rolului" />
                  {!BUILTIN_ROLES.includes(role.id) && (
                    (props.counts[role.id] ?? 0) > 0
                      ? <p className="hint" style={{ margin: 0 }}>Rolul e dat la {props.counts[role.id]} {props.counts[role.id] === 1 ? "persoană" : "persoane"}: schimbă-le întâi rolul ca să-l poți șterge.</p>
                      : <button type="button" className="linkBtn" style={{ alignSelf: "flex-start", color: "var(--err)" }} onClick={removeRole}>Șterge rolul</button>
                  )}
                </div>
              )}
            </aside>
          )}
        </div>
      </section>

      <section className="card">
        <div className="cardHead">
          <div>
            <h2>Drepturi în echipa raportului</h2>
            <p className="hint" style={{ margin: "2px 0 0" }}>
              După rolul din raport, nu după rolul din firmă: același evaluator poate fi evaluator principal la un raport și doar inspector la altul.
              Cine are mai multe roluri pe același raport are drepturile cele mai largi. „Rapoarte: toate” din matrice trece peste aceste limite.
            </p>
          </div>
        </div>
        <div className="pmScroll">
          <table className="pmTeam">
            <thead><tr><th className="pmRole">Rol în raport</th>{TEAM_RIGHTS.map(([k, l]) => <th key={k} scope="col">{l}</th>)}<th scope="col">Onorariu</th></tr></thead>
            <tbody>
              {TEAM_ROLES.map(([t, l]) => (
                <tr key={t}>
                  <th scope="row" className="pmRole"><b>{l}</b></th>
                  {TEAM_RIGHTS.map(([k, kl]) => (
                    <td key={k}><input type="checkbox" checked={cfg.team[t].r.includes(k)} disabled={ro} onChange={() => setTeam(t, { r: toggle(cfg.team[t].r, k) })} aria-label={`${l} · ${kl}`} /></td>
                  ))}
                  <td>
                    <select className="select" value={cfg.team[t].fee} disabled={ro} onChange={(e) => setTeam(t, { fee: e.target.value as FeeView })} aria-label={`${l} · onorariu`}>
                      {FEE_VIEWS.map(([f, fl]) => <option key={f} value={f}>{fl}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="hint pad" style={{ margin: 0 }}>
          „Doar cota lui”: procentul de pe fișa utilizatorului (evaluator principal, verificator) sau tariful de inspecție, aplicat la onorariul fără TVA.
          Cine are „Onorarii: toate sumele” vede tot, oricare i-ar fi rolul în raport.
        </p>
      </section>

      {props.edit && (dirty || msg) && (
        <div className="pmSave" role="status">
          {msg ? <span className="error">{msg}</span> : <span>Ai modificări nesalvate.</span>}
          <button type="button" className="btn btnGhost btnSm" disabled={busy} onClick={() => { setCfg(props.initial); setMsg(null); }}>Renunță</button>
          <button type="button" className="btn btnGhost btnSm" disabled={busy} onClick={() => setCfg({ ...props.defaults, roles: [...props.defaults.roles, ...cfg.roles.filter((r) => !BUILTIN_ROLES.includes(r.id))] })}>Valorile inițiale</button>
          <button type="button" className="btn btnNavy btnSm" disabled={busy || !dirty} onClick={save}>{busy ? "Se salvează…" : "Salvează permisiunile"}</button>
        </div>
      )}
    </>
  );
}
