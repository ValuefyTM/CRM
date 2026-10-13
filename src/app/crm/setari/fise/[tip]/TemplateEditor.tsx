"use client";

import { useMemo, useState } from "react";
import type { SheetType } from "@/lib/insp-forms";
import { newQuestionKey, QKINDS, qKindLabel, templateStats, type QKind, type Template, type TplGroup, type TplQuestion } from "@/lib/insp-templates";

type Sel = { g: string; k: string | null } | null; // k null: a new question in group g

const optsKind = (k: QKind) => k === "one" || k === "many";
const summary = (q: TplQuestion) =>
  q.kind === "util" ? "Branșat · contor · distanță" : q.kind === "yn" ? "" : optsKind(q.kind) ? (q.opts ?? []).join(" · ") : q.unit ? `în ${q.unit}` : "";

/** Groups and questions of one inspection sheet: rename, reorder, hide, add (owner / admins). Saved as a whole. */
export function TemplateEditor({ type, label, back, initial, model, custom, edit }: {
  type: SheetType; label: string; back: string; initial: Template; model: Template; custom: boolean; edit: boolean;
}) {
  const [tpl, setTpl] = useState<Template>(initial);
  const [isCustom, setIsCustom] = useState(custom);
  const [open, setOpen] = useState<string | null>(initial[0]?.id ?? null);
  const [sel, setSel] = useState<Sel>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const stats = templateStats(tpl);
  const modelKeys = useMemo(() => new Set(model.flatMap((g) => g.questions.map((q) => q.k))), [model]);

  const change = (next: Template) => { setTpl(next); setDirty(true); setMsg(null); };
  const setGroup = (id: string, patch: Partial<TplGroup>) => change(tpl.map((g) => (g.id === id ? { ...g, ...patch } : g)));
  const moveGroup = (id: string, d: -1 | 1) => {
    const i = tpl.findIndex((g) => g.id === id), j = i + d;
    if (j < 0 || j >= tpl.length) return;
    const next = [...tpl]; [next[i], next[j]] = [next[j], next[i]]; change(next);
  };
  const moveQ = (gid: string, k: string, d: -1 | 1) => change(tpl.map((g) => {
    if (g.id !== gid) return g;
    const i = g.questions.findIndex((q) => q.k === k), j = i + d;
    if (j < 0 || j >= g.questions.length) return g;
    const qs = [...g.questions]; [qs[i], qs[j]] = [qs[j], qs[i]]; return { ...g, questions: qs };
  }));
  const toggleQ = (gid: string, k: string) => change(tpl.map((g) => (g.id === gid ? { ...g, questions: g.questions.map((q) => (q.k === k ? { ...q, hidden: !q.hidden } : q)) } : g)));
  const addGroup = () => {
    const title = prompt("Numele grupului nou:")?.trim();
    if (!title) return;
    const id = `g_${Date.now().toString(36)}`;
    change([...tpl, { id, title, custom: true, questions: [] }]);
    setOpen(id);
  };
  const removeGroup = (g: TplGroup) => {
    if (g.questions.some((q) => !q.custom)) return alert("Grupul are întrebări din modelul VALUEFY: mută-le sau ascunde grupul.");
    if (!confirm(`Ștergi grupul „${g.title}”${g.questions.length ? ` și cele ${g.questions.length} întrebări ale lui` : ""}?`)) return;
    change(tpl.filter((x) => x.id !== g.id));
  };

  const saveQuestion = (gid: string, q: TplQuestion, from: string | null) => {
    // Remove from its old place (the group may have changed), then put it in the chosen group.
    let next = tpl.map((g) => ({ ...g, questions: g.questions.filter((x) => x.k !== (from ?? q.k)) }));
    const oldGroup = from ? tpl.find((g) => g.questions.some((x) => x.k === from))?.id : null;
    next = next.map((g) => {
      if (g.id !== gid) return g;
      if (oldGroup === gid) {
        const at = tpl.find((x) => x.id === gid)!.questions.findIndex((x) => x.k === from);
        const qs = [...g.questions]; qs.splice(at, 0, q); return { ...g, questions: qs };
      }
      return { ...g, questions: [...g.questions, q] };
    });
    change(next);
    setSel(null);
    setOpen(gid);
  };
  const removeQuestion = (k: string) => { change(tpl.map((g) => ({ ...g, questions: g.questions.filter((q) => q.k !== k) }))); setSel(null); };

  const save = async () => {
    setBusy(true); setMsg(null);
    const r = await fetch(`/api/crm/insp-templates/${type}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ groups: tpl }) }).catch(() => null);
    const d = (await r?.json().catch(() => null)) as { tpl?: Template; error?: string } | null;
    setBusy(false);
    if (!r?.ok || !d?.tpl) return setMsg({ ok: false, text: d?.error ?? "Nu s-a putut salva. Încearcă din nou." });
    setTpl(d.tpl); setDirty(false); setIsCustom(true);
    setMsg({ ok: true, text: "Fișa a fost salvată. Se aplică fișelor începute de acum pe telefon." });
  };
  const reset = async () => {
    if (!confirm("Revii la modelul VALUEFY? Întrebările adăugate de voi și celelalte schimbări se pierd.")) return;
    setBusy(true); setMsg(null);
    const r = await fetch(`/api/crm/insp-templates/${type}`, { method: "DELETE" }).catch(() => null);
    const d = (await r?.json().catch(() => null)) as { tpl?: Template; error?: string } | null;
    setBusy(false);
    if (!r?.ok || !d?.tpl) return setMsg({ ok: false, text: d?.error ?? "Nu s-a putut face. Încearcă din nou." });
    setTpl(d.tpl); setDirty(false); setIsCustom(false); setSel(null);
    setMsg({ ok: true, text: "Fișa a revenit la modelul VALUEFY." });
  };

  const selected = sel ? (sel.k ? tpl.find((g) => g.id === sel.g)?.questions.find((q) => q.k === sel.k) ?? null : null) : null;

  return (
    <div className="tplWrap">
      <section className="card tplMain">
        <div className="cardHead">
          <h2><a href={back} className="muted">Fișe de inspecție</a> / {label}{isCustom && <span className="pill pillWarn">Personalizată</span>}</h2>
          <span className="muted">{stats.groups} grupuri · {stats.questions} întrebări{stats.custom ? ` · ${stats.custom} ale voastre` : ""}</span>
        </div>
        {!edit && <div className="note">Doar proprietarul și administratorii pot modifica fișele. Le vezi așa cum le completează inspectorii.</div>}

        <ol className="tplGroups">
          {tpl.map((g, gi) => {
            const isOpen = open === g.id;
            const visible = g.questions.filter((q) => !q.hidden).length;
            return (
              <li key={g.id} className={`tplGroup${g.hidden ? " off" : ""}${isOpen ? " open" : ""}`}>
                <div className="tplGroupHead">
                  <button type="button" className="tplGroupToggle" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : g.id)}>
                    <span className="tplN">{gi + 1}</span>
                    <b>{g.title}</b>
                    <small>{visible} întrebări{g.hidden ? " · grup ascuns" : ""}</small>
                  </button>
                  {edit && (
                    <span className="tplTools">
                      <button type="button" className="btn btnGhost btnSm" onClick={() => { const t = prompt("Numele grupului:", g.title)?.trim(); if (t) setGroup(g.id, { title: t }); }}>Redenumește</button>
                      <button type="button" className="btn btnGhost btnSm" onClick={() => setGroup(g.id, { hidden: !g.hidden })}>{g.hidden ? "Arată" : "Ascunde"}</button>
                      <button type="button" className="btn btnGhost btnSm" aria-label="Mută grupul mai sus" disabled={gi === 0} onClick={() => moveGroup(g.id, -1)}>↑</button>
                      <button type="button" className="btn btnGhost btnSm" aria-label="Mută grupul mai jos" disabled={gi === tpl.length - 1} onClick={() => moveGroup(g.id, 1)}>↓</button>
                      {g.custom && <button type="button" className="btn btnDanger btnSm" onClick={() => removeGroup(g)}>Șterge</button>}
                    </span>
                  )}
                </div>
                {isOpen && (
                  <ul className="tplQs">
                    {g.questions.map((q, qi) => {
                      const on = sel?.k === q.k;
                      return (
                        <li key={q.k} className={`${q.hidden ? "off" : ""}${on ? " on" : ""}${q.custom ? " mine" : ""}`}>
                          <span className="tplQText">
                            <span className="tplQLabel">
                              <b>{q.label}</b>
                              {q.custom && <span className="pill pillWarn">A voastră</span>}
                              {q.hidden && <span className="pill">Ascunsă</span>}
                              {q.req && <span className="pill pillErr">Obligatorie</span>}
                              {q.pdf === false && <span className="pill">Nu apare în PDF</span>}
                            </span>
                            <small>{qKindLabel(q.kind)}{summary(q) ? ` · ${summary(q)}` : ""}{q.other ? " · + Altele" : ""}{q.defaults?.length ? ` · implicit: ${q.defaults.join(", ")}` : ""}</small>
                          </span>
                          {edit && (
                            <span className="tplTools">
                              <button type="button" className="btn btnGhost btnSm" onClick={() => setSel({ g: g.id, k: q.k })}>Editează</button>
                              <button type="button" className="btn btnGhost btnSm" onClick={() => toggleQ(g.id, q.k)}>{q.hidden ? "Arată" : "Ascunde"}</button>
                              <button type="button" className="btn btnGhost btnSm" aria-label="Mai sus" disabled={qi === 0} onClick={() => moveQ(g.id, q.k, -1)}>↑</button>
                              <button type="button" className="btn btnGhost btnSm" aria-label="Mai jos" disabled={qi === g.questions.length - 1} onClick={() => moveQ(g.id, q.k, 1)}>↓</button>
                            </span>
                          )}
                        </li>
                      );
                    })}
                    {edit && <li className="tplAdd"><button type="button" className="btn btnGhost btnSm" onClick={() => setSel({ g: g.id, k: null })}>+ Întrebare în „{g.title}”</button></li>}
                  </ul>
                )}
              </li>
            );
          })}
        </ol>

        {edit && (
          <div className="actions" style={{ justifyContent: "space-between" }}>
            <span className="actions">
              <button type="button" className="btn btnGhost" onClick={addGroup}>+ Grup nou</button>
              {(isCustom || dirty) && <button type="button" className="btn btnGhost" onClick={reset} disabled={busy}>Modelul VALUEFY</button>}
            </span>
            <button type="button" className="btn btnGold" onClick={save} disabled={busy || !dirty}>{busy ? "Se salvează…" : dirty ? "Salvează fișa" : "Salvată"}</button>
          </div>
        )}
        {msg && <div role="status" className={msg.ok ? "okMsg" : "error"}>{msg.text}</div>}
      </section>

      {edit && sel && (
        <QuestionPanel
          key={`${sel.g}-${sel.k ?? "new"}`}
          groups={tpl.map((g) => [g.id, g.title])}
          group={sel.g}
          initial={selected}
          builtIn={!!selected && modelKeys.has(selected.k) && !selected.custom}
          onCancel={() => setSel(null)}
          onSave={(gid, q) => saveQuestion(gid, q, sel.k)}
          onRemove={selected?.custom ? () => removeQuestion(selected.k) : undefined}
        />
      )}
      {edit && !sel && (
        <aside className="card tplSide">
          <h2>Cum funcționează</h2>
          <ul className="tplHow">
            <li>Întrebările din modelul VALUEFY se pot redenumi, ascunde sau completa cu răspunsuri; tipul lor rămâne, pentru că alimentează caracteristicile proprietății din CRM.</li>
            <li>Întrebările voastre pot fi cu o variantă, mai multe, Da / Nu, număr, text sau fotografie.</li>
            <li>„Obligatorie” nu lasă inspectorul să trimită fișa fără răspuns. ★ marchează răspunsurile bifate implicit.</li>
            <li>Nu uita să apeși „Salvează fișa”.</li>
          </ul>
        </aside>
      )}
    </div>
  );
}

function QuestionPanel({ groups, group, initial, builtIn, onCancel, onSave, onRemove }: {
  groups: [string, string][]; group: string; initial: TplQuestion | null; builtIn: boolean;
  onCancel: () => void; onSave: (group: string, q: TplQuestion) => void; onRemove?: () => void;
}) {
  const [q, setQ] = useState<TplQuestion>(initial ?? { k: newQuestionKey(), label: "", kind: "one", opts: [], custom: true, pdf: true });
  const [gid, setGid] = useState(group);
  const [opt, setOpt] = useState("");
  const [err, setErr] = useState("");
  const set = (patch: Partial<TplQuestion>) => setQ({ ...q, ...patch });
  const hasOpts = optsKind(q.kind);
  const opts = q.opts ?? [];
  const defaults = q.defaults ?? [];

  const addOpt = () => {
    const v = opt.trim();
    if (!v || opts.includes(v)) return setOpt("");
    set({ opts: [...opts, v] }); setOpt("");
  };
  const toggleDefault = (o: string) => set({ defaults: defaults.includes(o) ? defaults.filter((x) => x !== o) : q.kind === "one" ? [o] : [...defaults, o] });
  const moveOpt = (i: number, d: -1 | 1) => { const j = i + d; if (j < 0 || j >= opts.length) return; const n = [...opts]; [n[i], n[j]] = [n[j], n[i]]; set({ opts: n }); };
  const submit = () => {
    if (!q.label.trim()) return setErr("Scrie întrebarea.");
    if (hasOpts && !opts.length) return setErr("Adaugă cel puțin un răspuns.");
    onSave(gid, { ...q, label: q.label.trim(), opts: hasOpts ? opts : q.kind === "yn" ? ["Da", "Nu"] : undefined, defaults: hasOpts ? defaults.filter((d) => opts.includes(d)) : undefined });
  };

  return (
    <aside className="card tplSide tplEdit" aria-label="Întrebare">
      <div className="cardHead">
        <h2>{initial ? "Editează întrebarea" : "Întrebare nouă"}</h2>
        <button type="button" className="btn btnGhost btnSm" onClick={onCancel} aria-label="Închide">×</button>
      </div>
      <label className="field">Întrebarea
        <input className="input" value={q.label} onChange={(e) => set({ label: e.target.value })} placeholder="ex. Interfon / acces controlat" autoFocus />
      </label>
      <label className="field">Grupul
        <select className="select" value={gid} onChange={(e) => setGid(e.target.value)}>
          {groups.map(([id, t]) => <option key={id} value={id}>{t}</option>)}
        </select>
      </label>
      <div className="field">Cum se răspunde
        {builtIn ? (
          <span className="hint">{qKindLabel(q.kind)} (întrebare din modelul VALUEFY: tipul nu se schimbă)</span>
        ) : (
          <div className="segment tplKinds" role="group" aria-label="Tipul răspunsului">
            {QKINDS.map(([k, l]) => (
              <button key={k} type="button" aria-pressed={q.kind === k} onClick={() => set({ kind: k, defaults: [], ...(optsKind(k) && !q.opts?.length ? { opts: [] } : {}) })}>{l}</button>
            ))}
          </div>
        )}
      </div>
      {hasOpts && (
        <div className="field">
          <span className="tplOptHead"><span>Răspunsuri</span><small>★ = bifat implicit</small></span>
          <ul className="tplOpts">
            {opts.map((o, i) => (
              <li key={o}>
                <span>{o}</span>
                <button type="button" className={`tplStar${defaults.includes(o) ? " on" : ""}`} aria-pressed={defaults.includes(o)} aria-label={`Bifat implicit: ${o}`} onClick={() => toggleDefault(o)}>★</button>
                <button type="button" className="btn btnGhost btnSm" aria-label="Mai sus" disabled={i === 0} onClick={() => moveOpt(i, -1)}>↑</button>
                <button type="button" className="btn btnGhost btnSm" aria-label={`Șterge răspunsul ${o}`} onClick={() => set({ opts: opts.filter((x) => x !== o), defaults: defaults.filter((x) => x !== o) })}>×</button>
              </li>
            ))}
          </ul>
          <span className="tplOptAdd">
            <input className="input" value={opt} onChange={(e) => setOpt(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addOpt(); } }} placeholder="Răspuns nou" aria-label="Răspuns nou" />
            <button type="button" className="btn btnGhost btnSm" onClick={addOpt}>+ Adaugă</button>
          </span>
        </div>
      )}
      {(q.kind === "num" || q.kind === "int") && !builtIn && (
        <label className="field">Unitate de măsură (opțional)<input className="input" value={q.unit ?? ""} onChange={(e) => set({ unit: e.target.value.slice(0, 10) })} placeholder="ex. m², m, buc." /></label>
      )}
      <div className="tplChecks">
        <label className="check"><input type="checkbox" checked={!!q.req} onChange={(e) => set({ req: e.target.checked })} />Obligatorie la trimitere</label>
        <label className="check"><input type="checkbox" checked={q.pdf !== false} onChange={(e) => set({ pdf: e.target.checked })} />Apare în fișa finală (PDF)</label>
        {hasOpts && <label className="check"><input type="checkbox" checked={!!q.other} onChange={(e) => set({ other: e.target.checked })} />Câmp „Altele” cu text liber</label>}
      </div>
      {err && <div role="alert" className="error">{err}</div>}
      <div className="actions" style={{ justifyContent: "space-between" }}>
        {onRemove ? <button type="button" className="btn btnDanger" onClick={() => { if (confirm("Ștergi întrebarea? Răspunsurile date deja în fișe rămân în fișele acelea.")) onRemove(); }}>Șterge</button> : <span />}
        <span className="actions">
          <button type="button" className="btn btnGhost" onClick={onCancel}>Renunță</button>
          <button type="button" className="btn btnNavy" onClick={submit}>{initial ? "Aplică" : "Adaugă întrebarea"}</button>
        </span>
      </div>
      <p className="hint">Schimbările intră în fișă când apeși „Salvează fișa”.</p>
    </aside>
  );
}
