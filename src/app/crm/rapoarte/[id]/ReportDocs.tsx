"use client";
// The documents of a report as folders, like the folders of Windows: the report's folder holds one folder per asset
// (with „Acte” and „Poze inspecție”), „Dosar de lucru” (where the signed PDF, the working grid and the report in Word are
// uploaded and marked as such) and the folders the team makes. Large icons by default, or details;
// files dragged from the computer onto the window or onto a folder are uploaded there; files and folders dragged onto a
// folder are moved; right click, F2, Del, Enter, Backspace, Ctrl+A as in Windows. A file uploaded with the name of one
// in the same folder replaces it, the earlier versions kept.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PdfThumb } from "@/components/PdfThumb";
import { DOC_KINDS, DOC_KIND_KEYS, docKindLabel, guessDocKind } from "@/lib/doc-kinds";

export type DocItem = {
  id: string; name: string; kind: string | null; asset_id: string | null; status: "uploaded" | "missing"; origin: "report" | "order" | "glide";
  href: string | null; size: number | null; at: string | null; by: string | null; note?: string;
  /** The inspector sees it (ticked; by default the CF extract and the floor survey). Undefined: not a document for the inspector. */
  insp?: boolean;
  /** The final report (PDF signed, delivered): marked so in „Dosar de lucru”, in red. */
  final?: boolean;
  /** Marked as the working grid or the report in Word. */
  role?: "grid" | "word" | null;
  /** What the legal check read from it: the name of the act, its number, date and issuer. */
  read?: { title: string; number: string | null; date: string | null; issuer: string | null };
  /** The folder it sits in (a folder key: root, livrabile, a:<asset>[:acte|:poze], f:<id>). */
  folder: string;
  /** The version of the file (2 and up: it replaced earlier ones, kept). */
  version?: number;
};
export type DocPhoto = { id: string; asset: string; src: string; name: string; group: string; at: string | null; size: number | null };
export type DocFolder = { id: string; parent: string; name: string };

type FNode = { key: string; name: string; parent: string | null; fixed: boolean; asset?: string; sub?: string };
type Entry =
  | { key: string; type: "folder"; name: string; node: FNode }
  | { key: string; type: "doc"; name: string; doc: DocItem }
  | { key: string; type: "photo"; name: string; photo: DocPhoto }
  | { key: string; type: "link"; name: string; href: string; sub: string; folder: string };
type View = "icons" | "details";
type Sort = "name" | "date" | "size" | "type";

const OK = /\.(pdf|jpe?g|png|heic|heif|webp|docx?|xlsx?|zip)$/i;
const IMG = /\.(jpe?g|png|webp|gif)$/i;
const ACCEPT = ".pdf,.jpg,.jpeg,.png,.heic,.heif,.webp,.doc,.docx,.xls,.xlsx,.zip";
const DRAG = "application/x-vf-docs";
/** what a file of „Dosar de lucru” can be marked as (one of each per report) */
const MARKS: [string, string][] = [["final", "Raport PDF final (semnat, livrat)"], ["grid", "Grilă de lucru"], ["word", "Raport Word"]];
const MARK_OK: Record<string, RegExp> = { final: /\.pdf$/i, grid: /\.(xlsx?|xlsm|ods|csv)$/i, word: /\.(docx?|odt|rtf)$/i };
const MARK_WHY: Record<string, string> = { final: "Doar un fișier PDF", grid: "Doar un fișier Excel", word: "Doar un fișier Word" };
const ext = (name: string) => (name.match(/\.(\w{2,4})$/)?.[1] ?? "doc").toUpperCase();
const size = (n: number | null | undefined) => (n == null ? "" : n > 1048576 ? `${(n / 1048576).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const when = (iso: string | null | undefined) => (iso ? new Date(iso.length <= 10 ? `${iso}T12:00:00` : iso).toLocaleString("ro-RO", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Bucharest" }).replace(",", "") : "");
const stamp = (iso: string) => new Date(iso).toLocaleString("ro-RO", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Bucharest" }).replace(".", "");
const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const keyOfDoc = (d: DocItem) => `${d.origin === "order" ? "o" : d.origin === "glide" ? "g" : "r"}:${d.id}`;
const kindOf = (d: DocItem) => (d.final ? "final" : d.kind && DOC_KIND_KEYS.includes(d.kind) ? d.kind : "other");
const typeOf = (e: Entry) => e.type === "folder" ? (e.node.fixed ? "Folder" : "Folder creat") : e.type === "photo" ? `Fotografie · ${e.photo.group}`
  : e.type === "link" ? "Fișă de inspecție" : e.doc.status === "missing" ? "Lipsă" : e.doc.final ? "Raport final" : docKindLabel(kindOf(e.doc));
const dateOf = (e: Entry) => (e.type === "doc" ? e.doc.at : e.type === "photo" ? e.photo.at : null) ?? "";
const sizeOf = (e: Entry) => (e.type === "doc" ? e.doc.size : e.type === "photo" ? e.photo.size : null) ?? -1;
/** what can be dragged to another folder: the report's own files (not the signed report) and the folders made by the team */
const movable = (e: Entry) => (e.type === "doc" && e.doc.origin === "report" && !e.doc.final && e.doc.status === "uploaded") || (e.type === "folder" && !e.node.fixed);

/** „Contract de vânzare-cumpărare nr. 1234 din 08.03.2021 · BNP Popescu”, as read by the legal check. */
const readText = (d: DocItem) => d.read ? `${d.read.title}${d.read.number ? ` nr. ${d.read.number}` : ""}${d.read.date ? ` din ${d.read.date.split("-").reverse().join(".")}` : ""}${d.read.issuer ? ` · ${d.read.issuer}` : ""}` : "";

function FolderIcon({ big, peek }: { big: boolean; peek?: string[] }) {
  return big ? (
    <span className="fxFolder" aria-hidden="true">
      <i className="fxFBack" />
      {(peek ?? []).slice(0, 2).map((src, i) => <img key={i} className={`fxPeek p${i}`} src={src} alt="" loading="lazy" />)}
      {!peek?.length && <><i className="fxPaper p0" /><i className="fxPaper p1" /></>}
      <i className="fxFFront" />
    </span>
  ) : (
    <svg className="fxFolderSm" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M2 6a2 2 0 0 1 2-2h5l2 2h9a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2Z" fill="#e3a031" /><path d="M2 9h20v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2Z" fill="#f6c95f" /></svg>
  );
}

function FileIcon({ name, missing, final, small }: { name: string; missing?: boolean; final?: boolean; small?: boolean }) {
  const x = missing ? "LIPSĂ" : ext(name);
  const k = missing ? "miss" : final ? "final" : /PDF/.test(x) ? "pdf" : /DOCX?/.test(x) ? "doc" : /XLSX?/.test(x) ? "xls" : /JPE?G|PNG|WEBP|HEIC|HEIF|GIF/.test(x) ? "img" : /ZIP/.test(x) ? "zip" : "other";
  return <span className={`fxFile k-${k}${small ? " sm" : ""}`} aria-hidden="true"><i /><i /><i /><b>{x}</b></span>;
}

export function ReportDocs({ report, title, start = "root", assets, items, folders, photos, sheets, edit, remove, deliver, missing, tools, inspOpen = false, inspSent = null }: {
  report: string; title: string;
  /** The folder it opens in (the asset page: the asset's folder). */
  start?: string;
  assets: { id: string; label: string; sub?: string | null }[]; items: DocItem[]; edit: boolean; remove: boolean;
  folders: DocFolder[]; photos: DocPhoto[]; sheets: { asset: string; href: string }[];
  inspOpen?: boolean;
  inspSent?: { at: string; who: string | null } | null;
  deliver?: React.ReactNode;
  missing?: React.ReactNode;
  tools?: React.ReactNode;
}) {
  const router = useRouter();

  // ---------- the folders ----------
  const nodes = useMemo(() => {
    const out: FNode[] = [{ key: "root", name: title, parent: null, fixed: true }];
    assets.forEach((a, i) => {
      out.push({ key: `a:${a.id}`, name: `Bun ${i + 1} · ${a.label}`, parent: "root", fixed: true, asset: a.id, sub: a.sub ?? undefined });
      out.push({ key: `a:${a.id}:acte`, name: "Acte", parent: `a:${a.id}`, fixed: true, asset: a.id });
      out.push({ key: `a:${a.id}:poze`, name: "Poze inspecție", parent: `a:${a.id}`, fixed: true, asset: a.id });
    });
    out.push({ key: "livrabile", name: "Dosar de lucru", parent: "root", fixed: true });
    // the folders made by the team, each under a folder shown here (the ones under an asset not shown are left out)
    const left = [...folders];
    for (let pass = 0; pass < 30 && left.length; pass++) {
      for (let i = left.length - 1; i >= 0; i--) {
        const f = left[i];
        if (out.some((n) => n.key === f.parent) || !/^(a|f):/.test(f.parent)) { out.push({ key: `f:${f.id}`, name: f.name, parent: out.some((n) => n.key === f.parent) ? f.parent : "root", fixed: false }); left.splice(i, 1); }
      }
    }
    return out;
  }, [assets, folders, title]);
  const nodeOf = useCallback((k: string) => nodes.find((n) => n.key === k) ?? nodes[0], [nodes]);
  const docsIn = useCallback((k: string) => items.filter((d) => (nodes.some((n) => n.key === d.folder) ? d.folder : "root") === k), [items, nodes]);
  const entriesIn = useCallback((k: string): Entry[] => {
    const subs = nodes.filter((n) => n.parent === k).map((n): Entry => ({ key: n.key, type: "folder", name: n.name, node: n }));
    const docs = docsIn(k).map((d): Entry => ({ key: keyOfDoc(d), type: "doc", name: d.name, doc: d }));
    const m = k.match(/^a:(.+):poze$/);
    const ph = m ? photos.filter((p) => p.asset === m[1]).map((p): Entry => ({ key: `p:${p.id}`, type: "photo", name: p.name, photo: p })) : [];
    const a = k.match(/^a:([^:]+)$/);
    const sh = a ? sheets.filter((s) => s.asset === a[1]).map((s): Entry => ({ key: `l:${s.asset}`, type: "link", name: "Fișa de inspecție.pdf", href: s.href, sub: "generată din fișa completată", folder: k })) : [];
    return [...subs, ...sh, ...docs, ...ph];
  }, [nodes, docsIn, photos, sheets]);
  /** everything under a folder (its count, the search) */
  const deep = useCallback((k: string): Entry[] => entriesIn(k).flatMap((e) => (e.type === "folder" ? [e, ...deep(e.key)] : [e])), [entriesIn]);
  const countIn = (k: string) => deep(k).filter((e) => e.type !== "folder").length;
  const peekOf = (k: string) => deep(k).flatMap((e) => (e.type === "photo" ? [e.photo.src] : e.type === "doc" && e.doc.href && IMG.test(e.doc.name) ? [e.doc.href] : [])).slice(0, 2);
  const pathOf = (k: string) => { const p: FNode[] = []; let n: FNode | undefined = nodeOf(k); for (let i = 0; n && i < 40; i++) { p.unshift(n); n = n.parent ? nodeOf(n.parent) : undefined; } return p; };

  // ---------- where we are, how it shows ----------
  const [cwd, setCwd] = useState(start);
  const [back, setBack] = useState<string[]>([]);
  const [fwd, setFwd] = useState<string[]>([]);
  const go = (k: string) => { if (k === cwd) return; setBack((b) => [...b, cwd]); setFwd([]); setCwd(k); setSel(new Set()); setQ(""); };
  useEffect(() => { if (!nodes.some((n) => n.key === cwd)) setCwd("root"); }, [nodes, cwd]);
  useEffect(() => { try { const s = sessionStorage.getItem(`vf_fx_${report}_${start}`); if (s) setCwd(s); } catch { /* fără stocare */ } }, [report, start]);
  useEffect(() => { try { sessionStorage.setItem(`vf_fx_${report}_${start}`, cwd); } catch { /* fără stocare */ } }, [cwd, report, start]);
  const [view, setView] = useState<View>("icons");
  useEffect(() => { try { const v = localStorage.getItem("vf_fx_view"); if (v === "icons" || v === "details") setView(v); } catch { /* fără stocare */ } }, []);
  const pickView = (v: View) => { setView(v); try { localStorage.setItem("vf_fx_view", v); } catch { /* fără stocare */ } };
  const [sort, setSort] = useState<[Sort, 1 | -1]>(["name", 1]);
  const [q, setQ] = useState("");

  const shown = useMemo(() => {
    const list = q.trim() ? deep(cwd).filter((e) => fold(e.name).includes(fold(q.trim()))) : entriesIn(cwd);
    const [s, dir] = sort;
    const by = (a: Entry, b: Entry) => s === "date" ? dateOf(a).localeCompare(dateOf(b)) : s === "size" ? sizeOf(a) - sizeOf(b) : s === "type" ? typeOf(a).localeCompare(typeOf(b), "ro") : a.name.localeCompare(b.name, "ro", { numeric: true });
    const folderRank = (e: Entry) => (e.type === "folder" ? (e.node.fixed ? 0 : 1) : 2);
    return [...list].sort((a, b) => folderRank(a) - folderRank(b) || (a.type === "folder" && b.type === "folder" && a.node.fixed && b.node.fixed ? 0 : by(a, b) * dir)
      // the signed report first among the files
      || Number(b.type === "doc" && !!b.doc.final) - Number(a.type === "doc" && !!a.doc.final));
  }, [q, cwd, deep, entriesIn, sort]);

  // ---------- selection ----------
  const [sel, setSel] = useState<Set<string>>(new Set());
  const anchor = useRef<number>(-1);
  const picked = shown.filter((e) => sel.has(e.key));
  const click = (e: React.MouseEvent, i: number, en: Entry) => {
    e.stopPropagation();
    setMenu(null);
    if (e.shiftKey && anchor.current >= 0) {
      const [a, b] = [Math.min(anchor.current, i), Math.max(anchor.current, i)];
      setSel(new Set(shown.slice(a, b + 1).map((x) => x.key)));
      return;
    }
    anchor.current = i;
    if (e.ctrlKey || e.metaKey) setSel((s) => { const n = new Set(s); if (n.has(en.key)) n.delete(en.key); else n.add(en.key); return n; });
    else setSel(new Set([en.key]));
  };
  const open = (en: Entry) => {
    if (en.type === "folder") return go(en.key);
    if (en.type === "doc" && en.doc.status === "missing") { if (edit) pickFor(en.doc); return; }
    const href = en.type === "doc" ? en.doc.href : en.type === "photo" ? en.photo.src : en.href;
    if (href) window.open(href, "_blank", "noopener");
  };

  // ---------- uploading ----------
  const [busy, setBusy] = useState(0);
  const [msg, setMsg] = useState("");
  const [toast, setToast] = useState<{ text: string; doc?: string } | null>(null);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 12000); return () => clearTimeout(t); }, [toast]);
  const input = useRef<HTMLInputElement>(null);
  const forDoc = useRef<DocItem | null>(null);
  const pickFor = (d: DocItem) => { forDoc.current = d; input.current?.click(); };
  const upload = async (list: FileList | File[], to: string, fulfil?: DocItem | null) => {
    const files = [...list];
    const bad = files.filter((f) => !OK.test(f.name));
    setMsg(bad.length ? `Nu se pot încărca: ${bad.map((f) => f.name).join(", ")} (acceptăm PDF, imagini, Word, Excel, ZIP).` : "");
    let done = 0;
    const replaced: { name: string; doc: string; version: number }[] = [];
    const notes: string[] = [];
    for (const file of files.filter((f) => OK.test(f.name))) {
      setBusy((n) => n + 1);
      const body = new FormData();
      body.set("file", file); body.set("kind", "source"); body.set("doc_type", guessDocKind(file.name));
      if (fulfil) body.set("doc", fulfil.id); else body.set("folder", to);
      const r = await fetch(`/api/crm/reports/${report}/documents`, { method: "POST", body }).catch(() => null);
      const d = (await r?.json().catch(() => ({}))) as { error?: string; id?: string; unzipped?: number; skipped?: string[]; replaced?: boolean | string[]; version?: number };
      setBusy((n) => n - 1);
      if (!r?.ok) { setMsg(d?.error ?? `„${file.name}” nu s-a putut încărca.`); continue; }
      done++;
      if (d.unzipped) notes.push(`„${file.name}”: ${d.unzipped} ${d.unzipped === 1 ? "fișier dezarhivat" : "fișiere dezarhivate"}${Array.isArray(d.replaced) && d.replaced.length ? `, ${d.replaced.length} înlocuite (versiunile vechi păstrate)` : ""}${d.skipped?.length ? ` · sărite: ${d.skipped.join(", ")}` : ""}.`);
      else if (d.replaced === true && d.id) replaced.push({ name: file.name, doc: d.id, version: d.version ?? 2 });
    }
    if (notes.length) setMsg(notes.join(" "));
    if (replaced.length === 1) setToast({ text: `„${replaced[0].name}” a fost înlocuit · versiunea anterioară (v${replaced[0].version - 1}) e păstrată`, doc: replaced[0].doc });
    else if (replaced.length > 1) setToast({ text: `${replaced.length} fișiere au înlocuit fișiere cu același nume · versiunile anterioare sunt păstrate` });
    else if (done) setToast({ text: `${done} ${done === 1 ? "fișier încărcat" : "fișiere încărcate"} în ${nodeOf(to).name}` });
    if (done) router.refresh();
  };

  // ---------- moving, renaming, deleting, folders ----------
  const call = async (url: string, method: string, body?: unknown) => {
    const r = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined }).catch(() => null);
    const d = (await r?.json().catch(() => ({}))) as { error?: string; [k: string]: unknown };
    if (!r?.ok) { setMsg(d?.error ?? "Nu s-a putut salva."); return null; }
    setMsg("");
    return d;
  };
  const move = async (list: Entry[], to: string) => {
    const docs = list.filter((e) => e.type === "doc" && movable(e)).map((e) => (e as { doc: DocItem }).doc.id);
    const fl = list.filter((e) => e.type === "folder" && movable(e) && e.key !== to).map((e) => e.key.slice(2));
    if (!docs.length && !fl.length) return setMsg("Doar fișierele raportului și folderele create se pot muta (raportul semnat, actele din comandă și pozele rămân la locul lor).");
    const d = await call(`/api/crm/reports/${report}/documents`, "PATCH", { to, docs, folders: fl });
    if (d) { setToast({ text: `${(d.moved as number) ?? docs.length + fl.length} ${docs.length + fl.length === 1 ? "element mutat" : "elemente mutate"} în ${nodeOf(to).name}` }); setSel(new Set()); router.refresh(); }
  };
  const [renaming, setRenaming] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const rename = async (en: Entry, name: string) => {
    setRenaming(null);
    if (!name.trim() || name.trim() === en.name) return;
    const d = en.type === "folder" ? await call(`/api/crm/reports/${report}/folders`, "PATCH", { id: en.key.slice(2), name })
      : en.type === "doc" ? await call(`/api/crm/reports/${report}/documents`, "PATCH", { rename: en.doc.id, name }) : null;
    if (d) router.refresh();
  };
  const newFolder = async (name: string) => {
    setCreating(false);
    if (!name.trim()) return;
    const d = await call(`/api/crm/reports/${report}/folders`, "POST", { name, parent: cwd });
    if (d) router.refresh();
  };
  const canRename = (e: Entry) => edit && ((e.type === "folder" && !e.node.fixed) || (e.type === "doc" && e.doc.origin === "report" && e.doc.status === "uploaded"));
  const canDelete = (e: Entry) => (e.type === "folder" && !e.node.fixed && edit) || (e.type === "doc" && e.doc.origin === "report" && !e.doc.final && (e.doc.status === "missing" ? edit : remove));
  const del = async (list: Entry[]) => {
    const ok = list.filter(canDelete);
    if (!ok.length) return setMsg("Nimic din selecție nu se poate șterge de aici.");
    const what = ok.length === 1 ? `„${ok[0].name}”` : `cele ${ok.length} elemente selectate`;
    if (!confirm(`Ștergi ${what}?${ok.some((e) => e.type === "doc" && (e.doc.version ?? 1) > 1) ? " Se șterg și versiunile anterioare." : ""}`)) return;
    setBusy((n) => n + 1);
    for (const e of ok) {
      if (e.type === "folder") await call(`/api/crm/reports/${report}/folders?folder=${encodeURIComponent(e.key.slice(2))}`, "DELETE");
      else if (e.type === "doc") await call(`/api/crm/reports/${report}/documents?doc=${encodeURIComponent(e.doc.id)}`, "DELETE");
    }
    setBusy((n) => n - 1);
    setSel(new Set());
    router.refresh();
  };
  const mark = async (d: DocItem, role: string | null) => {
    if (await call(`/api/crm/reports/${report}/documents`, "PATCH", { mark: d.id, role })) {
      setToast({ text: role ? `„${d.name}” e marcat ca ${MARKS.find(([k]) => k === role)![1]}` : `„${d.name}” nu mai e marcat` });
      router.refresh();
    }
  };
  const setType = async (d: DocItem, t: string) => { if (await call(`/api/crm/reports/${report}/documents`, "PATCH", { doc: d.id, doc_type: t })) router.refresh(); };

  // ---------- the inspector's ticks (sent all at once, „Actualizează la inspector”) ----------
  const [ticks, setTicks] = useState<Record<string, boolean>>({});
  useEffect(() => { setTicks({}); }, [items]);
  const tickOf = (d: DocItem) => ticks[keyOfDoc(d)] ?? !!d.insp;
  const changedTicks = items.filter((d) => d.insp !== undefined && d.origin !== "glide" && ticks[keyOfDoc(d)] !== undefined && ticks[keyOfDoc(d)] !== !!d.insp);
  const canTick = (d: DocItem) => edit && inspOpen && d.insp !== undefined && d.origin !== "glide" && d.status !== "missing";
  const [sending, setSending] = useState(false);
  const [sentMsg, setSentMsg] = useState("");
  const sendTicks = async () => {
    setSending(true); setSentMsg("");
    const d = await call(`/api/crm/reports/${report}/documents`, "PATCH", { insp: changedTicks.map((x) => ({ doc: x.id, origin: x.origin, on: tickOf(x) })) });
    setSending(false);
    if (d) { setSentMsg(d.sent ? "Actualizat la inspector; anunțat în UVALO." : "Actualizat la inspector."); router.refresh(); }
  };

  // ---------- versions ----------
  const [versions, setVersions] = useState<{ doc: DocItem; list: { id: string; version: number; filename: string; size_bytes: number | null; uploaded_at: string | null; by: string | null }[] | null } | null>(null);
  const showVersions = async (d: DocItem) => {
    setVersions({ doc: d, list: null });
    const r = await fetch(`/api/crm/reports/${report}/documents/${d.id}/versions`).then((x) => x.json() as Promise<{ versions?: [] }>).catch(() => null);
    setVersions({ doc: d, list: r?.versions ?? [] });
  };
  const restore = async (d: DocItem, v: string) => { if (await call(`/api/crm/reports/${report}/documents`, "PATCH", { restore: d.id, version: v })) { setVersions(null); setToast({ text: `Versiunea aleasă a lui „${d.name}” e acum cea curentă (cea de dinainte e păstrată).` }); router.refresh(); } };
  const undoReplace = async (docId: string) => {
    const r = await fetch(`/api/crm/reports/${report}/documents/${docId}/versions`).then((x) => x.json() as Promise<{ versions?: { id: string }[] }>).catch(() => null);
    const v = r?.versions?.[0];
    if (v && (await call(`/api/crm/reports/${report}/documents`, "PATCH", { restore: docId, version: v.id }))) { setToast({ text: "Înlocuirea a fost anulată: fișierul de dinainte e din nou cel curent." }); router.refresh(); }
  };

  // ---------- context menu ----------
  const [menu, setMenu] = useState<{ x: number; y: number; mode: "main" | "move" | "type" } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const onMenu = (e: React.MouseEvent, en: Entry | null) => {
    e.preventDefault(); e.stopPropagation();
    if (en && !sel.has(en.key)) setSel(new Set([en.key]));
    if (!en) setSel(new Set());
    const r = box.current!.getBoundingClientRect();
    setMenu({ x: Math.min(e.clientX - r.left, r.width - 250), y: e.clientY - r.top, mode: "main" });
  };
  useEffect(() => {
    if (!menu) return;
    const off = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest?.(".fxMenu")) setMenu(null); };
    window.addEventListener("mousedown", off);
    return () => window.removeEventListener("mousedown", off);
  }, [menu]);
  const one = picked.length === 1 ? picked[0] : null;
  const zipHref = (list: Entry[]) => {
    const ids = list.flatMap((e) => (e.type === "doc" && e.doc.status === "uploaded" && e.doc.origin !== "glide" ? [keyOfDoc(e.doc)] : []));
    return `/api/crm/reports/${report}/documents/zip${ids.length ? `?ids=${ids.join(",")}` : ""}`;
  };
  const allFolders = nodes.map((n) => ({ n, depth: pathOf(n.key).length - 1 }));
  const targets = allFolders.filter(({ n }) => !picked.some((p) => p.type === "folder" && pathOf(n.key).some((x) => x.key === p.key)));

  // ---------- drag and drop ----------
  const [over, setOver] = useState<string | null>(null);
  const dragged = useRef<Entry[]>([]);
  const dragStart = (e: React.DragEvent, en: Entry) => {
    if (!edit || !movable(en)) { e.preventDefault(); return; }
    const list = sel.has(en.key) ? picked.filter(movable) : [en];
    if (!sel.has(en.key)) setSel(new Set([en.key]));
    dragged.current = list;
    e.dataTransfer.setData(DRAG, list.map((x) => x.key).join(","));
    e.dataTransfer.effectAllowed = "move";
  };
  const accepts = (e: React.DragEvent) => edit && (e.dataTransfer.types.includes("Files") || e.dataTransfer.types.includes(DRAG));
  const dropOn = (k: string) => ({
    onDragOver: (e: React.DragEvent) => { if (!accepts(e)) return; e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = e.dataTransfer.types.includes("Files") ? "copy" : "move"; setOver(k); },
    onDragLeave: (e: React.DragEvent) => { if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as globalThis.Node | null)) setOver((o) => (o === k ? null : o)); },
    onDrop: (e: React.DragEvent) => {
      if (!accepts(e)) return;
      e.preventDefault(); e.stopPropagation(); setOver(null);
      if (e.dataTransfer.files.length) upload(e.dataTransfer.files, k);
      else if (e.dataTransfer.getData(DRAG)) move(dragged.current, k);
    },
  });

  // ---------- keyboard ----------
  const onKey = (e: React.KeyboardEvent) => {
    if ((e.target as HTMLElement).tagName === "INPUT") return;
    if (e.key === "Escape") { setMenu(null); setSel(new Set()); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") { e.preventDefault(); setSel(new Set(shown.map((x) => x.key))); }
    else if (e.key === "Enter" && one) { e.preventDefault(); open(one); }
    else if (e.key === "F2" && one && canRename(one)) { e.preventDefault(); setRenaming(one.key); }
    else if (e.key === "Delete" && picked.length) { e.preventDefault(); del(picked); }
    else if ((e.key === "Backspace" || (e.altKey && e.key === "ArrowUp")) && nodeOf(cwd).parent) { e.preventDefault(); go(nodeOf(cwd).parent!); }
  };

  const node = nodeOf(cwd);
  const path = pathOf(cwd);
  const nFolders = shown.filter((e) => e.type === "folder").length;
  const selSize = picked.reduce((s, e) => s + Math.max(0, sizeOf(e)), 0);
  const hasTicks = items.some((d) => d.insp !== undefined && d.origin !== "glide");
  const where = (e: Entry) => { const f = e.type === "folder" ? e.node.parent : e.type === "doc" ? e.doc.folder : e.type === "photo" ? `a:${e.photo.asset}:poze` : e.folder; return f ? nodeOf(f).name : ""; };

  const nameEdit = (en: Entry) => (
    <input className="fxRename" defaultValue={en.name} autoFocus aria-label="Nume nou" onClick={(e) => e.stopPropagation()}
      onFocus={(e) => { const dot = e.target.value.lastIndexOf("."); e.target.setSelectionRange(0, en.type === "doc" && dot > 0 ? dot : e.target.value.length); }}
      onKeyDown={(e) => { if (e.key === "Enter") rename(en, e.currentTarget.value); if (e.key === "Escape") setRenaming(null); e.stopPropagation(); }}
      onBlur={(e) => rename(en, e.target.value)} />
  );
  const tag = (en: Entry) => en.type === "doc" ? (
    en.doc.final ? <em className="fxTag red">RAPORT FINAL</em>
      : en.doc.role === "grid" ? <em className="fxTag green">GRILĂ</em>
      : en.doc.role === "word" ? <em className="fxTag blue">RAPORT WORD</em>
      : en.doc.status === "missing" ? <em className="fxTag red">lipsă</em>
      : (en.doc.version ?? 1) > 1 ? <em className="fxTag blue">v{en.doc.version}</em>
      : en.doc.origin === "order" ? <em className="fxTag">din comandă</em>
      : en.doc.origin === "glide" ? <em className="fxTag">vechiul CRM</em> : null
  ) : en.type === "folder" && !en.node.fixed ? null : null;
  const sub = (en: Entry) => en.type === "folder" ? `${countIn(en.key)} ${countIn(en.key) === 1 ? "element" : "elemente"}`
    : en.type === "photo" ? en.photo.group : en.type === "link" ? en.sub
    : en.doc.status === "missing" ? "cerut · blochează predarea" : [typeOf(en), size(en.doc.size)].filter(Boolean).join(" · ");

  const icon = (en: Entry, big: boolean) => en.type === "folder" ? <FolderIcon big={big} peek={big ? peekOf(en.key) : undefined} />
    : en.type === "photo" ? (big ? <img className="fxThumb" src={en.photo.src} alt="" loading="lazy" draggable={false} /> : <FileIcon name={en.name} small />)
    : en.type === "link" ? <FileIcon name="x.pdf" small={!big} />
    : big && en.doc.href && IMG.test(en.doc.name) ? <img className="fxThumb" src={en.doc.href} alt="" loading="lazy" draggable={false} />
    : big && en.doc.href && /\.pdf$/i.test(en.doc.name) && (en.doc.size ?? 0) < 8 * 1048576 ? <span className={`fxPdf${en.doc.final ? " final" : ""}`}><PdfThumb url={en.doc.href} width={92} /><b>PDF</b></span>
    : <FileIcon name={en.name} missing={en.doc.status === "missing"} final={en.doc.final} small={!big} />;

  const itemProps = (en: Entry, i: number) => ({
    draggable: edit && movable(en),
    onDragStart: (e: React.DragEvent) => dragStart(e, en),
    onClick: (e: React.MouseEvent) => click(e, i, en),
    onDoubleClick: () => open(en),
    onContextMenu: (e: React.MouseEvent) => onMenu(e, en),
    ...(en.type === "folder" ? dropOn(en.key) : {}),
  });

  const head = (k: Sort, label: string, cls?: string) => (
    <th scope="col" className={cls} aria-sort={sort[0] === k ? (sort[1] === 1 ? "ascending" : "descending") : "none"}>
      <button type="button" onClick={() => setSort(([s, d]) => [k, s === k ? (d === 1 ? -1 : 1) : 1])}>{label}{sort[0] === k ? (sort[1] === 1 ? " ▴" : " ▾") : ""}</button>
    </th>
  );

  const explorer = (
    <section className={`card flush fx${over === cwd ? " over" : ""}`} aria-label="Actele raportului">
      <div className="fxBar">
        <span className="fxNav">
          <button type="button" aria-label="Înapoi" title="Înapoi" disabled={!back.length} onClick={() => { const b = back[back.length - 1]; setBack(back.slice(0, -1)); setFwd([cwd, ...fwd]); setCwd(b); setSel(new Set()); }}>←</button>
          <button type="button" aria-label="Înainte" title="Înainte" disabled={!fwd.length} onClick={() => { const f = fwd[0]; setFwd(fwd.slice(1)); setBack([...back, cwd]); setCwd(f); setSel(new Set()); }}>→</button>
          <button type="button" aria-label="Un nivel mai sus" title="Un nivel mai sus (Backspace)" disabled={!node.parent} onClick={() => node.parent && go(node.parent)}>↑</button>
        </span>
        <nav className="fxPath" aria-label="Adresa">
          <FolderIcon big={false} />
          {path.map((p, i) => (
            <span key={p.key} className="fxCrumb">
              {i > 0 && <span className="fxSep" aria-hidden="true">›</span>}
              <button type="button" className={over === p.key ? "over" : ""} aria-current={p.key === cwd ? "location" : undefined} onClick={() => go(p.key)} {...dropOn(p.key)}>{p.name}</button>
            </span>
          ))}
        </nav>
        <label className="fxSearch">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Caută în ${node.name}`} aria-label={`Caută în ${node.name} și în subfoldere`} />
        </label>
      </div>
      <div className="fxTools">
        {edit && <button type="button" className="btn btnSm" onClick={() => { setCreating(true); setSel(new Set()); }}>＋ Folder nou</button>}
        {edit && <button type="button" className="btn btnGhost btnSm" disabled={busy > 0} onClick={() => { forDoc.current = null; input.current?.click(); }}>⤒ Încarcă</button>}
        {picked.length > 0 && <>
          <a className="btn btnGhost btnSm" href={picked.length === 1 && picked[0].type === "doc" && picked[0].doc.href ? picked[0].doc.href : zipHref(picked)} download>Descarcă{picked.length > 1 ? " (ZIP)" : ""}</a>
          {edit && picked.some(movable) && <button type="button" className="btn btnGhost btnSm" onClick={(e) => { const r = box.current!.getBoundingClientRect(); const b = (e.currentTarget as HTMLElement).getBoundingClientRect(); setMenu({ x: b.left - r.left, y: b.bottom - r.top + 4, mode: "move" }); }}>Mută în…</button>}
          {one && canRename(one) && <button type="button" className="btn btnGhost btnSm" onClick={() => setRenaming(one.key)}>Redenumește</button>}
          {picked.some(canDelete) && <button type="button" className="btn btnGhost btnSm danger" onClick={() => del(picked)}>Șterge</button>}
        </>}
        <span className="fxGrow" />
        {busy > 0 && <span className="muted fxBusy">Se încarcă…</span>}
        <a className="btn btnGhost btnSm" href={zipHref([])} title="Toate actele, pe foldere">Descarcă tot (ZIP)</a>
        <div className="segment fxViews" role="group" aria-label="Vizualizare">
          <button type="button" aria-pressed={view === "icons"} onClick={() => pickView("icons")}>▦ Pictograme</button>
          <button type="button" aria-pressed={view === "details"} onClick={() => pickView("details")}>☰ Detalii</button>
        </div>
      </div>
      {msg && <p className="adMsg pad" role="alert">{msg}</p>}
      {cwd === "livrabile" && (() => {
        const d = one?.type === "doc" && one.doc.origin === "report" && one.doc.status === "uploaded" ? one.doc : null;
        const roleOf = (x: DocItem) => (x.final ? "final" : x.role ?? null);
        const has = (r: string) => items.find((x) => roleOf(x) === r);
        if (!d) return (
          <div className="fxMark hint">
            <span>{edit ? "Dă click pe un fișier ca să-l marchezi:" : "Marcate:"}</span>
            {MARKS.map(([k, l]) => <span key={k} className={`fxMarkState${has(k) ? " ok" : ""}`}>{has(k) ? "✓" : "○"} {l}{has(k) ? <small> · {has(k)!.name}</small> : null}</span>)}
          </div>
        );
        return (
          <div className="fxMark">
            <span className="fxMarkWhat">Marchează <b>{d.name}</b> ca:</span>
            <span className="fxMarkBtns" role="group" aria-label="Ce este fișierul">
              {MARKS.map(([k, l]) => (
                <button key={k} type="button" aria-pressed={roleOf(d) === k} disabled={!edit || !MARK_OK[k].test(d.name)} title={MARK_OK[k].test(d.name) ? (has(k) && roleOf(d) !== k ? `Înlocuiește marcajul de pe „${has(k)!.name}”` : undefined) : MARK_WHY[k]}
                  onClick={() => mark(d, roleOf(d) === k ? null : k)}>{roleOf(d) === k ? "✓ " : ""}{l}</button>
              ))}
            </span>
          </div>
        );
      })()}

      <div ref={box} className={`fxBody ${view}`} tabIndex={0} onKeyDown={onKey} onClick={() => { setSel(new Set()); setMenu(null); }} onContextMenu={(e) => onMenu(e, null)} {...dropOn(cwd)}>
        {shown.length === 0 && !creating ? (
          <div className="fxEmpty">
            {q ? "Nimic cu acest nume aici." : <>Folderul e gol.{edit && <><br />Trage fișiere aici ca să le încarci.</>}</>}
          </div>
        ) : view === "icons" ? (
          <div className="fxGrid" role="listbox" aria-multiselectable="true" aria-label={node.name}>
            {creating && (
              <div className="fxItem on" role="option" aria-selected="true"><FolderIcon big />
                <input className="fxRename" defaultValue="Folder nou" autoFocus aria-label="Numele folderului" onFocus={(e) => e.target.select()} onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => { if (e.key === "Enter") newFolder(e.currentTarget.value); if (e.key === "Escape") setCreating(false); e.stopPropagation(); }} onBlur={(e) => newFolder(e.target.value)} /></div>
            )}
            {shown.map((en, i) => (
              <div key={en.key} role="option" aria-selected={sel.has(en.key)} title={[en.name, en.type === "doc" ? readText(en.doc) : "", q ? `în ${where(en)}` : ""].filter(Boolean).join("\n")}
                className={`fxItem${sel.has(en.key) ? " on" : ""}${over === en.key ? " over" : ""}${en.type === "doc" && en.doc.status === "missing" ? " miss" : ""}`} {...itemProps(en, i)}>
                <span className="fxIco">{icon(en, true)}
                  {en.type === "doc" && en.doc.insp !== undefined && tickOf(en.doc) && en.doc.status !== "missing" && <em className="fxInsp" title="Vizibil inspectorului">la inspector</em>}
                </span>
                {renaming === en.key ? nameEdit(en) : <span className={`fxName${en.type === "doc" && en.doc.final ? " red" : ""}`}>{en.name}</span>}
                <small className="fxSub">{tag(en)}{q ? `în ${where(en)}` : sub(en)}</small>
              </div>
            ))}
          </div>
        ) : (
          <div className="tableWrap">
            <table className="table fxTable">
              <thead><tr>{head("name", "Nume")}{head("date", "Data modificării", "w150")}{head("type", "Tip", "w150")}{head("size", "Mărime", "w90 num")}{hasTicks && <th scope="col" className="w110">La inspector</th>}<th scope="col" className="w130">Încărcat de</th></tr></thead>
              <tbody>
                {creating && (
                  <tr className="on"><td colSpan={hasTicks ? 6 : 5}><span className="fxRowName"><FolderIcon big={false} />
                    <input className="fxRename" defaultValue="Folder nou" autoFocus aria-label="Numele folderului" onFocus={(e) => e.target.select()} onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => { if (e.key === "Enter") newFolder(e.currentTarget.value); if (e.key === "Escape") setCreating(false); e.stopPropagation(); }} onBlur={(e) => newFolder(e.target.value)} /></span></td></tr>
                )}
                {shown.map((en, i) => (
                  <tr key={en.key} aria-selected={sel.has(en.key)} className={`${sel.has(en.key) ? "on" : ""}${over === en.key ? " over" : ""}${en.type === "doc" && en.doc.status === "missing" ? " miss" : ""}`} {...itemProps(en, i)}>
                    <td><span className="fxRowName">{icon(en, false)}
                      <span className="fxRowText">{renaming === en.key ? nameEdit(en) : <b className={en.type === "doc" && en.doc.final ? "red" : ""}>{en.name}</b>}
                        {(en.type === "doc" && readText(en.doc)) || q ? <small>{q ? `în ${where(en)}` : en.type === "doc" ? readText(en.doc) : ""}</small> : null}</span>
                      {tag(en)}</span></td>
                    <td className="nowrap">{en.type === "doc" ? when(en.doc.at) : en.type === "photo" ? when(en.photo.at) : ""}</td>
                    <td>{en.type === "folder" ? `${typeOf(en)} · ${countIn(en.key)} el.` : typeOf(en)}</td>
                    <td className="num mono">{en.type === "doc" ? size(en.doc.size) : en.type === "photo" ? size(en.photo.size) : ""}</td>
                    {hasTicks && <td>{en.type === "doc" && en.doc.insp !== undefined && en.doc.status !== "missing" ? (
                      canTick(en.doc) ? <label className={`rdInsp${tickOf(en.doc) ? " on" : ""}${changedTicks.includes(en.doc) ? " changed" : ""}`} onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={tickOf(en.doc)} onChange={(e) => { setSentMsg(""); setTicks((t) => ({ ...t, [keyOfDoc((en as { doc: DocItem }).doc)]: e.target.checked })); }} /><span>vizibil</span></label>
                        : tickOf(en.doc) ? <span className="rdInsp on">vizibil</span> : <span className="muted">—</span>) : null}</td>}
                    <td>{en.type === "doc" ? en.doc.by ?? (en.doc.origin === "order" ? "din comandă" : "") : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {menu && (
          <div className="fxMenu" role="menu" style={{ left: menu.x, top: menu.y }} onClick={(e) => e.stopPropagation()} onContextMenu={(e) => e.preventDefault()}>
            {menu.mode === "move" ? <>
              <button type="button" role="menuitem" className="fxMBack" onClick={() => setMenu({ ...menu, mode: "main" })}>‹ Mută în…</button>
              {targets.map(({ n, depth }) => (
                <button key={n.key} type="button" role="menuitem" disabled={n.key === cwd} style={{ paddingLeft: 10 + depth * 14 }} onClick={() => { setMenu(null); move(picked, n.key); }}>
                  <FolderIcon big={false} /><span>{n.name}</span></button>
              ))}
            </> : menu.mode === "type" && one?.type === "doc" ? <>
              <button type="button" role="menuitem" className="fxMBack" onClick={() => setMenu({ ...menu, mode: "main" })}>‹ Tip document</button>
              {DOC_KINDS.map(([k, l]) => <button key={k} type="button" role="menuitemradio" aria-checked={kindOf(one.doc) === k} onClick={() => { setMenu(null); setType(one.doc, k); }}><span className="fxMIc">{kindOf(one.doc) === k ? "✓" : ""}</span><span>{l}</span></button>)}
            </> : picked.length === 0 ? <>
              {edit && <button type="button" role="menuitem" onClick={() => { setMenu(null); setCreating(true); }}><span className="fxMIc">＋</span><span>Folder nou</span></button>}
              {edit && <button type="button" role="menuitem" onClick={() => { setMenu(null); forDoc.current = null; input.current?.click(); }}><span className="fxMIc">⤒</span><span>Încarcă fișiere aici</span></button>}
              <a role="menuitem" href={zipHref([])} onClick={() => setMenu(null)}><span className="fxMIc">⤓</span><span>Descarcă tot (ZIP)</span></a>
              <button type="button" role="menuitem" onClick={() => { setMenu(null); pickView(view === "icons" ? "details" : "icons"); }}><span className="fxMIc">{view === "icons" ? "☰" : "▦"}</span><span>{view === "icons" ? "Vizualizare Detalii" : "Vizualizare Pictograme"}</span></button>
            </> : <>
              {one && <button type="button" role="menuitem" onClick={() => { setMenu(null); open(one); }}><span className="fxMIc">↗</span><span>{one.type === "doc" && one.doc.status === "missing" ? "Încarcă actul cerut" : "Deschide"}</span><small>Enter</small></button>}
              {picked.some((e) => e.type !== "folder" && (e.type !== "doc" || e.doc.status === "uploaded")) && (
                <a role="menuitem" download onClick={() => setMenu(null)} href={one && one.type === "doc" && one.doc.href ? one.doc.href : one && one.type === "photo" ? one.photo.src : zipHref(picked)}><span className="fxMIc">⤓</span><span>Descarcă{picked.length > 1 ? " (ZIP)" : ""}</span></a>
              )}
              {one && canRename(one) && <button type="button" role="menuitem" onClick={() => { setMenu(null); setRenaming(one.key); }}><span className="fxMIc">✎</span><span>Redenumește</span><small>F2</small></button>}
              {edit && picked.some(movable) && <button type="button" role="menuitem" onClick={() => setMenu({ ...menu, mode: "move" })}><span className="fxMIc">→</span><span>Mută în</span><small>›</small></button>}
              {one?.type === "doc" && one.doc.origin === "report" && !one.doc.final && one.doc.status === "uploaded" && edit && <button type="button" role="menuitem" onClick={() => setMenu({ ...menu, mode: "type" })}><span className="fxMIc">▤</span><span>Tip document · {docKindLabel(kindOf(one.doc))}</span><small>›</small></button>}
              {one?.type === "doc" && one.doc.origin === "report" && one.doc.status === "uploaded" && edit && MARKS.filter(([k]) => MARK_OK[k].test(one.name)).map(([k, l]) => {
                const on = (one.doc.final ? "final" : one.doc.role) === k;
                return <button key={k} type="button" role="menuitemcheckbox" aria-checked={on} onClick={() => { setMenu(null); mark((one as { doc: DocItem }).doc, on ? null : k); }}><span className="fxMIc">{on ? "✓" : "★"}</span><span>{on ? `Marcat: ${l}` : `Marchează ca ${l}`}</span></button>;
              })}
              {one?.type === "doc" && canTick(one.doc) && <button type="button" role="menuitemcheckbox" aria-checked={tickOf(one.doc)} onClick={() => { setMenu(null); setSentMsg(""); setTicks((t) => ({ ...t, [keyOfDoc((one as { doc: DocItem }).doc)]: !tickOf((one as { doc: DocItem }).doc) })); }}><span className="fxMIc">{tickOf(one.doc) ? "✓" : ""}</span><span>Vizibil la inspector</span></button>}
              {one?.type === "doc" && one.doc.origin === "report" && (one.doc.version ?? 1) > 1 && <button type="button" role="menuitem" onClick={() => { setMenu(null); showVersions((one as { doc: DocItem }).doc); }}><span className="fxMIc">⟲</span><span>Versiuni ({one.doc.version})</span></button>}
              {picked.some(canDelete) && <><i className="fxMSep" /><button type="button" role="menuitem" className="danger" onClick={() => { setMenu(null); del(picked); }}><span className="fxMIc">✕</span><span>{one?.type === "doc" && one.doc.status === "missing" ? "Anulează cererea" : "Șterge"}</span><small>Del</small></button></>}
            </>}
          </div>
        )}
      </div>

      <div className="fxStatus">
        <span>{nFolders ? `${nFolders} ${nFolders === 1 ? "folder" : "foldere"}, ` : ""}{shown.length - nFolders} {shown.length - nFolders === 1 ? "fișier" : "fișiere"}</span>
        {picked.length > 0 && <span>{picked.length} {picked.length === 1 ? "selectat" : "selectate"}{selSize ? ` · ${size(selSize)}` : ""}</span>}
        <span className="fxGrow" />
        <span className="muted">{edit ? `Trage fișiere în fereastră sau pe un folder ca să le încarci · dublu-click deschide · F2 redenumește · Del șterge` : "Dublu-click deschide"}</span>
      </div>

      {edit && hasTicks && (
        <div className="rdInspBar">
          <span className="rdInspNote">
            <span className="muted">{!inspOpen ? "Bifele „La inspector” (vizualizarea Detalii sau click-dreapta) se trimit când raportul are o inspecție alocată și nefinalizată."
              : changedTicks.length ? `${changedTicks.length} ${changedTicks.length === 1 ? "modificare" : "modificări"} netrimise inspectorului`
              : sentMsg || "Schimbă bifele „La inspector” (Detalii sau click-dreapta), apoi actualizează."}</span>
            {inspSent && <small className="muted">Lista de acte a inspectorului actualizată {stamp(inspSent.at)}{inspSent.who ? ` · ${inspSent.who}` : ""}</small>}
          </span>
          <button type="button" className="btn btnGhost btnSm rdInspBtn" disabled={!inspOpen || !changedTicks.length || sending} onClick={sendTicks}>{sending ? "Se actualizează…" : "Actualizează la inspector"}</button>
        </div>
      )}
      {missing && <div className="rdMissing">{missing}</div>}

      <input ref={input} type="file" multiple hidden accept={ACCEPT} onChange={(e) => { if (e.target.files?.length) upload(e.target.files, cwd, forDoc.current); forDoc.current = null; e.target.value = ""; }} />

      {toast && (
        <div className="fxToast" role="status">
          <span className="fxToastOk" aria-hidden="true">✓</span><span>{toast.text}</span>
          {toast.doc && <>
            <button type="button" className="linkBtn" onClick={() => { const d = items.find((x) => x.id === toast.doc); if (d) showVersions(d); setToast(null); }}>Vezi versiunile</button>
            <button type="button" className="linkBtn" onClick={() => { const d = toast.doc!; setToast(null); undoReplace(d); }}>Anulează</button>
          </>}
          <button type="button" className="fxToastX" aria-label="Închide" onClick={() => setToast(null)}>×</button>
        </div>
      )}

      {versions && (
        <div className="vfModal" role="dialog" aria-modal="true" aria-label={`Versiunile lui ${versions.doc.name}`} onClick={(e) => { if (e.target === e.currentTarget) setVersions(null); }}>
          <div className="vfModalBox fxVer">
            <div className="cardHead"><h2>Versiuni · {versions.doc.name}</h2><button type="button" className="btn btnGhost btnSm" aria-label="Închide" onClick={() => setVersions(null)}>×</button></div>
            <ul className="fxVerList">
              <li className="cur"><b>v{versions.doc.version ?? 1}</b><span><span>{when(versions.doc.at)}</span><small>{[versions.doc.by, size(versions.doc.size)].filter(Boolean).join(" · ")}</small></span><em>CURENTĂ</em>
                {versions.doc.href && <a className="link" href={versions.doc.href} target="_blank" rel="noopener">Deschide</a>}</li>
              {versions.list === null ? <li className="muted">Se încarcă…</li> : versions.list.map((v) => (
                <li key={v.id}><b>v{v.version}</b><span><span>{when(v.uploaded_at)}</span><small>{[v.filename !== versions.doc.name ? v.filename : null, v.by, size(v.size_bytes)].filter(Boolean).join(" · ")}</small></span>
                  <a className="link" href={`/api/crm/reports/${report}/documents/${versions.doc.id}?v=${v.id}`} target="_blank" rel="noopener">Deschide</a>
                  {edit && <button type="button" className="linkBtn" onClick={() => restore(versions.doc, v.id)}>Restaurează</button>}</li>
              ))}
            </ul>
            <p className="hint">Un fișier încărcat cu același nume în același folder îl înlocuiește pe cel vechi; versiunile anterioare rămân aici. Restaurarea nu șterge nimic.</p>
          </div>
        </div>
      )}
    </section>
  );

  return (
    <div className={`rdLayout${deliver ? "" : " noDeliver"}`}>
      {explorer}
      {deliver && <div className="rdSideCol">{tools && <div className="rdTools">{tools}</div>}<aside className="rdDeliver">{deliver}</aside></div>}
    </div>
  );
}
