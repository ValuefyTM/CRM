"use client";
// The list of alert rules: each one a card with the situation, the delay, the recipients, the scope and the places it
// shows. Saved all at once.
import { useState } from "react";
import { ALERT_KINDS, ALERT_TO, DAY_CHOICES, EVERY_CHOICES, newRuleId, type AlertKind, type AlertRule } from "@/lib/alert-kinds";

type Scope = { v: string; label: string; group: string };
type Person = { id: string; name: string; role: string };

const KINDS = Object.entries(ALERT_KINDS) as [AlertKind, (typeof ALERT_KINDS)[AlertKind]][];
const GROUPS = [...new Set(KINDS.map(([, k]) => k.group))];

function Rule({ r, edit, people, scopes, onChange, onRemove }: { r: AlertRule; edit: boolean; people: Person[]; scopes: Scope[]; onChange: (r: AlertRule) => void; onRemove: () => void }) {
  const k = ALERT_KINDS[r.kind];
  const [more, setMore] = useState(r.scope.length > 0 || r.to.some((t) => t.startsWith("u:")) || !!r.title);
  const pick = (kind: AlertKind, to: string[]) => (ALERT_KINDS[kind].roles.includes("assigned") && !to.length ? ["assigned"] : to);
  const set = (p: Partial<AlertRule>) => onChange({ ...r, ...p });
  const toggle = (list: string[], v: string, on: boolean) => (on ? [...new Set([...list, v])] : list.filter((x) => x !== v));
  const customDays = !DAY_CHOICES.some(([d]) => d === r.days);
  return (
    <article className={`alRule${r.enabled ? "" : " off"}`}>
      <header className="alHead">
        <label className="alSwitch" title={r.enabled ? "Activă" : "Oprită"}>
          <input type="checkbox" checked={r.enabled} disabled={!edit} onChange={(e) => set({ enabled: e.target.checked })} /><i />
        </label>
        <select className="select alKind" value={r.kind} disabled={!edit} onChange={(e) => { const kind = e.target.value as AlertKind; set({ kind, to: pick(kind, r.to.filter((t) => ALERT_KINDS[kind].roles.includes(t) || t.startsWith("u:"))) }); }}>
          {GROUPS.map((g) => <optgroup key={g} label={g}>{KINDS.filter(([, x]) => x.group === g).map(([key, x]) => <option key={key} value={key}>{x.label}</option>)}</optgroup>)}
        </select>
        <span className={`pill ${k.tone === "err" ? "late" : k.tone === "warn" ? "wait" : "ok"}`}><i />{k.lasting ? "până se rezolvă" : "o singură dată"}</span>
        {edit && <button type="button" className="btn btnGhost btnSm alDel" onClick={onRemove} aria-label="Șterge alerta">Șterge</button>}
      </header>
      <p className="hint alHint">{k.hint}.</p>
      <div className="alGrid">
        <label className="field">Când
          <span className="alWhen">
            <select className="select" value={customDays ? "custom" : String(r.days)} disabled={!edit} onChange={(e) => { if (e.target.value !== "custom") set({ days: Number(e.target.value) }); else set({ days: 10 }); }}>
              {DAY_CHOICES.map(([d, l]) => <option key={d} value={d}>{l}</option>)}
              <option value="custom">alt număr de zile…</option>
            </select>
            {customDays && <input className="input alDays" type="number" min={0} max={365} value={r.days} disabled={!edit} onChange={(e) => set({ days: Math.max(0, Math.min(365, Number(e.target.value) || 0)) })} aria-label="Zile" />}
          </span>
          <small className="muted">{k.from}</small>
          {k.lasting && (
            <span className="alWhen" style={{ marginTop: 6 }}>
              <select className="select" value={String(r.every ?? 0)} disabled={!edit} onChange={(e) => set({ every: Number(e.target.value) || undefined })} aria-label="Repetă">
                {EVERY_CHOICES.map(([h, l]) => <option key={h} value={h}>{h ? `repetă ${l}` : "o singură dată"}</option>)}
              </select>
            </span>
          )}
          {k.lasting && !!r.every && <small className="muted">cât timp situația durează</small>}
        </label>
        <fieldset className="field alTo">
          <legend>Cui</legend>
          {ALERT_TO.filter(([key]) => k.roles.includes(key)).map(([key, l, sub]) => (
            <label key={key} className="alCheck" title={sub}>
              <input type="checkbox" checked={r.to.includes(key)} disabled={!edit} onChange={(e) => set({ to: toggle(r.to, key, e.target.checked) })} /> {l}
            </label>
          ))}
          {r.to.filter((t) => t.startsWith("u:")).length > 0 && !more && <small className="muted">+ {r.to.filter((t) => t.startsWith("u:")).length} persoane anume</small>}
        </fieldset>
        <label className="field">Unde
          <span className="alCheck"><input type="checkbox" checked disabled /> Clopoțel și telefon</span>
          <span className="alCheck"><input type="checkbox" checked={r.dashboard} disabled={!edit} onChange={(e) => set({ dashboard: e.target.checked })} /> Și pe tabloul de bord</span>
          <span className="alCheck"><input type="checkbox" checked={!!r.email} disabled={!edit} onChange={(e) => set({ email: e.target.checked })} /> Și pe email</span>
        </label>
      </div>
      <button type="button" className="linkBtn alMore" onClick={() => setMore((x) => !x)}>{more ? "▾ Mai puține opțiuni" : "▸ Persoane anume, doar anumite contracte, titlu propriu"}</button>
      {more && (
        <div className="alGrid alMoreGrid">
          <fieldset className="field alTo">
            <legend>Persoane anume</legend>
            <div className="alList">
              {people.map((p) => (
                <label key={p.id} className="alCheck"><input type="checkbox" checked={r.to.includes(`u:${p.id}`)} disabled={!edit} onChange={(e) => set({ to: toggle(r.to, `u:${p.id}`, e.target.checked) })} /> {p.name}</label>
              ))}
            </div>
          </fieldset>
          <fieldset className="field alTo">
            <legend>Doar pentru</legend>
            <label className="alCheck"><input type="radio" name={`sc-${r.id}`} checked={!r.scope.length} disabled={!edit} onChange={() => set({ scope: [] })} /> Toate lucrările</label>
            <label className="alCheck"><input type="radio" name={`sc-${r.id}`} checked={r.scope.length > 0} disabled={!edit} onChange={() => set({ scope: r.scope.length ? r.scope : [scopes[0]?.v].filter(Boolean) })} /> Anumite contracte / colaborări</label>
            {r.scope.length > 0 && (
              <div className="alList">
                {[...new Set(scopes.map((s) => s.group))].map((g) => (
                  <div key={g}><small className="muted">{g}</small>
                    {scopes.filter((s) => s.group === g).map((s) => (
                      <label key={s.v} className="alCheck"><input type="checkbox" checked={r.scope.includes(s.v)} disabled={!edit} onChange={(e) => set({ scope: toggle(r.scope, s.v, e.target.checked) })} /> {s.label}</label>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </fieldset>
          <label className="field">Titlu propriu
            <input className="input" value={r.title ?? ""} maxLength={80} disabled={!edit} placeholder={k.label} onChange={(e) => set({ title: e.target.value || undefined })} />
            <small className="muted">cum apare în clopoțel și pe tablou</small>
          </label>
        </div>
      )}
    </article>
  );
}

export function AlertsEditor({ edit, initial, people, scopes }: { edit: boolean; initial: AlertRule[]; people: Person[]; scopes: Scope[] }) {
  const [rules, setRules] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [dirty, setDirty] = useState(false);
  const update = (next: AlertRule[]) => { setRules(next); setDirty(true); setMsg(null); };
  const add = () => update([...rules, { id: newRuleId(), kind: "uncollected_after_insp", days: 1, to: ["evaluator", "ops"], scope: [], dashboard: true, enabled: true }]);
  const save = async () => {
    setBusy(true); setMsg(null);
    const r = await fetch("/api/crm/settings/alerts", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rules }) }).catch(() => null);
    const j = (await r?.json().catch(() => null)) as { ok?: boolean; error?: string; rules?: AlertRule[] } | null;
    setBusy(false);
    if (r?.ok && j?.ok) { setMsg({ ok: true, text: "Alertele au fost salvate." }); setDirty(false); if (j.rules) setRules(j.rules); }
    else setMsg({ ok: false, text: j?.error ?? "Nu am putut salva alertele." });
  };
  return (
    <section className="card">
      <div className="cardHead"><h2>Alerte</h2><span className="muted">{rules.filter((r) => r.enabled).length} active</span></div>
      {rules.length === 0 && <p className="hint">Nicio alertă. Adaugă una mai jos.</p>}
      <div className="alRules">
        {rules.map((r) => (
          <Rule key={r.id} r={r} edit={edit} people={people} scopes={scopes} onChange={(x) => update(rules.map((y) => (y.id === r.id ? x : y)))} onRemove={() => update(rules.filter((y) => y.id !== r.id))} />
        ))}
      </div>
      {msg && <div role={msg.ok ? "status" : "alert"} className={msg.ok ? "note" : "error"}>{msg.text}</div>}
      {edit && (
        <div className="actions">
          <button type="button" className="btn btnGhost" onClick={add}>+ Adaugă alertă</button>
          <button type="button" className="btn btnGold" disabled={busy || !dirty} onClick={save}>{busy ? "Se salvează…" : "Salvează alertele"}</button>
        </div>
      )}
    </section>
  );
}
