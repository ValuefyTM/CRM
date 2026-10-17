"use client";
// A Word-like editor for the contract model: a page that looks like the contract, a formatting toolbar and the list of
// variables; a click on a variable puts it where the cursor is. Variables show as labels in the editor and are saved
// as {{key}}. Pasted text (from Word too) is cleaned of foreign formatting.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_TEMPLATE, PARTS, sanitizeTemplate, VARIABLES, varLabel, type ContractTemplate, type TemplatePart } from "@/lib/contract-template";

const escAttr = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const chip = (key: string) => {
  const block = key.startsWith("bloc.");
  return `<span class="tplVar${block ? " block" : ""}" contenteditable="false" data-var="${escAttr(key)}">${escAttr(varLabel(key))}</span>`;
};
/** Saved model → editor: {{key}} become labels that move as one piece. */
const toEditor = (html: string) => html.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k: string) => chip(k));
/** Editor → saved model: labels back to {{key}}, then cleaned. */
function fromEditor(el: HTMLElement) {
  const c = el.cloneNode(true) as HTMLElement;
  c.querySelectorAll<HTMLElement>("span.tplVar").forEach((s) => s.replaceWith(document.createTextNode(`{{${s.dataset.var}}}`)));
  return sanitizeTemplate(c.innerHTML);
}

type Btn = { cmd: string; arg?: string; title: string; icon: React.ReactNode };
const I = (d: string) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;
const GROUPS: Btn[][] = [
  [{ cmd: "undo", title: "Anulează (Ctrl+Z)", icon: I("M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3") }, { cmd: "redo", title: "Refă (Ctrl+Y)", icon: I("m15 14 5-5-5-5M20 9H9a5 5 0 0 0 0 10h3") }],
  [{ cmd: "bold", title: "Îngroșat (Ctrl+B)", icon: <b>B</b> }, { cmd: "italic", title: "Cursiv (Ctrl+I)", icon: <i style={{ fontFamily: "serif" }}>I</i> },
    { cmd: "underline", title: "Subliniat (Ctrl+U)", icon: <u>U</u> }, { cmd: "strikeThrough", title: "Tăiat", icon: <s>S</s> }],
  [{ cmd: "justifyLeft", title: "Aliniere la stânga", icon: I("M3 6h18M3 12h12M3 18h16") }, { cmd: "justifyCenter", title: "Centrat", icon: I("M3 6h18M6 12h12M4 18h16") },
    { cmd: "justifyRight", title: "Aliniere la dreapta", icon: I("M3 6h18M9 12h12M5 18h16") }, { cmd: "justifyFull", title: "Stânga-dreapta", icon: I("M3 6h18M3 12h18M3 18h18") }],
  [{ cmd: "insertUnorderedList", title: "Listă cu buline", icon: I("M9 6h12M9 12h12M9 18h12M4 6h.01M4 12h.01M4 18h.01") },
    { cmd: "insertOrderedList", title: "Listă numerotată", icon: I("M10 6h11M10 12h11M10 18h11M4 4v4M3 18h3l-3 3h3") },
    { cmd: "outdent", title: "Micșorează retragerea", icon: I("M21 6H11M21 12H11M21 18H11M7 8l-4 4 4 4") }, { cmd: "indent", title: "Mărește retragerea", icon: I("M21 6H11M21 12H11M21 18H11M3 8l4 4-4 4") }],
  [{ cmd: "table", title: "Inserează tabel", icon: I("M3 3h18v18H3zM3 9h18M3 15h18M9 3v18M15 3v18") }, { cmd: "insertHorizontalRule", title: "Linie orizontală", icon: I("M3 12h18") },
    { cmd: "removeFormat", title: "Șterge formatarea", icon: I("M4 7V4h16v3M9 20h6M12 4v16M3 3l18 18") }],
];
const STYLES: [string, string][] = [["P", "Text normal"], ["H1", "Titlu 1"], ["H2", "Titlu 2"], ["H3", "Titlu 3"]];

export function ContractTemplateEditor({ initial, edit, custom, saved, previews }: {
  initial: ContractTemplate; edit: boolean; custom: boolean; saved: string; previews: { href: string; label: string }[];
}) {
  const [part, setPart] = useState<TemplatePart>("general");
  const [draft, setDraft] = useState<ContractTemplate>(initial);
  const [dirty, setDirty] = useState(false);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [style, setStyle] = useState("P");
  const ed = useRef<HTMLDivElement>(null);
  const range = useRef<Range | null>(null);

  // Enter makes a new paragraph (not a <div>), like in Word.
  useEffect(() => { try { document.execCommand("defaultParagraphSeparator", false, "p"); } catch { /* older browsers */ } }, []);
  // Load the part into the page (the editor is uncontrolled while typing).
  useEffect(() => { if (ed.current) ed.current.innerHTML = toEditor(draft[part]); range.current = null; }, [part]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const keep = useCallback(() => {
    const s = window.getSelection();
    if (s && s.rangeCount && ed.current?.contains(s.anchorNode)) {
      range.current = s.getRangeAt(0).cloneRange();
      const block = (s.anchorNode instanceof Element ? s.anchorNode : s.anchorNode?.parentElement)?.closest("h1,h2,h3,p,li");
      setStyle(block && /^H[1-3]$/.test(block.tagName) ? block.tagName : "P");
    }
  }, []);
  const sync = useCallback(() => {
    if (!ed.current) return;
    const html = fromEditor(ed.current);
    setDraft((d) => (d[part] === html ? d : { ...d, [part]: html }));
    setDirty(true);
  }, [part]);
  const restore = () => {
    const el = ed.current;
    if (!el) return;
    el.focus();
    const s = window.getSelection();
    if (!s) return;
    s.removeAllRanges();
    if (range.current) s.addRange(range.current);
    else { const r = document.createRange(); r.selectNodeContents(el); r.collapse(false); s.addRange(r); }
  };
  const run = (cmd: string, arg?: string) => {
    if (!edit) return;
    restore();
    if (cmd === "table") {
      const cells = (tag: string) => `<tr>${[1, 2, 3].map(() => `<${tag}>&nbsp;</${tag}>`).join("")}</tr>`;
      document.execCommand("insertHTML", false, `<table class="cdTable"><thead>${cells("th")}</thead><tbody>${cells("td")}${cells("td")}</tbody></table><p><br></p>`);
    } else document.execCommand(cmd, false, arg);
    keep(); sync();
  };
  // Inserted with the DOM (not execCommand, which splits the paragraph around a non-editable label).
  const insertVar = (key: string) => {
    const el = ed.current;
    if (!edit || !el) return;
    restore();
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    const r = sel.getRangeAt(0);
    const tmp = document.createElement("div");
    tmp.innerHTML = chip(key);
    const node = tmp.firstChild as HTMLElement;
    let caretAfter: Node;
    if (key.startsWith("bloc.")) {
      // A block goes in a paragraph of its own, after the paragraph the cursor is in.
      const host = (r.startContainer instanceof Element ? r.startContainer : r.startContainer.parentElement)?.closest("p,h1,h2,h3,h4,li,table,ul,ol");
      const top = host ? (host.closest("ul,ol,table") ?? host) : null;
      const p = document.createElement("p");
      p.appendChild(node);
      const next = document.createElement("p");
      next.appendChild(document.createElement("br"));
      if (top && top !== el && top.parentNode && el.contains(top)) {
        top.parentNode.insertBefore(next, top.nextSibling);
        top.parentNode.insertBefore(p, next);
      } else { el.appendChild(p); el.appendChild(next); }
      caretAfter = next;
      const nr = document.createRange(); nr.setStart(next, 0); nr.collapse(true);
      sel.removeAllRanges(); sel.addRange(nr);
    } else {
      r.deleteContents();
      const space = document.createTextNode("\u00a0");
      r.insertNode(space);
      r.insertNode(node);
      caretAfter = space;
      const nr = document.createRange(); nr.setStartAfter(caretAfter); nr.collapse(true);
      sel.removeAllRanges(); sel.addRange(nr);
    }
    keep(); sync();
  };
  const onPaste = (e: React.ClipboardEvent) => {
    if (!edit) return;
    e.preventDefault();
    const html = e.clipboardData.getData("text/html");
    const text = e.clipboardData.getData("text/plain");
    const clean = html
      ? sanitizeTemplate(html).replace(/\sclass="[^"]*"/g, "").replace(/\sstyle="(?![^"]*text-align)[^"]*"/g, "")
      : text.split(/\n{2,}/).map((p) => `<p>${escAttr(p).replace(/\n/g, "<br>")}</p>`).join("");
    document.execCommand("insertHTML", false, clean);
    sync();
  };

  const vars = useMemo(() => {
    const n = q.trim().toLowerCase();
    return VARIABLES.filter((v) => (!v.parts || v.parts.includes(part)) && (!n || `${v.label} ${v.group} ${v.key}`.toLowerCase().includes(n)));
  }, [q, part]);
  const groups = [...new Set(vars.map((v) => v.group))];
  // Variables in the part that are not available there (e.g. an annex variable in the general conditions).
  const misplaced = useMemo(() => [...draft[part].matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)].map((m) => m[1])
    .filter((k) => { const v = VARIABLES.find((x) => x.key === k); return !v || (v.parts && !v.parts.includes(part)); }), [draft, part]);

  const save = async () => {
    const body = ed.current ? { ...draft, [part]: fromEditor(ed.current) } : draft;
    setDraft(body);
    setBusy(true); setMsg(null);
    const r = await fetch("/api/crm/settings/contract-template", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const j = (await r?.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!r?.ok) return setMsg({ ok: false, text: j?.error ?? "Modelul nu a putut fi salvat." });
    setDirty(false);
    setMsg({ ok: true, text: "Modelul a fost salvat. Contractele nesemnate îl folosesc de acum; cele semnate rămân cum au fost semnate." });
  };
  const reset = async () => {
    if (!confirm("Revii la modelul standard VALUEFY? Modificările făcute în model se pierd.")) return;
    setBusy(true);
    const r = await fetch("/api/crm/settings/contract-template", { method: "DELETE" }).catch(() => null);
    setBusy(false);
    if (!r?.ok) return setMsg({ ok: false, text: "Nu am putut restaura modelul standard." });
    setDirty(false);
    setDraft(DEFAULT_TEMPLATE);
    if (ed.current) ed.current.innerHTML = toEditor(DEFAULT_TEMPLATE[part]);
    setMsg({ ok: true, text: "Modelul standard a fost restaurat." });
  };

  return (
    <div className="tplWrap">
      <div className="tplTop">
        <nav className="tplParts" aria-label="Părțile contractului">
          {PARTS.map(([k, l, hint]) => (
            <button key={k} type="button" aria-pressed={part === k} title={hint}
              onClick={() => { if (ed.current) { const html = fromEditor(ed.current); setDraft((d) => ({ ...d, [part]: html })); } setPart(k); }}>{l}</button>
          ))}
        </nav>
        <div className="tplActions">
          <span className="muted">{dirty ? "Modificări nesalvate" : saved}</span>
          {previews.length > 0 && (
            <select className="select tplPreview" defaultValue="" aria-label="Previzualizează pe un contract"
              onChange={(e) => { if (e.target.value) window.open(e.target.value, "_blank"); e.target.value = ""; }}>
              <option value="">Previzualizează pe un contract…</option>
              {previews.map((p) => <option key={p.href} value={p.href}>{p.label}</option>)}
            </select>
          )}
          {edit && custom && <button type="button" className="btn btnGhost btnSm" disabled={busy} onClick={reset}>Modelul standard</button>}
          {edit && <button type="button" className="btn btnNavy btnSm" disabled={busy || !dirty} onClick={save}>{busy ? "Se salvează…" : "Salvează modelul"}</button>}
        </div>
      </div>
      {msg && <div className={msg.ok ? "note ok" : "error"} role="status">{msg.text}</div>}
      <p className="hint tplHint">{PARTS.find(([k]) => k === part)?.[2]} Variabilele (în galben) se înlocuiesc cu datele fiecărui contract. Previzualizarea arată ultima variantă salvată.</p>

      <div className="tplBody">
        <div className="tplDoc">
          {edit && (
            <div className="tplBar" role="toolbar" aria-label="Formatare" onMouseDown={(e) => { if ((e.target as HTMLElement).closest("button")) e.preventDefault(); }}>
              <select className="tplStyle" value={style} aria-label="Stil paragraf" onChange={(e) => { setStyle(e.target.value); run("formatBlock", e.target.value); }}>
                {STYLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              {GROUPS.map((g, i) => (
                <span key={i} className="tplGroup">
                  {g.map((b) => <button key={b.cmd} type="button" title={b.title} aria-label={b.title} onClick={() => run(b.cmd, b.arg)}>{b.icon}</button>)}
                </span>
              ))}
            </div>
          )}
          <div className="tplPaper">
            <article className="cdPage tplPage">
              <header className="cdHead">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/valuefy-logo.png" alt="VALUEFY" />
                <span>Contract de prestări servicii nr. … / …</span>
              </header>
              <div ref={ed} className="cdBody tplEdit" contentEditable={edit} suppressContentEditableWarning spellCheck lang="ro"
                onInput={sync} onKeyUp={keep} onMouseUp={keep} onBlur={keep} onPaste={onPaste} />
            </article>
          </div>
        </div>

        <aside className="tplVars card">
          <div className="cardHead"><h2>Variabile</h2><span className="muted">{vars.length}</span></div>
          <p className="hint">Pune cursorul în text și apasă pe o variabilă ca s-o inserezi. Blocurile (tabele, bife, semnături) stau pe rând separat.</p>
          <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Caută variabilă…" aria-label="Caută variabilă" />
          {misplaced.length > 0 && <div className="error">Variabile care nu au valoare în această parte: {[...new Set(misplaced)].map(varLabel).join(", ")}. Vor apărea în contract ca [[…]].</div>}
          <div className="tplVarList" onMouseDown={(e) => { if ((e.target as HTMLElement).closest("button")) e.preventDefault(); }}>
            {groups.map((g) => (
              <div key={g}>
                <div className="section">{g}</div>
                {vars.filter((v) => v.group === g).map((v) => (
                  <button key={v.key} type="button" className={`tplVarBtn${v.block ? " block" : ""}`} disabled={!edit} onClick={() => insertVar(v.key)} title={`{{${v.key}}}${v.sample ? ` · ex.: ${v.sample}` : ""}`}>
                    <b>{v.label}</b><small>{`{{${v.key}}}`}</small>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
