// The export of an annex (browser only): PDF (pdf-lib — the pages of PDF documents go in as they are, vector, only
// placed, scaled and rotated; photos resized to the chosen quality) and Word (.docx: each page a borderless table with
// the pictures and their captions, as the UVALO add-in inserts them).
import type { Cell, Page, Settings, Text } from "./anexa-layout";
import { PT_CM, SHEETS } from "./anexa-layout";
import { makeZip } from "./zip";

/** Where an item's picture comes from: an image file, or a page of a PDF (0-based). */
export type Source = { kind: "img"; url: string } | { kind: "pdf"; url: string; page: number };

const cache = new Map<string, Promise<ArrayBuffer>>();
export const bytesOf = (url: string) => {
  if (!cache.has(url)) cache.set(url, fetch(url, { credentials: "same-origin" }).then((r) => { if (!r.ok) throw new Error(`Nu am putut descărca fișierul (${r.status}).`); return r.arrayBuffer(); }));
  return cache.get(url)!;
};
/** A file chosen from the computer: kept under an object URL, its bytes read from the File itself. */
export const remember = (url: string, file: File) => cache.set(url, file.arrayBuffer());

type PdfJs = typeof import("pdfjs-dist");
let pdfjsP: Promise<PdfJs> | null = null;
export const pdfjs = () => (pdfjsP ??= import("pdfjs-dist").then((m) => { m.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString(); return m; }));
const docs = new Map<string, Promise<import("pdfjs-dist").PDFDocumentProxy>>();
export const pdfDoc = (url: string) => {
  if (!docs.has(url)) docs.set(url, Promise.all([pdfjs(), bytesOf(url)]).then(([m, b]) => m.getDocument({ data: new Uint8Array(b.slice(0)), isEvalSupported: false }).promise));
  return docs.get(url)!;
};

/** A PDF page drawn on a canvas, `scale` × 72 dpi, on white. */
export async function renderPage(url: string, index: number, scale: number) {
  const d = await pdfDoc(url);
  const p = await d.getPage(index + 1);
  const vp = p.getViewport({ scale: Math.min(6, Math.max(0.05, scale)) });
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(vp.width)); c.height = Math.max(1, Math.round(vp.height));
  const g = c.getContext("2d")!;
  g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
  await p.render({ canvas: c, canvasContext: g, viewport: vp }).promise;
  return c;
}

async function bitmapOf(src: Source, needPx: number): Promise<CanvasImageSource & { width: number; height: number }> {
  if (src.kind === "pdf") {
    const d = await pdfDoc(src.url);
    const p = await d.getPage(src.page + 1);
    const vp = p.getViewport({ scale: 1 });
    return renderPage(src.url, src.page, (needPx / Math.max(vp.width, vp.height)) * 1.02);
  }
  const blob = new Blob([await bytesOf(src.url)]);
  return createImageBitmap(blob);
}

/** The picture as it goes into the annex: rotated, cropped, at most `dpi` for its size on paper, JPEG on white. */
export async function pictureOf(src: Source, cell: Pick<Cell, "w" | "h" | "crop"> & { item: { rot: number } }, dpi: number, q = 0.86) {
  const tW = Math.round((cell.w / 2.54) * dpi), tH = Math.round((cell.h / 2.54) * dpi);
  const img = await bitmapOf(src, Math.max(tW, tH) / Math.min(cell.crop.w, cell.crop.h));
  const rot = ((cell.item.rot % 360) + 360) % 360;
  // rotated whole image first
  const rw = rot % 180 ? img.height : img.width, rh = rot % 180 ? img.width : img.height;
  const cw = rw * cell.crop.w, ch = rh * cell.crop.h;
  const k = Math.min(1, tW / cw, tH / ch);
  const big = document.createElement("canvas");
  big.width = Math.max(1, Math.round(rw * k)); big.height = Math.max(1, Math.round(rh * k));
  const g = big.getContext("2d")!;
  g.fillStyle = "#fff"; g.fillRect(0, 0, big.width, big.height);
  g.imageSmoothingQuality = "high";
  g.translate(big.width / 2, big.height / 2); g.rotate((rot * Math.PI) / 180);
  const dw = (rot % 180 ? big.height : big.width), dh = (rot % 180 ? big.width : big.height);
  g.drawImage(img, -dw / 2, -dh / 2, dw, dh);
  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(cw * k)); out.height = Math.max(1, Math.round(ch * k));
  const o = out.getContext("2d")!;
  o.fillStyle = "#fff"; o.fillRect(0, 0, out.width, out.height);
  o.drawImage(big, big.width * cell.crop.x, big.height * cell.crop.y, out.width, out.height, 0, 0, out.width, out.height);
  if ("close" in img && typeof img.close === "function") img.close();
  const blob = await new Promise<Blob>((res, rej) => out.toBlob((b) => (b ? res(b) : rej(new Error("Imaginea nu s-a putut pregăti."))), "image/jpeg", q));
  return { bytes: new Uint8Array(await blob.arrayBuffer()), px: [out.width, out.height] as [number, number] };
}

type Progress = (done: number, total: number, what: string) => void;
const pt = (cm: number) => (cm / 2.54) * 72;

/** The annex as a PDF. */
export async function exportPdf(s: Settings, pages: Page[], sourceOf: (id: string) => Source | null, progress: Progress) {
  const [{ PDFDocument, degrees, rgb }, fontkit] = await Promise.all([import("pdf-lib"), import("@pdf-lib/fontkit").then((m) => m.default)]);
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const [reg, bold] = await Promise.all(["/fonts/anexa/LiberationSans-Regular.ttf", "/fonts/anexa/LiberationSans-Bold.ttf"].map((u) => fetch(u).then((r) => r.arrayBuffer())));
  const fReg = await pdf.embedFont(reg, { subset: true }), fBold = await pdf.embedFont(bold, { subset: true });
  const [sw, sh] = SHEETS[s.page.format];
  const srcPdfs = new Map<string, Promise<import("pdf-lib").PDFDocument>>();
  const total = pages.reduce((n, p) => n + p.cells.length, 0);
  let done = 0;
  const border = s.border === "thin" ? 0.5 : s.border === "medium" ? 1 : 0;

  const drawText = (page: import("pdf-lib").PDFPage, t: { runs: { text: string; bold?: boolean }[]; x: number; y: number; w: number; size: number; align: "center" | "left"; lines: number }) => {
    // words with their font, broken into lines that fit
    const words: { w: string; b: boolean }[] = [];
    for (const r of t.runs) for (const [i, w] of r.text.split(/(\s+)/).entries()) if (w && !(i % 2)) words.push({ w, b: !!r.bold });
    const lines: { w: string; b: boolean }[][] = [[]];
    const width = (ws: { w: string; b: boolean }[]) => ws.reduce((a, x, i) => a + (x.b ? fBold : fReg).widthOfTextAtSize((i ? " " : "") + x.w, t.size), 0);
    for (const w of words) {
      const cur = lines[lines.length - 1];
      if (cur.length && width([...cur, w]) > pt(t.w)) lines.push([w]); else cur.push(w);
    }
    lines.forEach((ln, li) => {
      let x = pt(t.x) + (t.align === "center" ? (pt(t.w) - width(ln)) / 2 : 0);
      const y = pt(sh) - pt(t.y) - t.size * (0.9 + li * 1.2);
      ln.forEach((w, i) => {
        const txt = (i ? " " : "") + w.w, f = w.b ? fBold : fReg;
        page.drawText(txt, { x, y, size: t.size, font: f, color: rgb(0.08, 0.08, 0.08) });
        x += f.widthOfTextAtSize(txt, t.size);
      });
    });
  };
  const textOf = (t: Text) => ({ runs: [{ text: t.text, bold: t.bold }], x: t.x, y: t.y, w: t.w, size: t.size, align: t.align, lines: 3 });

  for (const p of pages) {
    const page = pdf.addPage([pt(sw), pt(sh)]);
    if (p.title) drawText(page, textOf(p.title));
    if (p.docTitle) drawText(page, textOf(p.docTitle));
    for (const c of p.cells) {
      progress(done, total, c.item.name);
      const src = sourceOf(c.item.id);
      const x = pt(c.x), y = pt(sh) - pt(c.y + c.h), w = pt(c.w), h = pt(c.h);
      if (src?.kind === "pdf" && c.crop.w === 1 && c.crop.h === 1) {
        // a page of a PDF: placed as it is (vector), turned by its own rotation and the one chosen
        if (!srcPdfs.has(src.url)) srcPdfs.set(src.url, bytesOf(src.url).then((b) => PDFDocument.load(b, { ignoreEncryption: true })));
        const sp = (await srcPdfs.get(src.url)!).getPage(src.page);
        const [emb] = await pdf.embedPages([sp]);
        const rot = (((sp.getRotation().angle + c.item.rot) % 360) + 360) % 360;
        const ox = rot === 180 || rot === 270 ? x + w : x, oy = rot === 90 || rot === 180 ? y + h : y;
        page.drawPage(emb, { x: ox, y: oy, width: rot % 180 ? h : w, height: rot % 180 ? w : h, rotate: degrees(-rot) });
      } else if (src) {
        const pic = await pictureOf(src, c, s.dpi).catch(() => null);
        if (pic) page.drawImage(await pdf.embedJpg(pic.bytes), { x, y, width: w, height: h });
      }
      if (border) page.drawRectangle({ x, y, width: w, height: h, borderColor: rgb(0.5, 0.5, 0.5), borderWidth: border });
      if (c.caption && (c.caption.head || c.caption.rest))
        drawText(page, { runs: [{ text: c.caption.head, bold: s.caption.bold }, { text: c.caption.rest }], x: c.caption.x, y: c.caption.y, w: c.caption.w, size: s.caption.size, align: "center", lines: s.caption.lines });
      done++;
    }
  }
  progress(total, total, "");
  return new Blob([new Uint8Array(await pdf.save())], { type: "application/pdf" });
}

// ---- Word (.docx) ----
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const TW = 566.929, EMU = 360000;
const run = (text: string, size: number, b?: boolean) => text ? `<w:r><w:rPr>${b ? "<w:b/>" : ""}<w:sz w:val="${Math.round(size * 2)}"/></w:rPr><w:t xml:space="preserve">${esc(text)}</w:t></w:r>` : "";
const para = (t: Text, after: number) =>
  `<w:p><w:pPr><w:keepNext/><w:spacing w:before="0" w:after="${after * 20}"/><w:jc w:val="${t.align === "center" ? "center" : "left"}"/></w:pPr>${run(t.text, t.size, t.bold)}</w:p>`;
const pic = (rid: string, n: number, w: number, h: number, border: number) => `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${Math.round(w * EMU)}" cy="${Math.round(h * EMU)}"/><wp:docPr id="${n}" name="Foto ${n}"/>
<wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>
<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
<pic:nvPicPr><pic:cNvPr id="${n}" name="foto${n}.jpg"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>
<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${Math.round(w * EMU)}" cy="${Math.round(h * EMU)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom>${border ? `<a:ln w="${border * 12700}"><a:solidFill><a:srgbClr val="7F7F7F"/></a:solidFill></a:ln>` : ""}</pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;

/** The annex as a Word document (.docx): the same pages, each a borderless table. */
export async function exportDocx(s: Settings, pages: Page[], sourceOf: (id: string) => Source | null, progress: Progress) {
  const media: { name: string; data: Uint8Array }[] = [];
  const rels: string[] = [];
  const total = pages.reduce((n, p) => n + p.cells.length, 0);
  let done = 0, nPic = 0;
  const border = s.border === "thin" ? 0.5 : s.border === "medium" ? 1 : 0;
  const body: string[] = [];
  for (const [pi, p] of pages.entries()) {
    if (pi > 0) body.push(`<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/></w:pPr><w:r><w:br w:type="page"/></w:r></w:p>`);
    if (p.title) body.push(para(p.title, 8));
    if (p.docTitle) body.push(para(p.docTitle, 6));
    const colsW = Array.from({ length: p.cols }, (_, i) => p.colW + (i > 0 ? p.gap / 2 : 0) + (i < p.cols - 1 ? p.gap / 2 : 0));
    const rows: string[] = [];
    for (let r = 0; r * p.cols < p.cells.length; r++) {
      const cells = p.cells.slice(r * p.cols, r * p.cols + p.cols);
      const tcs = colsW.map((cw, ci) => {
        const c = cells[ci];
        const mar = `<w:tcMar><w:left w:w="${ci > 0 ? Math.round((p.gap / 2) * TW) : 0}" w:type="dxa"/><w:right w:w="${ci < p.cols - 1 ? Math.round((p.gap / 2) * TW) : 0}" w:type="dxa"/><w:bottom w:w="${(r + 1) * p.cols < p.cells.length ? Math.round(p.gap * TW) : 0}" w:type="dxa"/></w:tcMar>`;
        const head = `<w:tcPr><w:tcW w:w="${Math.round(cw * TW)}" w:type="dxa"/>${mar}<w:vAlign w:val="${s.fit === "crop" ? "top" : "center"}"/></w:tcPr>`;
        if (!c) return `<w:tc>${head}<w:p/></w:tc>`;
        return `<w:tc>${head}${(() => "")()}<w:p><w:pPr><w:spacing w:before="0" w:after="0"/><w:jc w:val="center"/></w:pPr>__PIC${c.item.id}_${c.n}__</w:p>${c.caption && (c.caption.head || c.caption.rest)
          ? `<w:p><w:pPr><w:spacing w:before="${2 * 20}" w:after="0"/><w:jc w:val="center"/></w:pPr>${run(c.caption.head, s.caption.size, s.caption.bold)}${run(c.caption.rest, s.caption.size)}</w:p>` : ""}</w:tc>`;
      });
      rows.push(`<w:tr><w:trPr><w:cantSplit/></w:trPr>${tcs.join("")}</w:tr>`);
    }
    let table = `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:jc w:val="center"/><w:tblLayout w:type="fixed"/><w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders><w:tblCellMar><w:left w:w="0" w:type="dxa"/><w:right w:w="0" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${colsW.map((w) => `<w:gridCol w:w="${Math.round(w * TW)}"/>`).join("")}</w:tblGrid>${rows.join("")}</w:tbl>`;
    for (const c of p.cells) {
      progress(done, total, c.item.name);
      const src = sourceOf(c.item.id);
      const got = src ? await pictureOf(src, c, s.dpi, 0.88).catch(() => null) : null;
      let xml = "";
      if (got) {
        nPic++;
        const name = `image${nPic}.jpg`, rid = `rIdImg${nPic}`;
        media.push({ name: `word/media/${name}`, data: got.bytes });
        rels.push(`<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${name}"/>`);
        xml = pic(rid, nPic, c.w, c.h, border);
      }
      table = table.replace(`__PIC${c.item.id}_${c.n}__`, xml);
      done++;
    }
    body.push(table);
  }
  const [sw, sh] = SHEETS[s.page.format];
  const sect = `<w:sectPr><w:pgSz w:w="${Math.round(sw * TW)}" w:h="${Math.round(sh * TW)}"${sw > sh ? ' w:orient="landscape"' : ""}/><w:pgMar w:top="${Math.round(s.page.top * TW)}" w:right="${Math.round(s.page.right * TW)}" w:bottom="${Math.round(s.page.bottom * TW)}" w:left="${Math.round(s.page.left * TW)}" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>`;
  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><w:body>${body.join("")}${sect}</w:body></w:document>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial" w:eastAsia="Arial"/><w:sz w:val="20"/><w:lang w:val="ro-RO"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>`;
  const enc = (x: string) => new TextEncoder().encode(x);
  const zip = makeZip([
    { name: "[Content_Types].xml", data: enc(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="jpg" ContentType="image/jpeg"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`) },
    { name: "_rels/.rels", data: enc(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`) },
    { name: "word/_rels/document.xml.rels", data: enc(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>${rels.join("")}</Relationships>`) },
    { name: "word/document.xml", data: enc(doc) },
    { name: "word/styles.xml", data: enc(styles) },
    ...media,
  ]);
  progress(total, total, "");
  return new Blob([zip], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
}

/** The size of a text line in cm, for the preview (approximate). */
export const lineCm = (size: number) => size * PT_CM * 1.2;
