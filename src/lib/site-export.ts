// The site analysis as a file (browser only): PDF (pdf-lib) or Word (.docx), from simple blocks: titles, paragraphs
// (with **bold**), the two maps and small tables.
import { makeZip } from "./zip";

export type Run = { text: string; bold?: boolean };
export type Block =
  | { title: string }
  | { p: Run[] }
  | { img: Uint8Array; w: number; h: number; caption: string }
  | { table: string[][]; head: string[]; right?: number[] };

/** "**Localizare.** Proprietatea…" → runs. */
export const runsOf = (text: string): Run[] => text.split(/(\*\*[^*]+\*\*)/).filter(Boolean).map((t) => (t.startsWith("**") ? { text: t.slice(2, -2), bold: true } : { text: t }));

const A4: [number, number] = [595.28, 841.89];
const MARGIN = 56;

export async function sitePdf(title: string, sub: string, blocks: Block[]) {
  const [{ PDFDocument, rgb }, fontkit] = await Promise.all([import("pdf-lib"), import("@pdf-lib/fontkit").then((m) => m.default)]);
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const [reg, bold] = await Promise.all(["/fonts/anexa/LiberationSans-Regular.ttf", "/fonts/anexa/LiberationSans-Bold.ttf"].map((u) => fetch(u).then((r) => r.arrayBuffer())));
  const fR = await pdf.embedFont(reg, { subset: true }), fB = await pdf.embedFont(bold, { subset: true });
  const ink = rgb(0.08, 0.08, 0.08), muted = rgb(0.35, 0.35, 0.35), line = rgb(0.85, 0.82, 0.76);
  const W = A4[0] - 2 * MARGIN;
  let page = pdf.addPage(A4), y = A4[1] - MARGIN;
  const need = (h: number) => { if (y - h < MARGIN) { page = pdf.addPage(A4); y = A4[1] - MARGIN; } };
  const write = (runs: Run[], size: number, opts: { color?: ReturnType<typeof rgb>; x?: number; w?: number; lead?: number } = {}) => {
    const x0 = opts.x ?? MARGIN, w = opts.w ?? W, lead = opts.lead ?? size * 1.42;
    const words: { t: string; b: boolean }[] = [];
    for (const r of runs) for (const [i, t] of r.text.split(/(\s+)/).entries()) if (t && !(i % 2)) words.push({ t, b: !!r.bold });
    const lines: { t: string; b: boolean }[][] = [[]];
    const width = (ws: { t: string; b: boolean }[]) => ws.reduce((s, q, i) => s + (q.b ? fB : fR).widthOfTextAtSize((i ? " " : "") + q.t, size), 0);
    for (const q of words) { const cur = lines[lines.length - 1]; if (cur.length && width([...cur, q]) > w) lines.push([q]); else cur.push(q); }
    for (const ln of lines) {
      need(lead);
      let x = x0;
      ln.forEach((q, i) => { const t = (i ? " " : "") + q.t, f = q.b ? fB : fR; page.drawText(t, { x, y: y - size, size, font: f, color: opts.color ?? ink }); x += f.widthOfTextAtSize(t, size); });
      y -= lead;
    }
  };
  write([{ text: title, bold: true }], 16, { lead: 22 });
  write([{ text: sub }], 9.5, { color: muted });
  y -= 10;
  for (const b of blocks) {
    if ("title" in b) { y -= 8; need(40); write([{ text: b.title, bold: true }], 12, { lead: 18 }); y -= 2; }
    else if ("p" in b) { write(b.p, 10); y -= 6; }
    else if ("img" in b) {
      const img = await pdf.embedPng(b.img);
      const w = W * 0.8, h = (w * b.h) / b.w, x = MARGIN + (W - w) / 2;
      need(h + 22);
      page.drawImage(img, { x, y: y - h, width: w, height: h });
      page.drawRectangle({ x, y: y - h, width: w, height: h, borderColor: line, borderWidth: 0.6 });
      y -= h + 4;
      write(runsOf(b.caption), 9, { color: muted, x, w });
      y -= 8;
    } else {
      const cols = b.head.length, cw = W / cols, size = 9, rowH = 15;
      const row = (cells: string[], boldRow: boolean) => {
        need(rowH);
        cells.forEach((t, i) => {
          const f = boldRow ? fB : fR, tw = f.widthOfTextAtSize(t, size);
          const x = b.right?.includes(i) ? MARGIN + cw * (i + 1) - tw - 4 : MARGIN + cw * i + 2;
          page.drawText(t, { x, y: y - 11, size, font: f, color: boldRow ? muted : ink });
        });
        page.drawLine({ start: { x: MARGIN, y: y - rowH + 1 }, end: { x: MARGIN + W, y: y - rowH + 1 }, thickness: 0.4, color: line });
        y -= rowH;
      };
      row(b.head, true);
      for (const r of b.table) row(r, false);
      y -= 8;
    }
  }
  return new Blob([new Uint8Array(await pdf.save())], { type: "application/pdf" });
}

// ---- Word ----
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const EMU = 360000, TW = 566.929;
const r = (t: string, o: { b?: boolean; sz?: number; color?: string } = {}) =>
  `<w:r><w:rPr>${o.b ? "<w:b/>" : ""}${o.color ? `<w:color w:val="${o.color}"/>` : ""}<w:sz w:val="${(o.sz ?? 10) * 2}"/></w:rPr><w:t xml:space="preserve">${esc(t)}</w:t></w:r>`;
const p = (runs: string, o: { after?: number; keep?: boolean; jc?: string } = {}) =>
  `<w:p><w:pPr>${o.keep ? "<w:keepNext/>" : ""}<w:spacing w:before="0" w:after="${(o.after ?? 6) * 20}" w:line="276" w:lineRule="auto"/>${o.jc ? `<w:jc w:val="${o.jc}"/>` : '<w:jc w:val="both"/>'}</w:pPr>${runs}</w:p>`;
const drawing = (rid: string, n: number, wcm: number, hcm: number) => `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${Math.round(wcm * EMU)}" cy="${Math.round(hcm * EMU)}"/><wp:docPr id="${n}" name="Figura ${n}"/>
<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
<pic:nvPicPr><pic:cNvPr id="${n}" name="fig${n}.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>
<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${Math.round(wcm * EMU)}" cy="${Math.round(hcm * EMU)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;

export function siteDocx(title: string, sub: string, blocks: Block[]) {
  const media: { name: string; data: Uint8Array }[] = [], rels: string[] = [], body: string[] = [];
  body.push(p(r(title, { b: true, sz: 15 }), { after: 2, jc: "left" }), p(r(sub, { sz: 9, color: "595959" }), { after: 10, jc: "left" }));
  const Wcm = 16, Fcm = 13;
  let n = 0;
  for (const b of blocks) {
    if ("title" in b) body.push(p(r(b.title, { b: true, sz: 12 }), { after: 4, keep: true, jc: "left" }));
    else if ("p" in b) body.push(p(b.p.map((x) => r(x.text, { b: x.bold })).join("")));
    else if ("img" in b) {
      n++;
      media.push({ name: `word/media/fig${n}.png`, data: b.img });
      rels.push(`<Relationship Id="rIdFig${n}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/fig${n}.png"/>`);
      body.push(p(drawing(`rIdFig${n}`, n, Fcm, (Fcm * b.h) / b.w), { after: 2, keep: true, jc: "center" }));
      body.push(p(runsOf(b.caption).map((x) => r(x.text, { b: x.bold, sz: 9 })).join(""), { after: 10, jc: "center" }));
    } else {
      const cw = Math.round((Wcm * TW) / b.head.length);
      const cell = (t: string, i: number, head: boolean) => `<w:tc><w:tcPr><w:tcW w:w="${cw}" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:spacing w:before="20" w:after="20"/>${b.right?.includes(i) ? '<w:jc w:val="right"/>' : ""}</w:pPr>${r(t, { b: head, sz: 9, color: head ? "595959" : undefined })}</w:p></w:tc>`;
      const row = (cells: string[], head: boolean) => `<w:tr>${cells.map((t, i) => cell(t, i, head)).join("")}</w:tr>`;
      body.push(`<w:tbl><w:tblPr><w:tblW w:w="${cw * b.head.length}" w:type="dxa"/><w:tblBorders><w:bottom w:val="single" w:sz="4" w:color="D9D2C3"/><w:insideH w:val="single" w:sz="4" w:color="D9D2C3"/></w:tblBorders></w:tblPr><w:tblGrid>${b.head.map(() => `<w:gridCol w:w="${cw}"/>`).join("")}</w:tblGrid>${row(b.head, true)}${b.table.map((x) => row(x, false)).join("")}</w:tbl>`, p("", { after: 6 }));
    }
  }
  const sect = `<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>`;
  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><w:body>${body.join("")}${sect}</w:body></w:document>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial" w:eastAsia="Arial"/><w:sz w:val="20"/><w:lang w:val="ro-RO"/></w:rPr></w:rPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>`;
  const enc = (x: string) => new TextEncoder().encode(x);
  const zip = makeZip([
    { name: "[Content_Types].xml", data: enc(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`) },
    { name: "_rels/.rels", data: enc(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`) },
    { name: "word/_rels/document.xml.rels", data: enc(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>${rels.join("")}</Relationships>`) },
    { name: "word/document.xml", data: enc(doc) },
    { name: "word/styles.xml", data: enc(styles) },
    ...media,
  ]);
  return new Blob([zip], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
}
