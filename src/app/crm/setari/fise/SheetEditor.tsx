"use client";
// Setări → Fișe de inspecție, as in UVALO: the sheets on the left (one per property type, then the firm's own: new ones are
// copies of a sheet, renamed and deleted here), the selected sheet in the middle
// (groups that open, questions to pick, reorder, hide or delete) and the selected question on the right (text, kind, preset
// answers with the default, composite follow-ups, required / in PDF / photo). Built-in questions (the VALUEFY model) keep their
// kind and can be hidden; the firm's own can be changed freely. Saved as a whole; applies to sheets started from now on (and,
// with inspections through UVALO, the sheet is sent there too).
import { Fragment, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { SheetType, SubField, SubKind } from "@/lib/insp-forms";
import { newQuestionKey, QKINDS, qKindLabel, SUBKINDS, templateStats, type QKind, type Template, type TplQuestion } from "@/lib/insp-templates";

export type SheetItem = { t: string; base: SheetType; builtin: boolean; label: string; tpl: Template; model: Template; custom: boolean; synced: string | null; syncError: string | null };

const hasOpts = (k: QKind) => k === "one" || k === "many" || k === "comp";
const rid = () => Math.random().toString(36).slice(2, 7);
const when = (iso: string) => new Date(iso).toLocaleString("ro-RO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).replace(".", "");

export function SheetEditor({ items: given, start, edit, uvalo }: { items: SheetItem[]; start: string; edit: boolean; uvalo: boolean }) {
  const router = useRouter();
  const [items, setItems] = useState(given);
  const [sel, setSel] = useState<string>(items.some((x) => x.t === start) ? start : items[0].t);
  const [making, setMaking] = useState<{ name: string; from: string; model: boolean } | null>(null);
  const [naming, setNaming] = useState<string | null>(null);
  const cur = items.find((x) => x.t === sel)!;
  const [tpl, setTpl] = useState<Template>(cur.tpl);
  const [custom, setCustom] = useState(cur.custom);
  const [open, setOpen] = useState(0);
  const [q, setQ] = useState<[number, number] | null>(null);
  const [changed, setChanged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const model = useMemo(() => new Set(cur.model.flatMap((g) => g.questions.map((x) => x.k))), [cur]);
  const stats = templateStats(tpl);
  const ro = !edit;

  const choose = (t: string) => {
    if (t === sel) return;
    if (changed && !confirm("Ai modificări nesalvate. Le pierzi?")) return;
    const x = items.find((i) => i.t === t)!;
    setSel(t); setTpl(x.tpl); setCustom(x.custom); setOpen(0); setQ(null); setChanged(false); setMsg(null);
    history.replaceState(null, "", `?tip=${t}`);
  };
  const change = (f: (t: Template) => Template) => { setTpl((t) => f(structuredClone(t))); setChanged(true); setMsg(null); };
  const moveG = (i: number, d: number) => change((t) => { const j = i + d; if (j >= 0 && j < t.length) [t[i], t[j]] = [t[j], t[i]]; return t; });
  const moveQ = (gi: number, i: number, d: number) => { change((t) => { const a = t[gi].questions, j = i + d; if (j >= 0 && j < a.length) { [a[i], a[j]] = [a[j], a[i]]; } return t; }); if (q && q[0] === gi && q[1] === i) setQ([gi, Math.max(0, Math.min(tpl[gi].questions.length - 1, i + d))]); };
  const qq: TplQuestion | null = q ? tpl[q[0]]?.questions[q[1]] ?? null : null;
  const builtIn = !!qq && !qq.custom && model.has(qq.k);
  const setQq = (f: (x: TplQuestion) => void) => q && change((t) => { f(t[q[0]].questions[q[1]]); return t; });
  const add = (gi: number, kind: QKind) => {
    change((t) => { t[gi].questions.push({ k: newQuestionKey(), label: kind === "comp" ? "Întrebare compusă" : "Întrebare nouă", kind, opts: ["Da", "Nu"], custom: true, ...(kind === "comp" ? { sub: {} } : { req: true }) }); return t; });
    setQ([gi, tpl[gi].questions.length]);
  };

  async function create() {
    if (!making) return;
    setBusy(true); setMsg(null);
    const r = await fetch("/api/crm/insp-templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(making) }).catch(() => null);
    const d = (await r?.json().catch(() => null)) as { key?: string; base?: SheetType; name?: string; tpl?: Template; model?: Template; error?: string } | null;
    setBusy(false);
    if (!r?.ok || !d?.key || !d.tpl || !d.model || !d.base) return setMsg({ ok: false, t: d?.error ?? "Fișa nu s-a putut crea." });
    const item: SheetItem = { t: d.key, base: d.base, builtin: false, label: d.name ?? making.name, tpl: d.tpl, model: d.model, custom: true, synced: null, syncError: null };
    setItems((l) => [...l, item]);
    setMaking(null);
    setSel(item.t); setTpl(item.tpl); setCustom(true); setOpen(0); setQ(null); setChanged(false);
    history.replaceState(null, "", `?tip=${item.t}`);
    setMsg({ ok: true, t: `Fișa „${item.label}” a fost creată. O poți aloca la inspecții${uvalo ? " și a fost trimisă în UVALO" : ""}.` });
  }
  async function rename() {
    const name = naming?.trim();
    if (!name || name === cur.label) return setNaming(null);
    setBusy(true); setMsg(null);
    const r = await fetch(`/api/crm/insp-templates/${sel}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) }).catch(() => null);
    const d = (await r?.json().catch(() => null)) as { name?: string; error?: string } | null;
    setBusy(false);
    if (!r?.ok) return setMsg({ ok: false, t: d?.error ?? "Nu s-a putut redenumi." });
    setItems((l) => l.map((x) => (x.t === sel ? { ...x, label: d?.name ?? name } : x)));
    setNaming(null);
    setMsg({ ok: true, t: "Fișa a fost redenumită." });
  }
  async function remove() {
    if (!confirm(`Ștergi fișa „${cur.label}”? Inspecțiile care au folosit-o o păstrează; nu se mai poate alege la inspecții noi.`)) return;
    setBusy(true);
    const r = await fetch(`/api/crm/insp-templates/${sel}?sterge=1`, { method: "DELETE" }).catch(() => null);
    setBusy(false);
    if (!r?.ok) return setMsg({ ok: false, t: ((await r?.json().catch(() => null)) as { error?: string } | null)?.error ?? "Nu s-a putut șterge." });
    const rest = items.filter((x) => x.t !== sel);
    setItems(rest);
    const x = rest[0];
    setSel(x.t); setTpl(x.tpl); setCustom(x.custom); setOpen(0); setQ(null); setChanged(false);
    history.replaceState(null, "", `?tip=${x.t}`);
    setMsg({ ok: true, t: "Fișa a fost ștearsă." });
    router.refresh();
  }

  async function send(method: "PUT" | "DELETE") {
    setBusy(true); setMsg(null);
    const r = await fetch(`/api/crm/insp-templates/${sel}`, { method, headers: { "Content-Type": "application/json" }, body: method === "PUT" ? JSON.stringify({ groups: tpl }) : undefined }).catch(() => null);
    const d = (await r?.json().catch(() => null)) as { tpl?: Template; custom?: boolean; error?: string } | null;
    setBusy(false);
    if (!r?.ok || !d?.tpl) return setMsg({ ok: false, t: d?.error ?? "Nu s-a putut salva. Încearcă din nou." });
    cur.tpl = d.tpl; cur.custom = method === "PUT";
    setTpl(d.tpl); setCustom(method === "PUT"); setChanged(false); setQ(null);
    setMsg({ ok: true, t: method === "PUT" ? `Fișa a fost salvată. Se aplică fișelor începute de acum${uvalo ? " și a fost trimisă în UVALO" : ""}.` : "Fișa a revenit la modelul VALUEFY." });
  }

  return (
    <div className="seTplPage">
      <aside className="seTplList">
        <span className="eyebrow">Fișe de inspecție</span>
        {items.map((x, i) => {
          const s = templateStats(x.t === sel ? tpl : x.tpl);
          const head = i > 0 && !x.builtin && items[i - 1].builtin ? <small className="seTplSep">Fișele firmei</small> : null;
          return (
            <Fragment key={x.t}>{head}
            <button type="button" aria-pressed={sel === x.t} onClick={() => choose(x.t)}>
              <b>{x.label}</b>
              <small>{s.questions} întrebări · {(x.t === sel ? custom : x.custom) ? "personalizată" : "modelul VALUEFY"}{x.t === sel && changed ? " · nesalvată" : ""}</small>
              {uvalo && <small className={x.syncError ? "errTxt" : ""}>{x.syncError ? `UVALO: ${x.syncError}` : x.synced ? `în UVALO · ${when(x.synced)}` : "netrimisă în UVALO"}</small>}
            </button>
            </Fragment>
          );
        })}
        {!ro && (making ? (
          <div className="seTplNew">
            <label className="field">Numele fișei<input className="input" autoFocus value={making.name} placeholder="ex. Apartament credit ipotecar" onChange={(e) => setMaking({ ...making, name: e.target.value })} onKeyDown={(e) => e.key === "Enter" && create()} /></label>
            <label className="field">Pornește de la
              <select className="select" value={making.from} onChange={(e) => setMaking({ ...making, from: e.target.value })}>
                {items.map((x) => <option key={x.t} value={x.t}>{x.label}</option>)}
              </select>
            </label>
            <label className="check"><input type="checkbox" checked={making.model} onChange={(e) => setMaking({ ...making, model: e.target.checked })} /> modelul VALUEFY, fără modificările firmei</label>
            <span className="seTplNewActs">
              <button type="button" className="btn btnGold btnSm" disabled={busy || !making.name.trim()} onClick={create}>Creează fișa</button>
              <button type="button" className="btn btnGhost btnSm" onClick={() => setMaking(null)}>Renunță</button>
            </span>
          </div>
        ) : <button type="button" className="btn btnGhost btnSm seTplAdd" onClick={() => setMaking({ name: "", from: sel, model: false })}>+ Fișă nouă</button>)}
        <small className="hint">O fișă nouă pornește ca o copie a altei fișe; tipul ei (apartament, casă, teren…) dă coloanele CRM, încăperile și fotografiile cerute. {uvalo ? "Fișele se modifică doar aici; în UVALO apar ca fișele firmei." : ""}</small>
      </aside>

      <section className="card seTplEdit">
        <div className="seTplHead">
          {naming != null ? (
            <span className="seTplRename">
              <input className="input" autoFocus value={naming} aria-label="Numele fișei" onChange={(e) => setNaming(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") rename(); if (e.key === "Escape") setNaming(null); }} />
              <button type="button" className="btn btnGold btnSm" disabled={busy || !naming.trim()} onClick={rename}>Salvează</button>
              <button type="button" className="btn btnGhost btnSm" onClick={() => setNaming(null)}>Renunță</button>
            </span>
          ) : <h2>{cur.label}{!ro && <button type="button" className="seTplPen" aria-label="Redenumește fișa" title="Redenumește fișa" onClick={() => setNaming(cur.label)}>✎</button>}</h2>}
          {!cur.builtin && <span className="seTplTag">fișă {items.find((x) => x.builtin && x.base === cur.base)?.label.toLowerCase() ?? cur.base}</span>}
          <span className="seTplTag">{changed ? "Modificări nesalvate" : custom ? "Personalizată" : "Modelul VALUEFY"}</span>
        </div>
        <p className="hint">{stats.groups} grupuri · {stats.questions} întrebări{stats.custom ? ` · ${stats.custom} adăugate de voi` : ""}{stats.hidden ? ` · ${stats.hidden} ascunse` : ""}. Întrebările din model își păstrează tipul (din ele se completează coloanele CRM); le poți redenumi, schimba răspunsurile sau ascunde.</p>

        {tpl.map((g, gi) => (
          <div key={g.id} className={`seGrp${g.hidden ? " off" : ""}`}>
            <div className="seGrpHead">
              <button type="button" className="seGrpToggle" aria-expanded={open === gi} aria-label={open === gi ? "Închide grupul" : "Deschide grupul"} onClick={() => setOpen(open === gi ? -1 : gi)}>{open === gi ? "▾" : "▸"}</button>
              {ro ? <b>{g.title}</b> : <input className="input seGrpName" value={g.title} aria-label="Numele grupului" onChange={(e) => change((t) => { t[gi].title = e.target.value; return t; })} />}
              <small>{g.questions.filter((x) => !x.hidden).length} întrebări{g.hidden ? " · ascuns" : ""}</small>
              {!ro && <span className="seMini">
                <button type="button" aria-label="Mută grupul în sus" onClick={() => moveG(gi, -1)}>↑</button>
                <button type="button" aria-label="Mută grupul în jos" onClick={() => moveG(gi, 1)}>↓</button>
                {g.custom && !g.questions.some((x) => !x.custom)
                  ? <button type="button" aria-label="Șterge grupul" onClick={() => confirm(`Ștergi grupul „${g.title}”?`) && (change((t) => { t.splice(gi, 1); return t; }), setQ(null))}>×</button>
                  : <button type="button" aria-label={g.hidden ? "Arată grupul" : "Ascunde grupul"} title={g.hidden ? "Arată grupul" : "Ascunde grupul"} onClick={() => change((t) => { t[gi].hidden = !t[gi].hidden || undefined; return t; })}>{g.hidden ? "◌" : "◉"}</button>}
              </span>}
            </div>
            {open === gi && (
              <div className="seQs">
                {g.questions.map((x, qi) => (
                  <div key={x.k} className={`seQ${q && q[0] === gi && q[1] === qi ? " on" : ""}${x.hidden ? " off" : ""}`}>
                    <button type="button" className="seQMain" onClick={() => setQ([gi, qi])}>
                      <span>{x.label}</span>
                      <small>{qKindLabel(x.kind)}{x.req ? " · obligatorie" : ""}{x.hidden ? " · ascunsă" : ""}{x.custom ? "" : " · model"}</small>
                    </button>
                    {!ro && <span className="seMini">
                      <button type="button" aria-label="Mută în sus" onClick={() => moveQ(gi, qi, -1)}>↑</button>
                      <button type="button" aria-label="Mută în jos" onClick={() => moveQ(gi, qi, 1)}>↓</button>
                      {x.custom
                        ? <button type="button" aria-label="Șterge întrebarea" onClick={() => { change((t) => { t[gi].questions.splice(qi, 1); return t; }); setQ(null); }}>×</button>
                        : <button type="button" aria-label={x.hidden ? "Arată întrebarea" : "Ascunde întrebarea"} title={x.hidden ? "Arată" : "Ascunde"} onClick={() => change((t) => { t[gi].questions[qi].hidden = !t[gi].questions[qi].hidden || undefined; return t; })}>{x.hidden ? "◌" : "◉"}</button>}
                    </span>}
                  </div>
                ))}
                {!ro && <span className="seQAdd">
                  <button type="button" className="btn btnGhost btnSm" onClick={() => add(gi, "one")}>+ Întrebare</button>
                  <button type="button" className="btn btnGhost btnSm" title="O alegere care, după răspuns, mai pune câteva întrebări (ca la branșamente)" onClick={() => add(gi, "comp")}>+ Întrebare compusă</button>
                </span>}
              </div>
            )}
          </div>
        ))}
        {!ro && <button type="button" className="btn btnGhost btnSm" onClick={() => { change((t) => { t.push({ id: `g_${rid()}`, title: "Grup nou", custom: true, questions: [] }); return t; }); setOpen(tpl.length); }}>+ Grup</button>}

        {msg && <p className={msg.ok ? "okTxt" : "errTxt"} role="status">{msg.t}</p>}
        {!ro && (
          <div className="actions">
            <button type="button" className="btn btnGold" disabled={busy || !changed} onClick={() => send("PUT")}>{busy ? "Se salvează…" : "Salvează fișa"}</button>
            {changed && <button type="button" className="btn btnGhost" disabled={busy} onClick={() => { setTpl(cur.tpl); setChanged(false); setQ(null); setMsg(null); }}>Renunță la modificări</button>}
            {custom && <button type="button" className="btn btnDanger" disabled={busy} onClick={() => confirm("Revii la modelul VALUEFY? Întrebările adăugate de voi și schimbările se pierd.") && send("DELETE")}>Revino la modelul VALUEFY</button>}
            {!cur.builtin && <button type="button" className="btn btnDanger" disabled={busy} onClick={remove}>Șterge fișa</button>}
          </div>
        )}
        <p className="hint">Fișele începute își păstrează forma; schimbările se aplică fișelor începute de acum.</p>
      </section>

      <aside className="card seQEdit">
        <span className="eyebrow">Întrebarea selectată</span>
        {!qq ? <p className="hint">Alege o întrebare din fișă.</p> : (
          <>
            <label className="field">Întrebarea<input className="input" value={qq.label} disabled={ro} onChange={(e) => setQq((x) => { x.label = e.target.value; })} /></label>
            <label className="field">Tipul răspunsului
              {builtIn || qq.kind === "util"
                ? <span className="seKindLocked">{qKindLabel(qq.kind)} <small>· din modelul VALUEFY, nu se schimbă</small></span>
                : <select className="select" value={qq.kind} disabled={ro} onChange={(e) => setQq((x) => {
                    x.kind = e.target.value as QKind;
                    if (hasOpts(x.kind) && !x.opts?.length) x.opts = ["Da", "Nu"];
                    if (x.kind === "comp") x.sub ??= {}; else delete x.sub;
                    if (!hasOpts(x.kind)) { delete x.opts; delete x.defaults; delete x.other; }
                  })}>
                    {QKINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </select>}
            </label>
            {hasOpts(qq.kind) && (
              <div className="seOpts">
                <span className="field">Răspunsuri precompletate <small>bifa = răspunsul implicit</small></span>
                {(qq.opts ?? []).map((o, i) => (
                  <div key={i} className="seOpt">
                    <input type={qq.kind === "many" ? "checkbox" : "radio"} name="def" aria-label="Implicit" checked={!!qq.defaults?.includes(o)} disabled={ro || !o}
                      onChange={(e) => setQq((x) => { x.defaults = qq.kind === "many" ? (e.target.checked ? [...(x.defaults ?? []), o] : (x.defaults ?? []).filter((d) => d !== o)) : [o]; })} />
                    <input className="input" value={o} disabled={ro} aria-label="Răspuns" onChange={(e) => setQq((x) => {
                      const nv = e.target.value;
                      if (x.defaults?.includes(o)) x.defaults = x.defaults.map((d) => (d === o ? nv : d));
                      if (x.sub?.[o] && !x.sub[nv]) { x.sub[nv] = x.sub[o]; delete x.sub[o]; } // follow-ups move with the renamed answer
                      x.opts![i] = nv;
                    })} />
                    {!ro && <button type="button" className="btn btnGhost btnSm" aria-label="Scoate răspunsul" onClick={() => setQq((x) => { x.opts!.splice(i, 1); x.defaults = x.defaults?.filter((d) => d !== o); if (x.sub) delete x.sub[o]; })}>×</button>}
                  </div>
                ))}
                {!ro && <button type="button" className="btn btnGhost btnSm" onClick={() => setQq((x) => { x.opts = [...(x.opts ?? []), ""]; })}>+ Răspuns</button>}
                {qq.kind !== "comp" && <label className="check"><input type="checkbox" checked={!!qq.other} disabled={ro} onChange={(e) => setQq((x) => { x.other = e.target.checked || undefined; })} /> „Altele”, cu text liber</label>}
              </div>
            )}
            {qq.kind === "comp" && (qq.opts ?? []).filter(Boolean).map((o) => (
              <div key={o} className="seSubEd">
                <span className="field">Dacă răspunsul e „{o}”, întreabă și:</span>
                {(qq.sub?.[o] ?? []).map((sq: SubField, si) => (
                  <div key={sq.k} className="seSubQ">
                    <span className="seSubRow">
                      <input className="input" value={sq.label} disabled={ro} placeholder="ex. Apometru montat" aria-label="Întrebarea" onChange={(e) => setQq((x) => { x.sub![o][si].label = e.target.value; })} />
                      {!ro && <button type="button" className="btn btnGhost btnSm" aria-label="Scoate întrebarea" onClick={() => setQq((x) => { x.sub![o].splice(si, 1); })}>×</button>}
                    </span>
                    <span className="seSubRow">
                      <select className="select" value={sq.kind} disabled={ro} aria-label="Tipul răspunsului" onChange={(e) => setQq((x) => { const y = x.sub![o][si]; y.kind = e.target.value as SubKind; if ((y.kind === "one" || y.kind === "many") && !y.opts?.length) y.opts = ["Da", "Nu"]; })}>
                        {SUBKINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                      </select>
                      {(sq.kind === "one" || sq.kind === "many") && <input className="input" value={(sq.opts ?? []).join(", ")} disabled={ro} placeholder="Răspunsuri, despărțite prin virgulă" aria-label="Răspunsurile"
                        onChange={(e) => setQq((x) => { x.sub![o][si].opts = e.target.value.split(",").map((t) => t.replace(/^\s+/, "")); })} />}
                      {sq.kind === "num" && <input className="input" value={sq.unit ?? ""} disabled={ro} placeholder="Unitatea (ex. ml)" aria-label="Unitatea" onChange={(e) => setQq((x) => { x.sub![o][si].unit = e.target.value; })} />}
                    </span>
                  </div>
                ))}
                {!ro && <button type="button" className="btn btnGhost btnSm" onClick={() => setQq((x) => { x.sub = { ...(x.sub ?? {}) }; (x.sub[o] ??= []).push({ k: `s${rid()}`, label: "", kind: "one", opts: ["Da", "Nu"] }); })}>+ Întrebare după „{o}”</button>}
              </div>
            ))}
            {(qq.kind === "num" || qq.kind === "int") && <label className="field">Unitatea<input className="input" value={qq.unit ?? ""} disabled={ro || builtIn} placeholder="ex. m, mp, buc." onChange={(e) => setQq((x) => { x.unit = e.target.value || undefined; })} /></label>}
            <label className="check"><input type="checkbox" checked={!!qq.req} disabled={ro} onChange={(e) => setQq((x) => { x.req = e.target.checked || undefined; })} /> Obligatorie</label>
            <label className="check"><input type="checkbox" checked={qq.pdf !== false} disabled={ro} onChange={(e) => setQq((x) => { x.pdf = e.target.checked ? undefined : false; })} /> Apare în PDF</label>
            {qq.kind !== "photo" && <label className="check"><input type="checkbox" checked={!!qq.photo} disabled={ro} onChange={(e) => setQq((x) => { x.photo = e.target.checked || undefined; })} /> Cere și o fotografie</label>}
            {!qq.custom && <label className="check"><input type="checkbox" checked={!!qq.hidden} disabled={ro} onChange={(e) => setQq((x) => { x.hidden = e.target.checked || undefined; })} /> Ascunsă (nu se mai întreabă)</label>}
            {q && !ro && tpl.length > 1 && (
              <label className="field">Mută în grupul
                <select className="select" value={q[0]} onChange={(e) => { const to = Number(e.target.value), [gi, qi] = q; change((t) => { const [x] = t[gi].questions.splice(qi, 1); t[to].questions.push(x); return t; }); setOpen(to); setQ([to, tpl[to].questions.length - (to === gi ? 1 : 0)]); }}>
                  {tpl.map((g, i) => <option key={g.id} value={i}>{g.title}</option>)}
                </select>
              </label>
            )}
          </>
        )}
      </aside>
    </div>
  );
}
