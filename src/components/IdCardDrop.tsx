"use client";
// A thin bar on top of the client's data: drop (or photograph) the identity card, it is read in the browser (OCR,
// no AI, the photo does not leave the computer until saved), the fields come out editable and the CRM is searched for
// the same CNP. The photos go to the client when the form is saved (uploadIdCard).
import { useEffect, useRef, useState } from "react";
import { cardFound, EMPTY_CARD, readIdCard, validCnp, type IdCard } from "@/lib/id-card";

export type IdMatch = { id: string; kind: string; name: string; cui: string | null; phone: string | null; email: string | null; city: string | null; reports: number; cnp?: string | null; by: "cnp" | "name" | "similar" };
export type IdScan = { card: IdCard; photos: Blob[] };

const MAX_SIDE = 2400;
const isPdf = (f: File) => f.type === "application/pdf" || /\.pdf$/i.test(f.name);
const isImg = (f: File) => /^image\/(jpeg|png|webp)$/.test(f.type);

/** A PDF (a scan or a digital one): its first pages as images (for OCR) and the text it already has. */
async function pdfPages(file: File) {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }).promise;
  const pages: Blob[] = [];
  let text = "";
  try {
    for (let i = 1; i <= Math.min(2, doc.numPages); i++) {
      const page = await doc.getPage(i);
      const one = page.getViewport({ scale: 1 });
      const vp = page.getViewport({ scale: Math.min(4, 2800 / Math.max(one.width, one.height)) });
      const c = document.createElement("canvas");
      c.width = Math.round(vp.width); c.height = Math.round(vp.height);
      const g = c.getContext("2d")!;
      g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
      await page.render({ canvas: c, canvasContext: g, viewport: vp }).promise;
      pages.push(await new Promise<Blob>((ok) => c.toBlob((b) => ok(b!), "image/jpeg", 0.92)));
      text += (await page.getTextContent()).items.map((it) => ("str" in it ? it.str + (it.hasEOL ? "\n" : " ") : "")).join("") + "\n";
    }
  } finally {
    await doc.destroy();
  }
  return { pages, text };
}

/** The photo as a canvas: turned upright, at most 2000 px, for OCR (grayscale, contrast) or to keep (JPEG). */
async function canvasOf(file: Blob, rotate = 0, gray = true) {
  const img = await createImageBitmap(file);
  const k = Math.min(1, MAX_SIDE / Math.max(img.width, img.height)) * (Math.max(img.width, img.height) < 1200 ? 1.6 : 1);
  const w = Math.round(img.width * k), h = Math.round(img.height * k);
  const c = document.createElement("canvas");
  const side = rotate % 180 !== 0;
  c.width = side ? h : w; c.height = side ? w : h;
  const g = c.getContext("2d")!;
  g.translate(c.width / 2, c.height / 2); g.rotate((rotate * Math.PI) / 180);
  if (gray) g.filter = "grayscale(1) contrast(1.35)";
  g.drawImage(img, -w / 2, -h / 2, w, h);
  img.close();
  return c;
}
const jpeg = (c: HTMLCanvasElement) => new Promise<Blob>((ok) => c.toBlob((b) => ok(b!), "image/jpeg", 0.85));

/** Reads the card from its photos: all the text (Romanian), then the MRZ at the bottom (A–Z, 0–9, "<"). */
async function ocr(files: Blob[], progress: (p: number, label: string) => void) {
  const { createWorker, PSM } = await import("tesseract.js");
  let share = 0;
  const steps = files.length * 2;
  // served by the CRM itself (scripts/ocr-assets.mjs): the photo and the engine never touch a third party
  const worker = await createWorker("ron+eng", 1, {
    workerPath: "/ocr/worker.min.js", corePath: "/ocr", langPath: "/ocr", workerBlobURL: false,
    logger: (m) => { if (m.status === "recognizing text") progress(Math.round(((share + m.progress) / steps) * 100), "Se citește CI-ul…"); else if (share === 0) progress(0, "Se pregătește cititorul (prima dată durează puțin)…"); },
  });
  try {
    const texts: string[] = [];
    const canvases: HTMLCanvasElement[] = [];
    for (const f of files) {
      let c = await canvasOf(f);
      let t = (await worker.recognize(c)).data.text;
      // a card photographed upright (portrait): turned both ways, the reading with an MRZ / more text wins
      if (c.height > c.width * 1.15 && !t.includes("<<")) {
        for (const r of [90, 270]) {
          const c2 = await canvasOf(f, r);
          const t2 = (await worker.recognize(c2)).data.text;
          if (t2.includes("<<") || t2.replace(/\W/g, "").length > t.replace(/\W/g, "").length * 1.4) { c = c2; t = t2; break; }
        }
      }
      texts.push(t); canvases.push(c); share++;
    }
    await worker.setParameters({ tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<", tessedit_pageseg_mode: PSM.SINGLE_BLOCK });
    for (const c of canvases) {
      const top = Math.round(c.height * 0.6);
      texts.push((await worker.recognize(c, { rectangle: { left: 0, top, width: c.width, height: c.height - top } })).data.text);
      share++;
    }
    return texts.join("\n");
  } finally {
    await worker.terminate();
  }
}

// the home address is one field ("Domiciliu"): county, city, street and number together
const F: [keyof IdCard, string, number][] = [
  ["cnp", "CNP", 2], ["series", "Serie", 1], ["number", "Număr", 1], ["expires", "Valabil până la", 2], ["address", "Domiciliu", 6],
];

export function IdCardDrop({ base, onRead, onMatch, onChange, matched, hint }: {
  base: string;
  /** under the fields, in place of "saved with the form" */
  hint?: string;
  /** what was read: the form fills its name (and address) */
  onRead: (card: IdCard) => void;
  /** "Folosește clientul" on a CRM client with the same CNP / name */
  onMatch?: (m: IdMatch) => void;
  /** the scan kept for saving (null when removed) */
  onChange: (s: IdScan | null) => void;
  /** the client the form already uses (no "found" banner for it) */
  matched?: string;
}) {
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState<{ p: number; label: string } | null>(null);
  const [scan, setScan] = useState<IdScan | null>(null);
  const [thumbs, setThumbs] = useState<string[]>([]);
  const [msg, setMsg] = useState("");
  const [hits, setHits] = useState<IdMatch[]>([]);
  const [open, setOpen] = useState(true);
  const pick = useRef<HTMLInputElement>(null);
  const cam = useRef<HTMLInputElement>(null);
  useEffect(() => () => thumbs.forEach((u) => URL.revokeObjectURL(u)), [thumbs]);

  const update = (s: IdScan | null) => { setScan(s); onChange(s); };

  const read = async (list: FileList | File[] | null) => {
    const files = [...(list ?? [])].filter((f) => isImg(f) || isPdf(f)).slice(0, 2);
    if (!files.length) return setMsg("Încarcă o poză (JPG, PNG) sau un PDF scanat cu CI-ul (fața; la cartea electronică și versoul). HEIC: fă o captură sau exportă JPG.");
    setMsg(""); setHits([]); setBusy({ p: 0, label: "Se pregătește cititorul…" });
    try {
      // a PDF: its pages are read as images (plus the text a digital PDF has) and the PDF itself is kept
      const images: Blob[] = [], photos: Blob[] = [];
      let pdfText = "";
      for (const f of files) {
        if (isPdf(f)) {
          setBusy({ p: 0, label: "Se deschide PDF-ul…" });
          const r = await pdfPages(f);
          images.push(...r.pages); pdfText += r.text; photos.push(f);
        } else { images.push(f); photos.push(await jpeg(await canvasOf(f, 0, false))); }
      }
      const text = `${pdfText}\n${await ocr(images.slice(0, 3), (p, label) => setBusy({ p, label }))}`;
      const card = readIdCard(text);
      setThumbs(images.slice(0, 3).map((b) => URL.createObjectURL(b)));
      update({ card, photos });
      setOpen(true);
      const found = cardFound(card);
      setMsg(found.length ? "" : "Nu am putut citi datele din poză. Fă o poză mai clară (lumină bună, fără reflexii, CI-ul pe toată poza) sau completează manual mai jos.");
      if (found.length) onRead(card);
      // the same person in the CRM?
      if (validCnp(card.cnp) || card.name) {
        const r = await fetch(`/api/crm/clients/match?cnp=${card.cnp}&name=${encodeURIComponent(card.name)}&surname=${encodeURIComponent(card.surname)}`).catch(() => null);
        const d = (await r?.json().catch(() => null)) as { matches?: IdMatch[] } | null;
        setHits(d?.matches ?? []);
      }
    } catch {
      setMsg("Cititorul de CI nu a pornit (verifică conexiunea la internet). Completează datele manual.");
    } finally {
      setBusy(null);
    }
  };

  const set = (k: keyof IdCard) => (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!scan) return;
    const card = { ...scan.card, [k]: e.target.value };
    update({ ...scan, card });
  };
  const clear = () => { update(null); setThumbs([]); setHits([]); setMsg(""); };
  const shown = hits.filter((h) => h.id !== matched);
  const use = (h: IdMatch) => { onMatch?.(h); setHits([]); };
  const c = scan?.card ?? EMPTY_CARD;
  const expired = c.expires && c.expires < new Date().toISOString().slice(0, 10);

  return (
    <div className="idScan">
      <div
        className={`idDrop${drag ? " drag" : ""}${busy ? " busy" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); if (!busy) read(e.dataTransfer.files); }}
      >
        <span className="idIco" aria-hidden>🪪</span>
        {busy ? (
          <span className="idTxt"><b>{busy.label}</b><span className="idBar"><i style={{ width: `${busy.p}%` }} /></span></span>
        ) : (
          <span className="idTxt"><b>{scan ? "CI încărcat" : "Încarcă CI client"}</b><small>{scan ? `${cardFound(c).length ? `am citit: ${cardFound(c).join(", ")}` : "nimic citit"} · verifică datele` : "trage poza sau PDF-ul aici (fața; la CEI și versoul) — se citește în browser"}</small></span>
        )}
        {!busy && (
          <span className="idBtns">
            <button type="button" className="btn btnGhost btnSm" onClick={() => pick.current?.click()}>{scan ? "Altă poză" : "Alege poza"}</button>
            <button type="button" className="btn btnGhost btnSm idCam" onClick={() => cam.current?.click()} aria-label="Fotografiază CI-ul">📷</button>
            {scan && <button type="button" className="linkBtn" onClick={clear}>Elimină</button>}
          </span>
        )}
        <input ref={pick} type="file" accept="image/jpeg,image/png,image/webp,application/pdf,.pdf" multiple hidden onChange={(e) => { read(e.target.files); e.target.value = ""; }} />
        <input ref={cam} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { read(e.target.files); e.target.value = ""; }} />
      </div>
      {msg && <div className="note">{msg}</div>}
      {shown.length === 1 && (() => { const hit = shown[0]; return (
        <div className="nwClient ok">
          <span className="nwKind person">PF</span>
          <span><b>{hit.by === "cnp" ? "Clientul există în CRM (același CNP)" : hit.by === "name" ? "Există un client cu același nume" : "Posibil același client (nume asemănător) — verifică"}</b><small>{hit.name}{hit.phone ? ` · ${hit.phone}` : ""}{hit.reports ? ` · ${hit.reports} ${hit.reports === 1 ? "raport" : "rapoarte"}` : ""}</small></span>
          {onMatch ? <button type="button" className="btn btnGhost btnSm" onClick={() => use(hit)}>Folosește clientul</button>
            : <a className="btn btnGhost btnSm" href={`${base}/clienti/${hit.id}`} target="_blank" rel="noreferrer">Deschide</a>}
        </div>
      ); })()}
      {shown.length > 1 && (
        <div className="idMatches">
          <div className="idMatchHead"><b>{shown.length} clienți cu nume asemănător în CRM</b><small>alege-l pe cel corect{onMatch ? "" : " (se deschide fișa)"} sau continuă cu client nou</small>
            <button type="button" className="linkBtn" onClick={() => setHits([])}>Niciunul</button></div>
          {shown.map((h) => (
            <div key={h.id} className="idMatch">
              <span><b>{h.name}</b><small>{[h.by === "name" ? "același nume" : "nume asemănător", h.cnp ? `CNP ${h.cnp}` : "fără CNP", h.phone, h.email, h.city, h.reports ? `${h.reports} ${h.reports === 1 ? "raport" : "rapoarte"}` : ""].filter(Boolean).join(" · ")}</small></span>
              {onMatch ? <button type="button" className="btn btnGhost btnSm" onClick={() => use(h)}>Folosește</button>
                : <a className="btn btnGhost btnSm" href={`${base}/clienti/${h.id}`} target="_blank" rel="noreferrer">Deschide</a>}
            </div>
          ))}
        </div>
      )}
      {scan && (
        <div className="idRead">
          <button type="button" className="idHead" onClick={() => setOpen(!open)} aria-expanded={open}>
            <span className="idThumbs">{thumbs.map((u, i) => <img key={i} src={u} alt={`CI ${i + 1}`} />)}</span>
            <span><b>{c.name || "Date din CI"}</b><small>{[c.cnp && `CNP ${c.cnp}`, c.series && `${c.series} ${c.number}`, c.card === "cei" && "carte electronică (fără adresă tipărită)"].filter(Boolean).join(" · ") || "completează datele"}</small></span>
            <span className="muted">{open ? "▴" : "▾"}</span>
          </button>
          {open && (
            <div className="idFields">
              {F.map(([k, l, span]) => (
                <label key={k} className="field" style={{ gridColumn: `span ${span}` }}>
                  <span>{l}{k === "cnp" && c.cnp && !validCnp(c.cnp) && <small className="errTxt"> · CNP invalid</small>}{k === "expires" && expired && <small className="errTxt"> · expirat</small>}</span>
                  <input className={`input${k === "cnp" ? " mono" : ""}`} value={String(c[k] ?? "")} onChange={set(k)} inputMode={k === "cnp" ? "numeric" : undefined} placeholder={k === "expires" ? "AAAA-LL-ZZ" : k === "address" ? (c.card === "cei" ? "cartea electronică nu are domiciliul tipărit" : "jud., localitate, strada, nr.") : undefined} />
                </label>
              ))}
              <p className="hint" style={{ gridColumn: "1 / -1" }}>{hint ?? "Poza și datele se salvează la client când salvezi formularul."}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Saves the scan at the client: the fields read (CNP, series, address) and the photos. */
export async function uploadIdCard(clientId: string, scan: IdScan | null) {
  if (!scan || !clientId) return true;
  const body = new FormData();
  body.set("card", JSON.stringify(scan.card));
  scan.photos.forEach((p, i) => body.append("photo", p.type === "application/pdf" ? new File([p], `ci-${i + 1}.pdf`, { type: "application/pdf" }) : new File([p], `ci-${i + 1}.jpg`, { type: "image/jpeg" })));
  const r = await fetch(`/api/crm/clients/${clientId}/id-card`, { method: "POST", body }).catch(() => null);
  return !!r?.ok;
}
