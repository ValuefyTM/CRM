// The layout of a photo / document annex (Anexă foto, Anexă documente), the same as UVALO's Word add-in
// (public/word/src/layout.js in ValuefyTM/uvalo): photos or document pages in a grid, so many per page, with captions
// numbered under them, a title over the annex and over each document. All lengths in cm, from the top-left corner of
// the sheet. No server code: used by the builder's preview and by the PDF / Word export.

export type Mode = "foto" | "acte";
export type Fit = "contain" | "crop";
export type Ratio = "4:3" | "3:2" | "16:9" | "1:1" | "3:4";
export type PageFormat = "a4p" | "a4l" | "letter";

export type Settings = {
  perPage: number;
  fit: Fit; ratio: Ratio; follow: boolean;
  gapMm: number; border: "none" | "thin" | "medium";
  caption: { on: boolean; prefix: string; numbering: boolean; startAt: number; size: number; lines: 1 | 2; bold: boolean; useName: boolean };
  title: { on: boolean; text: string; align: "center" | "left"; size: number; repeat: boolean };
  docTitle: { on: boolean; prefix: string; align: "center" | "left"; size: number; repeat: boolean };
  page: { format: PageFormat; top: number; bottom: number; left: number; right: number };
  dpi: 110 | 150 | 220 | 300;
  autoRotate: boolean;
};

/** "Poze pe pagină": n → [columns, rows]. */
export const GRIDS: Record<number, [number, number]> = { 1: [1, 1], 2: [1, 2], 3: [1, 3], 4: [2, 2], 6: [2, 3], 8: [2, 4], 9: [3, 3], 12: [3, 4] };
export const RATIOS: Ratio[] = ["4:3", "3:2", "16:9", "1:1", "3:4"];
export const SHEETS: Record<PageFormat, [w: number, h: number, label: string]> = { a4p: [21, 29.7, "A4 portret"], a4l: [29.7, 21, "A4 peisaj"], letter: [21.59, 27.94, "Letter"] };
export const DPI: [Settings["dpi"], string][] = [[110, "Compactă"], [150, "Standard"], [220, "Tipar"], [300, "Foarte bună"]];

const BASE: Settings = {
  perPage: 6, fit: "contain", ratio: "4:3", follow: false, gapMm: 4, border: "none",
  caption: { on: true, prefix: "Foto", numbering: true, startAt: 1, size: 9, lines: 1, bold: true, useName: false },
  title: { on: true, text: "ANEXA – FOTOGRAFII", align: "center", size: 12, repeat: false },
  docTitle: { on: false, prefix: "", align: "left", size: 11, repeat: false },
  page: { format: "a4p", top: 2, bottom: 2, left: 2, right: 2 },
  dpi: 150, autoRotate: false,
};
export const DEFAULTS: Record<Mode, Settings> = {
  foto: BASE,
  acte: {
    ...BASE, perPage: 1, border: "thin", dpi: 220, autoRotate: true,
    caption: { ...BASE.caption, on: false, prefix: "Pagina", useName: true },
    title: { ...BASE.title, text: "ANEXA – DOCUMENTE" },
    docTitle: { on: true, prefix: "", align: "left", size: 11, repeat: false },
  },
};

/** Settings read back (saved earlier, maybe from an older version): every field present and in range. */
export function settingsOf(mode: Mode, saved: unknown): Settings {
  const d = DEFAULTS[mode];
  const s = (saved && typeof saved === "object" ? saved : {}) as Partial<Settings>;
  const num = (v: unknown, def: number, lo: number, hi: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : def);
  const out: Settings = {
    ...d, ...s,
    caption: { ...d.caption, ...(s.caption ?? {}) }, title: { ...d.title, ...(s.title ?? {}) }, docTitle: { ...d.docTitle, ...(s.docTitle ?? {}) }, page: { ...d.page, ...(s.page ?? {}) },
  };
  if (!GRIDS[out.perPage]) out.perPage = d.perPage;
  if (!RATIOS.includes(out.ratio)) out.ratio = d.ratio;
  if (!SHEETS[out.page.format]) out.page.format = d.page.format;
  if (!DPI.some(([v]) => v === out.dpi)) out.dpi = d.dpi;
  out.gapMm = num(out.gapMm, d.gapMm, 0, 20);
  out.caption.size = num(out.caption.size, 9, 6, 14);
  out.caption.startAt = Math.round(num(out.caption.startAt, 1, 0, 9999));
  out.caption.lines = out.caption.lines === 2 ? 2 : 1;
  out.title.size = num(out.title.size, 12, 8, 20);
  out.docTitle.size = num(out.docTitle.size, 11, 8, 20);
  for (const k of ["top", "bottom", "left", "right"] as const) out.page[k] = num(out.page[k], d.page[k], 0, 6);
  return out;
}

export const PT_CM = 0.03528;
const SEP = " – ", CAP_SPACE_PT = 2, TITLE_AFTER_PT = 8, DOC_AFTER_PT = 6, SAFETY = 0.4;

/** One element of the list: a photo, or a page of a document (w × h = its size before rotation). */
export type Item = { id: string; name: string; w: number; h: number; rot: number; desc: string; doc?: string | null };
export type Doc = { id: string; title: string };

/** A camera name says nothing (IMG_1234, DSC…, PXL…, only digits); another file name becomes a description. */
export function niceName(name: string) {
  const base = name.replace(/\.[a-z0-9]{2,5}$/i, "").trim();
  if (/^(img|dsc|dscn|pxl|dji|mvimg|photo|image|screenshot|whatsapp image)[\s_-]*[\d_-]*/i.test(base) && !/[a-zăâîșț]{3,}/i.test(base.replace(/^(img|dsc|dscn|pxl|dji|mvimg|photo|image|screenshot|whatsapp image)/i, ""))) return "";
  if (/^[\d\s_.-]+$/.test(base)) return "";
  const t = base.replace(/^[\d\s_.-]+/, "").replace(/_/g, " ").replace(/\s+/g, " ").trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : "";
}
export const docTitleFrom = (name: string) => {
  const t = name.replace(/\.[a-z0-9]{2,5}$/i, "").replace(/_/g, " ").replace(/\s*-\s*/g, " - ").replace(/\s+/g, " ").trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : name;
};

/** The caption of the n-th photo: "Foto 3 – Bucătărie" (prefix and number bold when asked). */
export function captionOf(s: Settings, n: number, it: Item): { head: string; rest: string } | null {
  if (!s.caption.on) return null;
  const head = s.caption.numbering ? (s.caption.prefix ? `${s.caption.prefix} ${n}` : String(n)) : s.caption.prefix;
  const desc = it.desc.trim() || (s.caption.useName ? niceName(it.name) : "");
  if (!head && !desc) return { head: "", rest: "" };
  return { head, rest: head && desc ? `${SEP}${desc}` : desc };
}

/** The size of the item after its rotation. */
export const turned = (it: Pick<Item, "w" | "h" | "rot">) => (it.rot % 180 ? [it.h, it.w] : [it.w, it.h]);

/** Where the image goes in its box: contain (all of it) or crop (a uniform ratio, centred crop). */
export function displaySize(s: Settings, w: number, h: number, boxW: number, boxH: number) {
  if (s.fit === "crop") {
    const [a, b] = s.ratio.split(":").map(Number);
    let r = a / b;
    if (s.follow && ((h > w && r > 1) || (w > h && r < 1))) r = 1 / r;
    let bw = boxW, bh = bw / r;
    if (bh > boxH) { bh = boxH; bw = bh * r; }
    const ir = w / h;
    const crop = ir > r ? { x: (1 - r / ir) / 2, y: 0, w: r / ir, h: 1 } : { x: 0, y: (1 - ir / r) / 2, w: 1, h: ir / r };
    return { w: bw, h: bh, crop };
  }
  const sc = Math.min(boxW / w, boxH / h);
  return { w: w * sc, h: h * sc, crop: { x: 0, y: 0, w: 1, h: 1 } };
}

export type Text = { text: string; bold?: boolean; x: number; y: number; w: number; size: number; align: "center" | "left" };
export type Cell = { item: Item; n: number; x: number; y: number; w: number; h: number; crop: { x: number; y: number; w: number; h: number };
  caption: { head: string; rest: string; x: number; y: number; w: number; h: number } | null; cellX: number; cellW: number };
export type Page = { title: Text | null; docTitle: Text | null; cells: Cell[]; cols: number; rows: number; colW: number; gap: number; rowH: number[] };

/** The pages of the annex: the ticked items in order, so many per page; with document titles, each document on its own pages. */
export function layout(s: Settings, items: Item[], docs: Doc[] = [], mode: Mode = "foto"): { pages: Page[]; sheet: [number, number]; area: [number, number]; cellMax: [number, number] } {
  const [sw, sh] = SHEETS[s.page.format];
  const W = Math.max(3, sw - s.page.left - s.page.right), H = Math.max(3, sh - s.page.top - s.page.bottom);
  const [cols, rows] = GRIDS[s.perPage] ?? [2, 3];
  const gap = s.gapMm / 10;
  const titleH = s.title.on && s.title.text.trim() ? s.title.size * PT_CM * 1.35 + TITLE_AFTER_PT * PT_CM + 0.05 : 0;
  const docH = s.docTitle.size * PT_CM * 1.35 + DOC_AFTER_PT * PT_CM + 0.05;
  const capH = s.caption.on ? s.caption.lines * s.caption.size * PT_CM * 1.2 + CAP_SPACE_PT * PT_CM : 0;
  const imgW = (W - gap * (cols - 1)) / cols;
  const boxOf = (t: number, d: number) => Math.max(1, (H - t - d - SAFETY - rows * capH - gap * (rows - 1)) / rows);

  // the chunks: by document (each starts on a new page) when its title is shown, else straight through
  const byDoc = mode === "acte" && s.docTitle.on;
  const chunks: { items: Item[]; doc: Doc | null; first: boolean }[] = [];
  if (byDoc) {
    let run: Item[] = [], cur: string | null | undefined;
    const flush = () => {
      for (let i = 0; i < run.length; i += s.perPage) chunks.push({ items: run.slice(i, i + s.perPage), doc: docs.find((d) => d.id === cur) ?? null, first: i === 0 });
      run = [];
    };
    for (const it of items) { if (it.doc !== cur) { flush(); cur = it.doc; } run.push(it); }
    flush();
  } else for (let i = 0; i < items.length; i += s.perPage) chunks.push({ items: items.slice(i, i + s.perPage), doc: null, first: i === 0 });

  const docNo = new Map<string, number>();
  for (const it of items) if (it.doc && !docNo.has(it.doc)) docNo.set(it.doc, docNo.size + 1);
  let n = s.caption.startAt;
  const pages: Page[] = chunks.map((ch, pi) => {
    const withTitle = titleH > 0 && (pi === 0 || s.title.repeat);
    const tH = withTitle ? titleH : 0;
    const docTitleText = ch.doc && (ch.first || s.docTitle.repeat) ? `${s.docTitle.prefix.replace(/\{n\}/g, String(docNo.get(ch.doc.id) ?? 1))}${ch.doc.title}${ch.first ? "" : " (continuare)"}`.trim() : "";
    const dH = docTitleText ? docH : 0;
    const boxH = boxOf(tH, dH);
    const title: Text | null = withTitle ? { text: `${s.title.text.trim()}${pi > 0 ? " (continuare)" : ""}`, bold: true, x: s.page.left, y: s.page.top, w: W, size: s.title.size, align: s.title.align } : null;
    const docTitle: Text | null = docTitleText ? { text: docTitleText, bold: true, x: s.page.left, y: s.page.top + tH, w: W, size: s.docTitle.size, align: s.docTitle.align } : null;
    let y = s.page.top + tH + dH;
    const cells: Cell[] = [], rowH: number[] = [];
    for (let r = 0; r * cols < ch.items.length; r++) {
      const row = ch.items.slice(r * cols, r * cols + cols).map((it) => { const [w, h] = turned(it); return { it, d: displaySize(s, w, h, imgW, boxH) }; });
      const rh = Math.max(...row.map((x) => x.d.h));
      row.forEach(({ it, d }, c) => {
        const cellX = s.page.left + c * (imgW + gap);
        const cap = captionOf(s, n, it);
        cells.push({
          item: it, n, x: cellX + (imgW - d.w) / 2, y: s.fit === "crop" ? y : y + (rh - d.h) / 2, w: d.w, h: d.h, crop: d.crop, cellX, cellW: imgW,
          caption: cap ? { ...cap, x: cellX, y: y + rh + CAP_SPACE_PT * PT_CM, w: imgW, h: capH - CAP_SPACE_PT * PT_CM } : null,
        });
        n++;
      });
      rowH.push(rh);
      y += rh + capH + gap;
    }
    return { title, docTitle, cells, cols, rows, colW: imgW, gap, rowH };
  });
  return { pages, sheet: [sw, sh], area: [W, H], cellMax: [imgW, boxOf(titleH, 0)] };
}
