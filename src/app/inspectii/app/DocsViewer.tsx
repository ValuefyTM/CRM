"use client";
// CF extract and floor survey of an inspection: listed on the inspection page, and one tap away while filling in the
// sheet (floating button → viewer with a CF / RLV switch). Each document opened once with signal stays on the phone.
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { PdfPages } from "./PdfPages";
import type { InspDoc } from "./sync";

const LABEL = { cf: "Extras CF", rlv: "Releveu" } as const;
const P = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
const DocIcon = () => <svg {...P}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></svg>;
const Close = () => <svg {...P}><path d="M18 6L6 18M6 6l12 12" /></svg>;

const isImage = (d: InspDoc) => (d.content_type ?? "").startsWith("image/") || /\.(jpe?g|png|webp|gif)$/i.test(d.name);
const isPdf = (d: InspDoc) => d.content_type === "application/pdf" || /\.pdf$/i.test(d.name);

/** Saves the documents on the phone (through the service worker) while there is signal, once per session. */
const fetched = new Set<string>();
export function usePrefetchDocs(docs: InspDoc[] | undefined) {
  useEffect(() => {
    if (!docs?.length || !navigator.onLine) return;
    for (const d of docs) {
      if (fetched.has(d.url)) continue;
      fetched.add(d.url);
      fetch(d.url, { credentials: "include" }).then((r) => r.body?.cancel?.()).catch(() => fetched.delete(d.url));
    }
  }, [docs]);
}

/** The viewer: CF / RLV switch, a document per tab (several documents of one kind: chips to pick). */
export function DocsModal({ docs, start, onClose }: { docs: InspDoc[]; start?: InspDoc | null; onClose: () => void }) {
  const first = start ?? docs.find((d) => d.type === "cf") ?? docs[0] ?? null;
  const [type, setType] = useState<"cf" | "rlv">(first?.type ?? "cf");
  const [ref, setRef] = useState<string | null>(first?.ref ?? null);
  const [zoom, setZoom] = useState(1);
  const list = docs.filter((d) => d.type === type);
  const cur = list.find((d) => d.ref === ref) ?? list[0] ?? null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  const pick = (t: "cf" | "rlv") => { setType(t); setRef(docs.find((d) => d.type === t)?.ref ?? null); setZoom(1); };
  const zoomBtns = (
    <span className="iDocZoom">
      <button type="button" aria-label="Micșorează" disabled={zoom <= 1} onClick={() => setZoom(Math.max(1, zoom - 0.5))}>−</button>
      <button type="button" aria-label="Mărește" disabled={zoom >= 3} onClick={() => setZoom(Math.min(3, zoom + 0.5))}>+</button>
    </span>
  );

  return createPortal(
    <div className="iDocModal" role="dialog" aria-modal="true" aria-label="Documente">
      <div className="iDocHead">
        <div className="iDocSwitch" role="tablist" aria-label="Document">
          {(["cf", "rlv"] as const).map((t) => {
            const n = docs.filter((d) => d.type === t).length;
            return (
              <button key={t} type="button" role="tab" aria-selected={type === t} className={type === t ? "on" : ""} onClick={() => pick(t)}>
                {LABEL[t]}{n === 0 ? <small>lipsă</small> : n > 1 ? <small>{n}</small> : null}
              </button>
            );
          })}
        </div>
        <button type="button" className="iDocClose" aria-label="Închide" onClick={onClose}><Close /></button>
      </div>
      {list.length > 1 && (
        <div className="iDocChips">
          {list.map((d) => <button key={d.ref} type="button" className={`iChip${d.ref === cur?.ref ? " on" : ""}`} aria-pressed={d.ref === cur?.ref} onClick={() => { setRef(d.ref); setZoom(1); }}>{d.for ? `${d.for}: ` : ""}{d.name}</button>)}
        </div>
      )}
      <div className="iDocBody">
        {!cur ? (
          <p className="iDocEmpty">{LABEL[type]} nu este încărcat la această inspecție. Cere-l evaluatorului; apare aici când e încărcat în CRM.</p>
        ) : isImage(cur) ? (
          <div className="iDocImg"><img src={cur.url} alt={cur.name} style={{ width: `${zoom * 100}%` }} /></div>
        ) : isPdf(cur) ? (
          <PdfPages key={cur.ref} url={cur.url} zoom={zoom} />
        ) : (
          <p className="iDocEmpty">Documentul nu se poate afișa aici.</p>
        )}
      </div>
      {cur && (
        <div className="iDocFoot">
          {(isImage(cur) || isPdf(cur)) && zoomBtns}
          <span>{cur.for ? `${cur.for} · ` : ""}{cur.name}</span>
          <a href={cur.url} target="_blank" rel="noreferrer">Deschide pe tot ecranul</a>
        </div>
      )}
    </div>,
    document.body,
  );
}

/** Inspection page: the documents the evaluator gave for the visit. */
export function DocsSection({ docs }: { docs: InspDoc[] | undefined }) {
  const [open, setOpen] = useState<InspDoc | null | false>(false);
  usePrefetchDocs(docs);
  if (!docs) return null;
  const missing = (["cf", "rlv"] as const).filter((t) => !docs.some((d) => d.type === t));
  return (
    <section className="iBox">
      <h3>Documente pentru inspecție</h3>
      {docs.map((d) => (
        <button key={d.ref} type="button" className="iDocRow" onClick={() => setOpen(d)}>
          <span className={`iDocTag ${d.type}`}>{d.type === "cf" ? "CF" : "RLV"}</span>
          <b>{d.for ? `${d.for}: ` : ""}{d.name}</b>
          <DocIcon />
        </button>
      ))}
      {missing.length > 0 && <span className="iNote warn">Lipsește {missing.map((t) => LABEL[t].toLowerCase()).join(" și ")}. Cere-l evaluatorului; apare aici când e încărcat.</span>}
      {docs.length > 0 && <span className="muted">Se păstrează pe telefon pentru folosire fără semnal.</span>}
      {open !== false && <DocsModal docs={docs} start={open} onClose={() => setOpen(false)} />}
    </section>
  );
}

/** Sheet: floating button that opens the viewer, to check the CF / floor survey while filling in. */
export function DocsFab({ docs }: { docs: InspDoc[] | undefined }) {
  const [open, setOpen] = useState(false);
  usePrefetchDocs(docs);
  if (!docs) return null;
  return (
    <>
      <button type="button" className={`iDocFab${docs.length ? "" : " empty"}`} onClick={() => setOpen(true)} aria-label="Extras CF și releveu">
        <DocIcon /><span>CF · RLV</span>
      </button>
      {open && <DocsModal docs={docs} onClose={() => setOpen(false)} />}
    </>
  );
}
