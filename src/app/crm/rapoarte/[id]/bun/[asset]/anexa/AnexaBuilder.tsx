"use client";
// Anexă foto / Anexă documente, as UVALO's Word add-in: the photos (or the pages of the documents) of an asset, ticked,
// ordered, rotated, described, then laid out (so many per page, captions, titles, page and margins) and exported as a
// PDF or a Word document — or saved as a PDF among the report's documents. The list (order, ticks, descriptions,
// rotations, document titles) and the settings are kept in this browser.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DEFAULTS, DPI, GRIDS, RATIOS, SHEETS, docTitleFrom, layout, settingsOf, turned, type Item, type Mode, type Page, type Settings } from "@/lib/anexa-layout";
import { exportDocx, exportPdf, pdfDoc, remember, renderPage, type Source } from "@/lib/anexa-export";

export type SrcPhoto = { id: string; src: string; name: string; group: string; desc: string; taken: string | null; inspection: string };
export type SrcDoc = { id: string; name: string; url: string; pdf: boolean };

type El = Item & { url: string; kind: "img" | "pdf"; page: number; sel: boolean; thumb: string | null; taken: string | null; group?: string; local?: boolean; bad?: boolean; autoRot?: boolean };
type DocRow = { id: string; name: string; title: string; folded: boolean; url: string; pdf: boolean; local?: boolean; loading?: boolean; error?: string };
type Sort = "manual" | "name" | "name-desc" | "taken" | "taken-desc" | "selected-first";
type Saved = { order: string[]; sel: Record<string, boolean>; desc: Record<string, string>; rot: Record<string, number>; docs?: { id: string; title: string; folded: boolean }[]; removed: string[]; sort: Sort };

const SORTS: [Sort, string][] = [["manual", "Ordine manuală"], ["name", "Nume A → Z"], ["name-desc", "Nume Z → A"], ["taken", "Data fotografierii ↑"], ["taken-desc", "Data fotografierii ↓"], ["selected-first", "Bifate primele"]];
const read = <T,>(k: string): T | null => { try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : null; } catch { return null; } };
const write = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* full or blocked */ } };
const cmpName = (a: El, b: El) => a.name.localeCompare(b.name, "ro", { numeric: true });

export function AnexaBuilder({ mode, scope, photos, inspections, docs: srcDocs, fileBase, report, asset, canSave }: {
  mode: Mode; scope: string; photos: SrcPhoto[]; inspections: { id: string; label: string }[]; docs: SrcDoc[]; fileBase: string; report: string; asset: string; canSave: boolean;
}) {
  const KEY = `anexa:${scope}`, SKEY = `anexa-settings:${mode}`;
  const [tab, setTab] = useState<"lista" | "aranjare" | "previzualizare">("lista");
  const [s, setS] = useState<Settings>(DEFAULTS[mode]);
  const [els, setEls] = useState<El[]>([]);
  const [docRows, setDocRows] = useState<DocRow[]>([]);
  const [sort, setSort] = useState<Sort>("manual");
  const [onlySel, setOnlySel] = useState(false);
  const [thumbPx, setThumbPx] = useState(mode === "foto" ? 140 : 110);
  const [view, setView] = useState<number | null>(null);
  const [drag, setDrag] = useState<{ id: string; doc?: boolean } | null>(null);
  const [busy, setBusy] = useState<{ done: number; total: number; what: string } | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [pvCols, setPvCols] = useState(2);
  const [ready, setReady] = useState(false);
  // what was taken out of the list (from the CRM's photos / documents / pages): kept out next time
  const [removed, setRemoved] = useState<string[]>([]);
  const drop = (ids: string[]) => setRemoved((x) => [...new Set([...x, ...ids.filter((id) => !id.startsWith("local-"))])]);
  const fileIn = useRef<HTMLInputElement>(null);

  // ---- the elements: from the CRM (photos of the inspections, the asset's documents), with what was kept from before
  useEffect(() => {
    const saved = read<Saved>(KEY);
    setS(settingsOf(mode, read(SKEY)));
    setRemoved(saved?.removed ?? []);
    if (saved?.sort) setSort(saved.sort);
    if (mode === "foto") {
      const base: El[] = photos.map((p) => ({ id: p.id, name: p.name, w: 4, h: 3, rot: saved?.rot[p.id] ?? 0, desc: saved?.desc[p.id] ?? p.desc, url: p.src, kind: "img", page: 0,
        sel: saved?.sel[p.id] ?? true, thumb: p.src, taken: p.taken, group: p.inspection }));
      setEls(order(base.filter((e) => !saved?.removed.includes(e.id)), saved?.order));
      setReady(true);
      return;
    }
    // documents: each PDF opened (its pages), each image one page
    const rows: DocRow[] = srcDocs.filter((d) => !saved?.removed.includes(`doc:${d.id}`)).map((d) => {
      const k = saved?.docs?.find((x) => x.id === d.id);
      return { id: d.id, name: d.name, title: k?.title ?? docTitleFrom(d.name), folded: k?.folded ?? false, url: d.url, pdf: d.pdf, loading: true };
    });
    const ord = saved?.docs?.map((x) => x.id) ?? [];
    rows.sort((a, b) => (ord.indexOf(a.id) + 1 || 1e6) - (ord.indexOf(b.id) + 1 || 1e6));
    setDocRows(rows);
    let live = true;
    (async () => {
      const all: El[] = [];
      for (const d of rows) {
        const pages = await pagesOf(d, saved).catch((e: Error) => { if (live) setDocRows((x) => x.map((r) => (r.id === d.id ? { ...r, loading: false, error: e.message } : r))); return [] as El[]; });
        all.push(...pages.filter((p) => !saved?.removed.includes(p.id)));
        if (!live) return;
        setDocRows((x) => x.map((r) => (r.id === d.id ? { ...r, loading: false } : r)));
        setEls(order([...all], saved?.order));
      }
      setReady(true);
    })();
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // what is kept: the order, the ticks, the descriptions, the rotations, the document titles (not the files chosen from the computer)
  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => {
      const own = els.filter((e) => !e.local);
      write(KEY, {
        order: own.map((e) => e.id), sel: Object.fromEntries(own.map((e) => [e.id, e.sel])), desc: Object.fromEntries(own.map((e) => [e.id, e.desc])),
        rot: Object.fromEntries(own.filter((e) => !e.autoRot).map((e) => [e.id, e.rot])), docs: docRows.filter((d) => !d.local).map((d) => ({ id: d.id, title: d.title, folded: d.folded })),
        removed, sort,
      } satisfies Saved);
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [els, docRows, sort, ready, removed]);
  // a PDF page's thumbnail, drawn after the list appeared
  useEffect(() => {
    const on = (ev: Event) => { const d = (ev as CustomEvent<{ id: string; thumb: string }>).detail; setEls((x) => x.map((e) => (e.id === d.id ? { ...e, thumb: d.thumb } : e))); };
    window.addEventListener("ax-thumb", on);
    return () => window.removeEventListener("ax-thumb", on);
  }, []);
  useEffect(() => { if (ready) write(SKEY, s); }, [s, ready, SKEY]);

  // the size of each photo (for the layout), read when its thumbnail loads
  const sized = useCallback((id: string, w: number, h: number) => setEls((x) => x.map((e) => (e.id === id && (e.w !== w || e.h !== h) ? { ...e, w, h } : e))), []);

  // landscape pages turned to fill a portrait page (plans), when asked; given back when not
  useEffect(() => {
    if (mode !== "acte") return;
    const [sw, sh] = SHEETS[s.page.format];
    const portrait = sh - s.page.top - s.page.bottom > sw - s.page.left - s.page.right;
    setEls((x) => {
      let ch = false;
      const n = x.map((e) => {
        const want = s.autoRotate && portrait && e.w > e.h;
        if (want && e.rot === 0 && !e.autoRot) { ch = true; return { ...e, rot: 90, autoRot: true }; }
        if (!want && e.autoRot) { ch = true; return { ...e, rot: 0, autoRot: false }; }
        return e;
      });
      return ch ? n : x;
    });
  }, [mode, s.autoRotate, s.page, els.length]);

  // ---- sorting, ticking, moving
  const sorted = useCallback((list: El[], how: Sort) => {
    if (how === "manual") return list;
    const t = (e: El) => (e.taken ? Date.parse(e.taken) : 0);
    const cmp: Record<Exclude<Sort, "manual">, (a: El, b: El) => number> = {
      name: cmpName, "name-desc": (a, b) => -cmpName(a, b), taken: (a, b) => t(a) - t(b) || cmpName(a, b), "taken-desc": (a, b) => t(b) - t(a) || cmpName(a, b),
      "selected-first": (a, b) => Number(b.sel) - Number(a.sel),
    };
    // documents: the pages stay inside their document
    if (mode === "acte") return list;
    return [...list].sort(cmp[how]);
  }, [mode]);
  const applySort = (how: Sort) => { setSort(how); setEls((x) => sorted(x, how)); };
  const patch = (id: string, p: Partial<El>) => setEls((x) => x.map((e) => (e.id === id ? { ...e, ...p } : e)));
  const tickAll = (v: boolean | "inv") => setEls((x) => x.map((e) => (e.bad ? e : { ...e, sel: v === "inv" ? !e.sel : v })));
  const dropUnticked = () => { drop(els.filter((e) => !e.sel).map((e) => e.id)); setEls((x) => x.filter((e) => e.sel)); };
  const removeEl = (id: string) => { drop([id]); setEls((x) => x.filter((e) => e.id !== id)); };
  const moveEl = (id: string, before: string | null) => {
    setSort("manual");
    setEls((x) => {
      const it = x.find((e) => e.id === id);
      if (!it) return x;
      const rest = x.filter((e) => e.id !== id);
      // a page of a document stays in its document
      const at = before ? rest.findIndex((e) => e.id === before) : -1;
      if (mode === "acte" && before && rest[at]?.doc !== it.doc) return x;
      if (at < 0) { if (mode === "acte") { const last = rest.map((e) => e.doc).lastIndexOf(it.doc); rest.splice(last + 1, 0, it); return [...rest]; } return [...rest, it]; }
      rest.splice(at, 0, it);
      return [...rest];
    });
  };
  const moveDoc = (id: string, to: number) => setDocRows((x) => {
    const i = x.findIndex((d) => d.id === id);
    if (i < 0 || to < 0 || to >= x.length) return x;
    const n = [...x]; const [d] = n.splice(i, 1); n.splice(to, 0, d); return n;
  });
  const removeDoc = (id: string) => { drop([`doc:${id}`]); setDocRows((x) => x.filter((d) => d.id !== id)); setEls((x) => x.filter((e) => e.doc !== id)); };

  // the elements in the order of their documents (a document's pages together, documents in their order)
  const ordered = useMemo(() => (mode === "acte" ? docRows.flatMap((d) => els.filter((e) => e.doc === d.id)) : els), [mode, els, docRows]);
  const ticked = useMemo(() => ordered.filter((e) => e.sel && !e.bad), [ordered]);
  const lay = useMemo(() => layout(s, ticked, docRows.map((d) => ({ id: d.id, title: d.title })), mode), [s, ticked, docRows, mode]);
  const numOf = useMemo(() => new Map(lay.pages.flatMap((p) => p.cells.map((c) => [c.item.id, c.n] as const))), [lay]);
  const docNo = useMemo(() => { const m = new Map<string, number>(); for (const e of ticked) if (e.doc && !m.has(e.doc)) m.set(e.doc, m.size + 1); return m; }, [ticked]);
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS((x) => ({ ...x, [k]: v }));
  const setIn = <K extends "caption" | "title" | "docTitle" | "page">(k: K, p: Partial<Settings[K]>) => setS((x) => ({ ...x, [k]: { ...x[k], ...p } }));

  // ---- files from the computer
  const addFiles = async (files: FileList | File[]) => {
    const list = [...files];
    const heic = list.filter((f) => /\.(heic|heif)$/i.test(f.name)).length;
    if (mode === "foto") {
      const imgs = list.filter((f) => /^image\/(jpeg|png|webp|gif|bmp)$/.test(f.type) || /\.(jpe?g|png|webp|gif|bmp)$/i.test(f.name));
      const add = imgs.map((f): El => {
        const url = URL.createObjectURL(f); remember(url, f);
        return { id: `local-${crypto.randomUUID()}`, name: f.name, w: 4, h: 3, rot: 0, desc: "", url, kind: "img", page: 0, sel: true, thumb: url, taken: f.lastModified ? new Date(f.lastModified).toISOString() : null, local: true };
      });
      setEls((x) => sorted([...x, ...add.sort(cmpName)], sort));
      setMsg({ ok: true, t: `${add.length} ${add.length === 1 ? "imagine adăugată" : "imagini adăugate"}${heic ? ` · ${heic} HEIC ignorate (exportă-le ca JPG)` : ""}${list.length - add.length - heic > 0 ? ` · ${list.length - add.length - heic} nu sunt imagini` : ""}.` });
      return;
    }
    for (const f of list.filter((f) => /pdf|image\//.test(f.type) || /\.(pdf|jpe?g|png|webp)$/i.test(f.name))) {
      const url = URL.createObjectURL(f); remember(url, f);
      const d: DocRow = { id: `local-${crypto.randomUUID()}`, name: f.name, title: docTitleFrom(f.name), folded: false, url, pdf: /pdf/.test(f.type) || /\.pdf$/i.test(f.name), local: true, loading: true };
      setDocRows((x) => [...x, d]);
      const pages = await pagesOf(d, null).catch((e: Error) => { setDocRows((x) => x.map((r) => (r.id === d.id ? { ...r, loading: false, error: e.message } : r))); return [] as El[]; });
      setDocRows((x) => x.map((r) => (r.id === d.id ? { ...r, loading: false } : r)));
      setEls((x) => [...x, ...pages.map((p) => ({ ...p, local: true }))]);
    }
  };

  // ---- export
  const srcOf = (id: string): Source | null => { const e = els.find((x) => x.id === id); return e ? (e.kind === "pdf" ? { kind: "pdf", url: e.url, page: e.page } : { kind: "img", url: e.url }) : null; };
  const run = async (what: "pdf" | "docx" | "save") => {
    if (!ticked.length) return setMsg({ ok: false, t: "Bifează cel puțin un element." });
    setMsg(null);
    const prog = (done: number, total: number, w: string) => setBusy({ done, total, what: w });
    try {
      setBusy({ done: 0, total: ticked.length, what: "" });
      const blob = what === "docx" ? await exportDocx(s, lay.pages, srcOf, prog) : await exportPdf(s, lay.pages, srcOf, prog);
      const name = `${fileBase}.${what === "docx" ? "docx" : "pdf"}`;
      if (what === "save") {
        setBusy({ done: ticked.length, total: ticked.length, what: "Salvez în actele raportului…" });
        const fd = new FormData();
        fd.append("file", new File([blob], name, { type: "application/pdf" })); fd.append("kind", "source"); fd.append("asset", asset);
        const r = await fetch(`/api/crm/reports/${report}/documents`, { method: "POST", body: fd }).catch(() => null);
        const d = (await r?.json().catch(() => ({}))) as { error?: string };
        if (!r?.ok) throw new Error(d?.error ?? "Nu s-a putut salva.");
        setMsg({ ok: true, t: `Salvat în actele raportului: ${name} (${lay.pages.length} ${lay.pages.length === 1 ? "pagină" : "pagini"}).` });
      } else {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 30000);
        setMsg({ ok: true, t: `Gata: ${ticked.length} ${mode === "foto" ? (ticked.length === 1 ? "poză" : "poze") : (ticked.length === 1 ? "pagină" : "pagini")} pe ${lay.pages.length} ${lay.pages.length === 1 ? "pagină" : "pagini"} · ${(blob.size / 1048576).toLocaleString("ro-RO", { maximumFractionDigits: 1 })} MB.` });
      }
    } catch (e) {
      setMsg({ ok: false, t: (e as Error).message || "Exportul nu a reușit." });
    } finally { setBusy(null); }
  };

  // ---- the lightbox: ← →, Space (în anexă), R (rotește), Esc
  const shown = onlySel ? ordered.filter((e) => e.sel) : ordered;
  useEffect(() => {
    if (view === null) return;
    const on = (ev: KeyboardEvent) => {
      if ((ev.target as HTMLElement)?.tagName === "INPUT") { if (ev.key === "Escape") setView(null); return; }
      const e = shown[view];
      if (ev.key === "Escape") setView(null);
      else if (ev.key === "ArrowLeft") setView(Math.max(0, view - 1));
      else if (ev.key === "ArrowRight" || ev.key === "Enter") setView(Math.min(shown.length - 1, view + 1));
      else if (ev.key === " " && e) { ev.preventDefault(); patch(e.id, { sel: !e.sel }); }
      else if ((ev.key === "r" || ev.key === "R") && e) patch(e.id, { rot: (e.rot + 90) % 360, autoRot: false });
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [view, shown]);

  const card = (e: El, i: number) => (
    <div key={e.id} className={`axCard${e.sel ? " on" : ""}${drag?.id === e.id ? " drag" : ""}${e.bad ? " bad" : ""}`} draggable
      onDragStart={() => setDrag({ id: e.id })} onDragEnd={() => setDrag(null)} onDragOver={(ev) => ev.preventDefault()}
      onDrop={(ev) => { ev.preventDefault(); if (drag && !drag.doc && drag.id !== e.id) { const r = (ev.currentTarget as HTMLElement).getBoundingClientRect(); const after = ev.clientX > r.left + r.width / 2; const idx = shown.findIndex((x) => x.id === e.id); moveEl(drag.id, after ? shown[idx + 1]?.id ?? null : e.id); } setDrag(null); }}
      style={{ width: thumbPx }}>
      <button type="button" className="axThumb" style={{ height: thumbPx * (mode === "acte" ? 1.3 : 0.78) }} onClick={() => patch(e.id, { sel: !e.sel })} onDoubleClick={() => setView(i)} aria-pressed={e.sel} title="Clic: bifează · dublu clic: mărește">
        {e.thumb ? <img src={e.thumb} alt="" loading="lazy" style={{ transform: `rotate(${e.rot}deg)` }}
          onLoad={(ev) => { const im = ev.currentTarget; if (mode === "foto") sized(e.id, im.naturalWidth || 4, im.naturalHeight || 3); }}
          onError={() => patch(e.id, { bad: true, sel: false })} /> : <span className="axWait">…</span>}
        <b className="axNo">{e.sel && numOf.has(e.id) ? (mode === "foto" ? numOf.get(e.id) : `p. ${e.page + 1}`) : "–"}</b>
        {e.sel && <i className="axTick">✓</i>}
      </button>
      <span className="axTools">
        <button type="button" title="Mărește" onClick={() => setView(i)}>⤢</button>
        <button type="button" title="Rotește 90°" onClick={() => patch(e.id, { rot: (e.rot + 90) % 360, autoRot: false })}>↻</button>
        <button type="button" title="Scoate din listă" onClick={() => removeEl(e.id)}>✕</button>
      </span>
      {mode === "foto" ? <small className="axName" title={e.name}>{e.name}</small> : <small className="axName">pag. {e.page + 1}</small>}
      {(mode === "foto" || s.caption.on) && <input className="axDesc" value={e.desc} placeholder="Descriere…" onChange={(ev) => patch(e.id, { desc: ev.target.value })}
        onKeyDown={(ev) => { if (ev.key === "Enter") { const all = [...document.querySelectorAll<HTMLInputElement>(".axDesc")]; all[all.indexOf(ev.currentTarget) + 1]?.focus(); } }} />}
    </div>
  );

  const [cols, rows] = GRIDS[s.perPage];
  const groups = mode === "foto" ? inspections : [];
  return (
    <div className="axWrap">
      <nav className="axTabs" role="tablist">
        {([["lista", mode === "foto" ? "Poze" : "Documente", `${ticked.length}/${ordered.length}`], ["aranjare", "Aranjare", `${cols}×${rows}`], ["previzualizare", "Previzualizare", `${lay.pages.length} pag.`]] as const).map(([k, l, n]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{l}<small>{n}</small></button>
        ))}
        <span className="axGo">
          <button type="button" className="btn btnGhost btnSm" disabled={!!busy || !ticked.length} onClick={() => run("docx")}>Descarcă Word</button>
          <button type="button" className="btn btnGold btnSm" disabled={!!busy || !ticked.length} onClick={() => run("pdf")}>Descarcă PDF · {lay.pages.length} {lay.pages.length === 1 ? "pagină" : "pagini"}</button>
          {canSave && <button type="button" className="btn btnNavy btnSm" disabled={!!busy || !ticked.length} onClick={() => run("save")}>Salvează în actele raportului</button>}
        </span>
      </nav>
      {busy && <div className="axBusy" role="status"><span style={{ width: `${busy.total ? (busy.done / busy.total) * 100 : 0}%` }} /><b>{busy.what ? `${busy.done} / ${busy.total} · ${busy.what}` : "Se pregătește…"}</b></div>}
      {msg && <div role={msg.ok ? "status" : "alert"} className={msg.ok ? "okMsg" : "error"}>{msg.t}</div>}

      {tab === "lista" && (
        <section className="card axList">
          <div className="axBar">
            <span className="axBtns">
              <button type="button" className="btn btnGhost btnSm" onClick={() => tickAll(true)}>Toate</button>
              <button type="button" className="btn btnGhost btnSm" onClick={() => tickAll(false)}>Niciuna</button>
              <button type="button" className="btn btnGhost btnSm" onClick={() => tickAll("inv")}>Inv.</button>
              <label className="axChk"><input type="checkbox" checked={onlySel} onChange={(e) => setOnlySel(e.target.checked)} /> doar bifate</label>
              <button type="button" className="linkBtn" onClick={dropUnticked}>Elimină nebifatele</button>
            </span>
            <span className="axBtns">
              {mode === "foto" && <select className="select" value={sort} onChange={(e) => applySort(e.target.value as Sort)} aria-label="Ordinea">{SORTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>}
              {mode === "acte" && <button type="button" className="btn btnGhost btnSm" onClick={() => { const any = docRows.some((d) => !d.folded); setDocRows((x) => x.map((d) => ({ ...d, folded: any }))); }}>{docRows.some((d) => !d.folded) ? "Restrânge paginile" : "Arată paginile"}</button>}
              <label className="axChk">Miniaturi <input type="range" min={90} max={220} value={thumbPx} onChange={(e) => setThumbPx(Number(e.target.value))} /></label>
              <button type="button" className="btn btnGhost btnSm" onClick={() => fileIn.current?.click()}>+ {mode === "foto" ? "Fotografii" : "PDF-uri / imagini"} din calculator</button>
              <input ref={fileIn} type="file" multiple hidden accept={mode === "foto" ? "image/*" : ".pdf,image/*"} onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }} />
              <button type="button" className="linkBtn" onClick={() => { if (confirm("Reiei de la zero (toate pozele / actele bunului, bifate, fără descrierile tale)?")) { localStorage.removeItem(KEY); location.reload(); } }}>Reia de la zero</button>
            </span>
          </div>
          <div className="axDrop" onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) e.preventDefault(); }} onDrop={(e) => { if (e.dataTransfer.files.length) { e.preventDefault(); addFiles(e.dataTransfer.files); } }}>
            {mode === "foto" ? (
              ordered.length === 0 ? <p className="hint">Bunul nu are fotografii. Adaugă din calculator (sau trage-le aici).</p> : <>
                {groups.length > 1 && <p className="hint" style={{ margin: 0 }}>Fotografiile din {groups.length} inspecții, în ordinea fișei. Le muți trăgându-le; clic = bifează, dublu clic = mărește.</p>}
                <div className="axGrid">{shown.map((e, i) => card(e, i))}</div>
              </>
            ) : (
              docRows.length === 0 ? <p className="hint">Bunul nu are acte PDF sau imagini. Adaugă din calculator (sau trage-le aici).</p> : docRows.map((d, di) => {
                const pages = shown.filter((e) => e.doc === d.id), all = els.filter((e) => e.doc === d.id), on = all.filter((e) => e.sel).length;
                return (
                  <div key={d.id} className={`axDoc${drag?.doc && drag.id === d.id ? " drag" : ""}`} onDragOver={(e) => e.preventDefault()}
                    onDrop={(ev) => { if (drag?.doc && drag.id !== d.id) { ev.preventDefault(); moveDoc(drag.id, di); } setDrag(null); }}>
                    <div className="axDocHead">
                      <span className="axHandle" draggable onDragStart={() => setDrag({ id: d.id, doc: true })} onDragEnd={() => setDrag(null)} title="Trage ca să muți documentul">⠿</span>
                      <button type="button" className="linkBtn" onClick={() => setDocRows((x) => x.map((r) => (r.id === d.id ? { ...r, folded: !r.folded } : r)))} aria-label={d.folded ? "Arată paginile" : "Restrânge"}>{d.folded ? "▸" : "▾"}</button>
                      <input type="checkbox" checked={!!all.length && on === all.length} ref={(el) => { if (el) el.indeterminate = on > 0 && on < all.length; }}
                        onChange={(e) => setEls((x) => x.map((p) => (p.doc === d.id ? { ...p, sel: e.target.checked } : p)))} aria-label="Toate paginile" />
                      <b className="axDocNo">{docNo.get(d.id) ?? "–"}</b>
                      <input className="input axDocTitle" value={d.title} onChange={(e) => setDocRows((x) => x.map((r) => (r.id === d.id ? { ...r, title: e.target.value } : r)))} placeholder="Titlul documentului" />
                      <button type="button" className="linkBtn" disabled={di === 0} onClick={() => moveDoc(d.id, di - 1)} aria-label="Mai sus">▲</button>
                      <button type="button" className="linkBtn" disabled={di === docRows.length - 1} onClick={() => moveDoc(d.id, di + 1)} aria-label="Mai jos">▼</button>
                      <button type="button" className="linkBtn" onClick={() => removeDoc(d.id)} aria-label="Scoate documentul">✕</button>
                    </div>
                    <small className="muted">{d.name} · {d.loading ? "se deschide…" : d.error ? <span className="neg">{d.error}</span> : `${all.length} ${all.length === 1 ? "pagină" : "pagini"} · ${on} bifate`}</small>
                    {!d.folded && <div className="axGrid">{pages.map((e) => card(e, shown.indexOf(e)))}</div>}
                    {d.folded && pages[0]?.thumb && <img className="axMini" src={pages[0].thumb} alt="" />}
                  </div>
                );
              })
            )}
          </div>
        </section>
      )}

      {tab === "aranjare" && <Arrange s={s} set={set} setIn={setIn} mode={mode} reset={() => setS(DEFAULTS[mode])} cellMax={lay.cellMax} />}

      {tab === "previzualizare" && (
        <section className="card">
          <div className="cardHead">
            <h2>Previzualizare</h2>
            <span className="axBtns"><span className="muted">{ticked.length} {mode === "foto" ? "poze" : "pagini"} pe {lay.pages.length} {lay.pages.length === 1 ? "pagină" : "pagini"} · {cols}×{rows} · imagine max. {lay.cellMax[0].toFixed(1)}×{lay.cellMax[1].toFixed(1)} cm</span>
              <span className="segment">{[["1", "Mare"], ["2", "Mediu"], ["3", "Mic"]].map(([k, l]) => <button key={k} type="button" aria-pressed={pvCols === Number(k)} onClick={() => setPvCols(Number(k))}>{l}</button>)}</span></span>
          </div>
          {lay.pages.length === 0 ? <p className="hint">Nimic bifat.</p> : (
            <div className="axPages" style={{ gridTemplateColumns: `repeat(${pvCols}, minmax(0, 1fr))` }}>
              {lay.pages.map((p, i) => <PreviewPage key={i} p={p} s={s} sheet={lay.sheet} els={els} n={i + 1} of={lay.pages.length} open={(id) => setView(shown.findIndex((e) => e.id === id))} />)}
            </div>
          )}
        </section>
      )}

      {view !== null && shown[view] && (
        <div className="vfModal axLight" role="dialog" aria-modal="true" onClick={(ev) => { if (ev.target === ev.currentTarget) setView(null); }}>
          <div className="axLightBox">
            <div className="axLightHead">
              <b>{view + 1} / {shown.length}</b><span className="muted">{shown[view].name}{shown[view].kind === "pdf" ? ` · pag. ${shown[view].page + 1}` : ""}</span>
              <span className="axBtns">
                <label className="axChk"><input type="checkbox" checked={shown[view].sel} onChange={(e) => patch(shown[view].id, { sel: e.target.checked })} /> în anexă</label>
                <button type="button" className="btn btnGhost btnSm" onClick={() => patch(shown[view].id, { rot: (shown[view].rot + 90) % 360, autoRot: false })}>↻ Rotește</button>
                <button type="button" className="btn btnGhost btnSm" onClick={() => setView(null)}>Închide</button>
              </span>
            </div>
            <div className="axLightImg">
              <button type="button" className="axNav" disabled={view === 0} onClick={() => setView(view - 1)}>‹</button>
              <Big el={shown[view]} />
              <button type="button" className="axNav" disabled={view === shown.length - 1} onClick={() => setView(view + 1)}>›</button>
            </div>
            <input className="input" value={shown[view].desc} placeholder="Descriere (ex: Bucătărie)" onChange={(e) => patch(shown[view].id, { desc: e.target.value })} />
            <small className="muted">← → navighează · Spațiu = în anexă · R = rotește · Esc = închide</small>
          </div>
        </div>
      )}
    </div>
  );
}

/** The elements in a saved order (new ones at the end). */
function order(list: El[], ids?: string[]) {
  if (!ids?.length) return list;
  const at = new Map(ids.map((id, i) => [id, i]));
  return [...list].sort((a, b) => (at.get(a.id) ?? 1e6) - (at.get(b.id) ?? 1e6));
}

/** The pages of a document: a PDF's pages (size, thumbnail), or one page for an image. */
async function pagesOf(d: { id: string; url: string; pdf: boolean; name: string }, saved: Saved | null): Promise<El[]> {
  const kept = (pid: string) => ({ sel: saved?.sel[pid] ?? true, desc: saved?.desc[pid] ?? "", rot: saved?.rot[pid] ?? 0 });
  if (!d.pdf) {
    const im = new Image();
    im.src = d.url;
    await im.decode().catch(() => { throw new Error("imaginea nu se poate citi"); });
    const pid = `${d.id}:0`;
    return [{ id: pid, name: d.name, w: im.naturalWidth, h: im.naturalHeight, ...kept(pid), url: d.url, kind: "img", page: 0, thumb: d.url, taken: null, doc: d.id }];
  }
  const doc = await pdfDoc(d.url).catch((e: Error) => { throw new Error(/password/i.test(e?.message ?? "") ? "PDF cu parolă" : "PDF-ul nu se poate deschide"); });
  const out: El[] = [];
  for (let i = 0; i < doc.numPages; i++) {
    const vp = (await doc.getPage(i + 1)).getViewport({ scale: 1 });
    const pid = `${d.id}:${i}`;
    out.push({ id: pid, name: d.name, w: vp.width, h: vp.height, ...kept(pid), url: d.url, kind: "pdf", page: i, thumb: null, taken: null, doc: d.id });
  }
  // the thumbnails, one by one
  (async () => {
    for (const p of out) {
      const vp = (await doc.getPage(p.page + 1)).getViewport({ scale: 1 });
      const c = await renderPage(d.url, p.page, 360 / Math.max(vp.width, vp.height)).catch(() => null);
      if (c) { p.thumb = c.toDataURL("image/jpeg", 0.82); window.dispatchEvent(new CustomEvent("ax-thumb", { detail: { id: p.id, thumb: p.thumb } })); }
    }
  })();
  return out;
}

/** The full-size element in the lightbox (a PDF page drawn at 1800 px). */
function Big({ el }: { el: El }) {
  const [src, setSrc] = useState<string | null>(el.kind === "img" ? el.url : el.thumb);
  useEffect(() => {
    if (el.kind === "img") { setSrc(el.url); return; }
    let live = true;
    (async () => {
      const d = await pdfDoc(el.url);
      const vp = (await d.getPage(el.page + 1)).getViewport({ scale: 1 });
      const c = await renderPage(el.url, el.page, 1800 / Math.max(vp.width, vp.height));
      if (live) setSrc(c.toDataURL("image/jpeg", 0.9));
    })().catch(() => null);
    return () => { live = false; };
  }, [el.url, el.page, el.kind]);
  return src ? <img src={src} alt="" style={{ transform: `rotate(${el.rot}deg)` }} /> : <span className="axWait">Se încarcă…</span>;
}

/** One page of the preview, to scale: the title, the document title, the pictures, the captions. */
function PreviewPage({ p, s, sheet, els, n, of, open }: { p: Page; s: Settings; sheet: [number, number]; els: El[]; n: number; of: number; open: (id: string) => void }) {
  const [sw, sh] = sheet;
  const pc = (v: number, of_: number) => `${(v / of_) * 100}%`;
  // text sizes relative to the page width (the page box is a container: cqw)
  const fs = (pt: number) => `${((pt * 0.03528) / sw) * 100}cqw`;
  return (
    <figure className="axPage" style={{ aspectRatio: `${sw} / ${sh}` }}>
      {p.title && <div className="axPvText" style={{ left: pc(p.title.x, sw), top: pc(p.title.y, sh), width: pc(p.title.w, sw), fontSize: fs(p.title.size), textAlign: p.title.align }}><b>{p.title.text}</b></div>}
      {p.docTitle && <div className="axPvText" style={{ left: pc(p.docTitle.x, sw), top: pc(p.docTitle.y, sh), width: pc(p.docTitle.w, sw), fontSize: fs(p.docTitle.size), textAlign: p.docTitle.align }}><b>{p.docTitle.text}</b></div>}
      {p.cells.map((c) => {
        const e = els.find((x) => x.id === c.item.id);
        const src = e?.thumb ?? null;
        // the whole rotated image, scaled so that its crop fills the box; the picture itself turned inside it
        const fw = 1 / c.crop.w, fh = 1 / c.crop.h, side = c.item.rot % 180 !== 0;
        const [tw, th] = turned(c.item);
        return (
          <span key={c.item.id}>
            <span className={`axPvImg${s.border !== "none" ? " b" : ""}`} style={{ left: pc(c.x, sw), top: pc(c.y, sh), width: pc(c.w, sw), height: pc(c.h, sh) }} onDoubleClick={() => open(c.item.id)}>
              {src && (
                <span style={{ position: "absolute", left: `${(-c.crop.x / c.crop.w) * 100}%`, top: `${(-c.crop.y / c.crop.h) * 100}%`, width: `${fw * 100}%`, height: `${fh * 100}%` }}>
                  <img src={src} alt="" style={{ position: "absolute", left: "50%", top: "50%", width: side ? `${(th / tw) * 100}%` : "100%", height: side ? `${(tw / th) * 100}%` : "100%",
                    transform: `translate(-50%, -50%) rotate(${c.item.rot}deg)`, objectFit: "fill" }} />
                </span>
              )}
            </span>
            {c.caption && (c.caption.head || c.caption.rest) && (
              <span className="axPvText cap" style={{ left: pc(c.caption.x, sw), top: pc(c.caption.y, sh), width: pc(c.caption.w, sw), fontSize: fs(s.caption.size), WebkitLineClamp: s.caption.lines }}>
                {s.caption.bold ? <b>{c.caption.head}</b> : c.caption.head}{c.caption.rest}
              </span>
            )}
          </span>
        );
      })}
      <figcaption>pag. {n}/{of}</figcaption>
    </figure>
  );
}

/** "Aranjare": photos per page, picture format, captions, title, page, quality. */
function Arrange({ s, set, setIn, mode, reset, cellMax }: {
  s: Settings; mode: Mode; cellMax: [number, number]; reset: () => void;
  set: <K extends keyof Settings>(k: K, v: Settings[K]) => void;
  setIn: <K extends "caption" | "title" | "docTitle" | "page">(k: K, p: Partial<Settings[K]>) => void;
}) {
  const num = (v: string, d: number) => (v === "" || !Number.isFinite(Number(v)) ? d : Number(v));
  return (
    <div className="axArr">
      <section className="card">
        <h2>{mode === "foto" ? "Poze pe pagină" : "Pagini de document pe o pagină"}</h2>
        <div className="axGrids">
          {Object.entries(GRIDS).map(([k, [c, r]]) => (
            <button key={k} type="button" className="axGridPick" aria-pressed={s.perPage === Number(k)} onClick={() => set("perPage", Number(k))}>
              <span style={{ gridTemplateColumns: `repeat(${c}, 1fr)` }}>{Array.from({ length: c * r }, (_, i) => <i key={i} />)}</span><b>{k}</b><small>{c}×{r}</small>
            </button>
          ))}
        </div>
        <p className="hint" style={{ margin: 0 }}>Imagine de cel mult {cellMax[0].toFixed(1)} × {cellMax[1].toFixed(1)} cm.</p>
        {mode === "foto" && <>
          <div className="section">Format imagine</div>
          <div className="segment">{([["contain", "Păstrează proporția"], ["crop", "Decupează uniform"]] as const).map(([k, l]) => <button key={k} type="button" aria-pressed={s.fit === k} onClick={() => set("fit", k)}>{l}</button>)}</div>
          {s.fit === "crop" && <div className="axRow">
            <span className="chips">{RATIOS.map((r) => <button key={r} type="button" className="chip" aria-pressed={s.ratio === r} onClick={() => set("ratio", r)}>{r}</button>)}</span>
            <label className="axChk"><input type="checkbox" checked={s.follow} onChange={(e) => set("follow", e.target.checked)} /> portretele primesc raport vertical</label>
          </div>}
        </>}
        <div className="formRow">
          <label className="field">Spațiu între {mode === "foto" ? "poze" : "pagini"} (mm)<input className="input" type="number" min={0} max={20} step={0.5} value={s.gapMm} onChange={(e) => set("gapMm", num(e.target.value, 4))} /></label>
          <label className="field">Chenar<select className="select" value={s.border} onChange={(e) => set("border", e.target.value as Settings["border"])}><option value="none">fără</option><option value="thin">subțire</option><option value="medium">mediu</option></select></label>
        </div>
        {mode === "acte" && <label className="axChk"><input type="checkbox" checked={s.autoRotate} onChange={(e) => set("autoRotate", e.target.checked)} /> rotește automat paginile landscape (planuri) ca să umple pagina</label>}
      </section>

      <section className="card">
        <h2><label className="axChk"><input type="checkbox" checked={s.caption.on} onChange={(e) => setIn("caption", { on: e.target.checked })} /> Legende sub {mode === "foto" ? "poze" : "pagini"}</label></h2>
        {s.caption.on && <>
          <div className="formRow">
            <label className="field">Prefix<input className="input" value={s.caption.prefix} onChange={(e) => setIn("caption", { prefix: e.target.value })} /></label>
            <label className="field">Începe de la<input className="input" type="number" min={0} value={s.caption.startAt} onChange={(e) => setIn("caption", { startAt: num(e.target.value, 1) })} /></label>
          </div>
          <div className="formRow">
            <label className="field">Mărime font (pt)<input className="input" type="number" min={6} max={14} value={s.caption.size} onChange={(e) => setIn("caption", { size: num(e.target.value, 9) })} /></label>
            <label className="field">Rânduri rezervate<select className="select" value={s.caption.lines} onChange={(e) => setIn("caption", { lines: e.target.value === "2" ? 2 : 1 })}><option value="1">1</option><option value="2">2</option></select></label>
          </div>
          <label className="axChk"><input type="checkbox" checked={s.caption.numbering} onChange={(e) => setIn("caption", { numbering: e.target.checked })} /> numerotare</label>
          <label className="axChk"><input type="checkbox" checked={s.caption.bold} onChange={(e) => setIn("caption", { bold: e.target.checked })} /> prefix îngroșat („<b>Foto 3</b> – Bucătărie”)</label>
          <label className="axChk"><input type="checkbox" checked={s.caption.useName} onChange={(e) => setIn("caption", { useName: e.target.checked })} /> numele fișierului ca descriere, dacă lipsește</label>
        </>}
      </section>

      <section className="card">
        <h2><label className="axChk"><input type="checkbox" checked={s.title.on} onChange={(e) => setIn("title", { on: e.target.checked })} /> Titlu anexă</label></h2>
        {s.title.on && <>
          <label className="field">Text<input className="input" value={s.title.text} onChange={(e) => setIn("title", { text: e.target.value })} placeholder="ANEXA 3 – FOTOGRAFII" /></label>
          <div className="formRow">
            <label className="field">Aliniere<select className="select" value={s.title.align} onChange={(e) => setIn("title", { align: e.target.value === "left" ? "left" : "center" })}><option value="center">centrat</option><option value="left">stânga</option></select></label>
            <label className="field">Mărime (pt)<input className="input" type="number" min={8} max={20} value={s.title.size} onChange={(e) => setIn("title", { size: num(e.target.value, 12) })} /></label>
          </div>
          <label className="axChk"><input type="checkbox" checked={s.title.repeat} onChange={(e) => setIn("title", { repeat: e.target.checked })} /> repetă pe fiecare pagină („… (continuare)”)</label>
        </>}
        {mode === "acte" && <>
          <div className="section"><label className="axChk"><input type="checkbox" checked={s.docTitle.on} onChange={(e) => setIn("docTitle", { on: e.target.checked })} /> Titlu deasupra fiecărui document</label></div>
          {s.docTitle.on && <>
            <label className="field">Prefix <small>({"{n}"} = numărul documentului)</small><input className="input" value={s.docTitle.prefix} onChange={(e) => setIn("docTitle", { prefix: e.target.value })} placeholder="Anexa 3.{n} – " /></label>
            <div className="formRow">
              <label className="field">Aliniere<select className="select" value={s.docTitle.align} onChange={(e) => setIn("docTitle", { align: e.target.value === "center" ? "center" : "left" })}><option value="left">stânga</option><option value="center">centrat</option></select></label>
              <label className="field">Mărime (pt)<input className="input" type="number" min={8} max={20} value={s.docTitle.size} onChange={(e) => setIn("docTitle", { size: num(e.target.value, 11) })} /></label>
            </div>
            <label className="axChk"><input type="checkbox" checked={s.docTitle.repeat} onChange={(e) => setIn("docTitle", { repeat: e.target.checked })} /> repetă titlul pe paginile următoare („… (continuare)”)</label>
          </>}
        </>}
      </section>

      <section className="card">
        <h2>Pagina</h2>
        <div className="segment">{(Object.entries(SHEETS) as [Settings["page"]["format"], [number, number, string]][]).map(([k, [, , l]]) => <button key={k} type="button" aria-pressed={s.page.format === k} onClick={() => setIn("page", { format: k })}>{l}</button>)}</div>
        <div className="formRow axMargins">
          {(["top", "bottom", "left", "right"] as const).map((k) => (
            <label key={k} className="field">Margine {({ top: "sus", bottom: "jos", left: "stânga", right: "dreapta" })[k]} (cm)<input className="input" type="number" min={0} max={6} step={0.1} value={s.page[k]} onChange={(e) => setIn("page", { [k]: num(e.target.value, 2) })} /></label>
          ))}
        </div>
        <div className="section">Calitate imagini</div>
        <div className="segment">{DPI.map(([v, l]) => <button key={v} type="button" aria-pressed={s.dpi === v} title={`${v} dpi`} onClick={() => set("dpi", v)}>{l}</button>)}</div>
        {mode === "acte" && <p className="hint" style={{ margin: 0 }}>În PDF, paginile actelor PDF intră așa cum sunt (text clar, la orice mărire); calitatea contează la imagini și în Word.</p>}
        <button type="button" className="linkBtn" onClick={reset}>Revino la setările implicite</button>
      </section>
    </div>
  );
}
