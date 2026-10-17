"use client";
// The photos of an asset, in groups (the room taken in UVALO, the category of the CRM app, or a group made here):
// dragged between groups and reordered, one chosen as the cover, and downloaded as a ZIP (all, or the selected ones).
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { makeZip, type ZipEntry } from "@/lib/zip";

export type Photo = { id: string; inspection: string; src: string; group: string; label: string; taken_at: string | null };
type Insp = { id: string; label: string };

const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "image/gif": "gif" };
const safe = (s: string) => s.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim().slice(0, 60) || "foto";
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("ro-RO", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).replace(".", "") : "");

export function AssetPhotos({ report, inspections, photos, covers, edit, name }: {
  report: string; inspections: Insp[]; photos: Photo[];
  /** the cover photo of each inspection (its sheet's profile photo) */
  covers: Record<string, string | null>;
  edit: boolean; name: string;
}) {
  const router = useRouter();
  const [list, setList] = useState(photos);
  const [ins, setIns] = useState(inspections[0]?.id ?? "");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [cover, setCover] = useState(covers);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [zip, setZip] = useState<string | null>(null);
  const [view, setView] = useState<number | null>(null);
  const [extra, setExtra] = useState<string[]>([]);
  useEffect(() => setList(photos), [photos]);

  const mine = useMemo(() => list.filter((p) => p.inspection === ins), [list, ins]);
  const groups = useMemo(() => {
    const g: string[] = [];
    for (const p of mine) if (!g.includes(p.group)) g.push(p.group);
    for (const x of extra) if (!g.includes(x)) g.push(x);
    return g;
  }, [mine, extra]);
  const flat = useMemo(() => groups.flatMap((g) => mine.filter((p) => p.group === g)), [groups, mine]);

  const save = async (next: Photo[]) => {
    const prev = list;
    setList(next);
    const moves = groups.concat(next.filter((p) => p.inspection === ins && !groups.includes(p.group)).map((p) => p.group))
      .flatMap((g) => next.filter((p) => p.inspection === ins && p.group === g)).map((p, i) => ({ id: p.id, album: p.group, sort: i }));
    const r = await fetch(`/api/crm/reports/${report}/photos`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ inspection: ins, moves }) }).catch(() => null);
    if (!r?.ok) { setList(prev); setMsg({ ok: false, t: ((await r?.json().catch(() => ({}))) as { error?: string })?.error ?? "Nu am putut salva ordinea." }); }
    else setMsg(null);
  };
  /** Moves the dragged photo before `before` (a photo id) or at the end of group `g`. */
  const drop = (g: string, before: string | null) => {
    const id = drag;
    setDrag(null); setOver(null);
    if (!id || id === before) return;
    const p = list.find((x) => x.id === id);
    if (!p) return;
    const rest = list.filter((x) => x.id !== id);
    const moved = { ...p, group: g };
    let at = before ? rest.findIndex((x) => x.id === before) : -1;
    if (at < 0) { const last = rest.map((x, i) => (x.inspection === ins && x.group === g ? i : -1)).filter((i) => i >= 0).pop(); at = last != null ? last + 1 : rest.length; }
    rest.splice(at, 0, moved);
    void save(rest);
  };
  const newGroup = () => {
    const n = prompt("Numele grupului nou (ex. Dormitor 2, Fațadă, Defecte):")?.trim().slice(0, 60);
    if (n && !groups.includes(n)) setExtra((e) => [...e, n]);
    return n || null;
  };
  const rename = (g: string) => {
    const n = prompt("Numele grupului:", g)?.trim().slice(0, 60);
    if (!n || n === g) return;
    setExtra((e) => e.map((x) => (x === g ? n : x)));
    void save(list.map((p) => (p.inspection === ins && p.group === g ? { ...p, group: n } : p)));
  };
  const makeCover = async (p: Photo) => {
    const r = await fetch(`/api/crm/reports/${report}/photos`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ inspection: p.inspection, cover: p.id }) }).catch(() => null);
    if (!r?.ok) { setMsg({ ok: false, t: ((await r?.json().catch(() => ({}))) as { error?: string })?.error ?? "Nu am putut alege coperta." }); return; }
    setCover((c) => ({ ...c, [p.inspection]: p.id }));
    setMsg({ ok: true, t: "Coperta bunului a fost schimbată." });
    setSel(new Set());
    router.refresh();
  };
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const download = async (only: boolean) => {
    const pick = only ? flat.filter((p) => sel.has(p.id)) : flat;
    if (!pick.length) return;
    const entries: ZipEntry[] = [];
    const n: Record<string, number> = {};
    let failed = 0;
    for (let i = 0; i < pick.length; i++) {
      setZip(`Se pregătește arhiva… ${i + 1} / ${pick.length}`);
      const p = pick[i];
      const r = await fetch(p.src).catch(() => null);
      if (!r?.ok) { failed++; continue; }
      const type = (r.headers.get("content-type") ?? "image/jpeg").split(";")[0];
      const k = (n[p.group] = (n[p.group] ?? 0) + 1);
      const label = p.label && p.label !== p.group ? ` ${safe(p.label)}` : "";
      entries.push({ name: `${safe(p.group)}/${String(k).padStart(2, "0")}${label}.${EXT[type] ?? "jpg"}`, data: new Uint8Array(await r.arrayBuffer()), date: p.taken_at ? new Date(p.taken_at) : undefined });
    }
    setZip(null);
    if (!entries.length) { setMsg({ ok: false, t: "Nu am putut descărca fotografiile." }); return; }
    const url = URL.createObjectURL(makeZip(entries));
    const a = document.createElement("a");
    a.href = url; a.download = `${safe(name)}${only ? " - selectie" : ""}.zip`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    setMsg(failed ? { ok: false, t: `Arhiva are ${entries.length} fotografii; ${failed} nu s-au putut descărca.` } : null);
  };

  useEffect(() => {
    if (view == null) return;
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") setView(null);
      if (e.key === "ArrowRight") setView((v) => (v == null ? v : (v + 1) % flat.length));
      if (e.key === "ArrowLeft") setView((v) => (v == null ? v : (v - 1 + flat.length) % flat.length));
    };
    addEventListener("keydown", k);
    return () => removeEventListener("keydown", k);
  }, [view, flat.length]);

  if (!photos.length) return <section className="card"><h2>Fotografii</h2><p className="hint">Bunul nu are fotografii de la inspecție încă.</p></section>;
  const shown = view != null ? flat[view] : null;
  const one = sel.size === 1 ? flat.find((p) => sel.has(p.id)) : null;
  return (
    <section className="apCard">
      <div className="apBar">
        <h2>Fotografii</h2>
        {inspections.length > 1 ? (
          <select className="select selectSm" value={ins} onChange={(e) => { setIns(e.target.value); setSel(new Set()); setExtra([]); }} aria-label="Inspecția">
            {inspections.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
          </select>
        ) : <span className="muted">{inspections[0]?.label} · {mine.length} fotografii</span>}
        <span className="apGrow" />
        <button type="button" className="btn btnGhost btnSm" onClick={() => setSel(sel.size === flat.length ? new Set() : new Set(flat.map((p) => p.id)))}>{sel.size === flat.length ? "Deselectează tot" : "Selectează tot"}</button>
        <button type="button" className="btn btnNavy btnSm" disabled={!!zip} onClick={() => download(false)}>Descarcă tot (ZIP)</button>
      </div>
      {edit && <p className="hint apHint">Fiecare coloană e un grup. Trage fotografiile dintr-o coloană în alta sau în sus și în jos ca să le schimbi ordinea; ★ alege coperta.</p>}
      {zip && <p className="hint" role="status">{zip}</p>}
      {msg && <p className={msg.ok ? "okTxt" : "errTxt"} role="status">{msg.t}</p>}

      <div className="apLanes">
      {groups.map((g) => {
        const items = mine.filter((p) => p.group === g);
        return (
          <div key={g} className={`apLane${over === `g:${g}` ? " over" : ""}`}
            onDragOver={edit ? (e) => { e.preventDefault(); if (over !== `g:${g}` && !over?.startsWith("p:")) setOver(`g:${g}`); } : undefined}
            onDragLeave={edit ? (e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(null); } : undefined}
            onDrop={edit ? (e) => { e.preventDefault(); drop(g, null); } : undefined}>
            <div className="apLaneHead">
              <b title={g}>{g}</b><small>{items.length}</small>
              {items.length > 0 && <button type="button" className="apMini" title={items.every((p) => sel.has(p.id)) ? "Deselectează grupul" : "Selectează grupul"} aria-label="Selectează grupul"
                onClick={() => setSel((s) => { const n = new Set(s); const all = items.every((p) => n.has(p.id)); for (const p of items) if (all) n.delete(p.id); else n.add(p.id); return n; })}>✓</button>}
              {edit && <button type="button" className="apMini" title="Redenumește grupul" aria-label="Redenumește grupul" onClick={() => rename(g)}>✎</button>}
            </div>
            {items.map((p) => {
              const isCover = cover[p.inspection] === p.id;
              return (
                <figure key={p.id} className={`apTile${sel.has(p.id) ? " sel" : ""}${drag === p.id ? " drag" : ""}${over === `p:${p.id}` ? " before" : ""}`}
                  draggable={edit} onDragStart={(e) => { setDrag(p.id); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", p.id); }}
                  onDragEnd={() => { setDrag(null); setOver(null); }}
                  onDragOver={edit ? (e) => { e.preventDefault(); e.stopPropagation(); if (over !== `p:${p.id}`) setOver(`p:${p.id}`); } : undefined}
                  onDrop={edit ? (e) => { e.preventDefault(); e.stopPropagation(); drop(g, p.id); } : undefined}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.src} alt={p.label} loading="lazy" draggable={false} onClick={() => setView(flat.indexOf(p))} />
                  <label className="apCheck" title="Selectează"><input type="checkbox" checked={sel.has(p.id)} onChange={() => toggle(p.id)} /></label>
                  {isCover ? <span className="apCover on" title="Coperta bunului">★ Copertă</span>
                    : edit && <button type="button" className="apCover" title="Alege ca copertă" onClick={() => makeCover(p)}>★</button>}
                  <figcaption>{p.label !== g ? p.label : ""}{p.taken_at && <small>{when(p.taken_at)}</small>}</figcaption>
                </figure>
              );
            })}
            {over === `g:${g}` && <div className="apDrop">Lasă aici</div>}
            {items.length === 0 && over !== `g:${g}` && <p className="apEmpty">Trage fotografii aici</p>}
          </div>
        );
      })}
      {edit && (
        <div className={`apNew${over === "new" ? " over" : ""}`} onDragOver={(e) => { e.preventDefault(); setOver("new"); }} onDragLeave={() => setOver(null)}
          onDrop={(e) => {
            e.preventDefault();
            const id = drag, p = list.find((x) => x.id === id);
            setDrag(null); setOver(null);
            const n = newGroup();
            if (n && p) void save([...list.filter((x) => x.id !== p.id), { ...p, group: n }]);
          }}>
          <button type="button" className="linkBtn" onClick={newGroup}>+ Grup nou</button><small>sau trage o fotografie aici</small>
        </div>
      )}
      </div>

      {sel.size > 0 && (
        <div className="apSelBar" role="toolbar" aria-label="Fotografiile selectate">
          <b>{sel.size} {sel.size === 1 ? "selectată" : "selectate"}</b>
          <button type="button" className="btn btnGold btnSm" disabled={!!zip} onClick={() => download(true)}>Descarcă selecția (ZIP)</button>
          {edit && one && cover[one.inspection] !== one.id && <button type="button" className="btn btnSm apSelGhost" onClick={() => makeCover(one)}>Fă copertă</button>}
          <button type="button" className="apSelX" aria-label="Renunță la selecție" onClick={() => setSel(new Set())}>✕</button>
        </div>
      )}

      {shown && (
        <div className="apLight" role="dialog" aria-label="Fotografie" onClick={(e) => { if (e.target === e.currentTarget) setView(null); }}>
          <button type="button" className="apLx" aria-label="Închide" onClick={() => setView(null)}>×</button>
          <button type="button" className="apLnav prev" aria-label="Anterioara" onClick={() => setView((view! - 1 + flat.length) % flat.length)}>‹</button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={shown.src} alt={shown.label} />
          <button type="button" className="apLnav next" aria-label="Următoarea" onClick={() => setView((view! + 1) % flat.length)}>›</button>
          <p className="apLcap"><b>{shown.group}</b>{shown.label !== shown.group ? ` · ${shown.label}` : ""}<small>{view! + 1} / {flat.length}{shown.taken_at ? ` · ${when(shown.taken_at)}` : ""}</small></p>
        </div>
      )}
    </section>
  );
}
