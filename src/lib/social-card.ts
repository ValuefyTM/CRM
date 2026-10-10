// Browser-only: draws a listing's share card (the link preview on WhatsApp, Facebook, LinkedIn…) on a canvas and
// stores it; valuefy.ro serves it as the page's preview image. Same drawing as the website's own share button.
import { commissionNote, formatEur, inLang, specLine, typeLabel, type Lang, type Listing } from "./listing-format";

const TEXT = {
  ro: { forSale: (type: string) => `${type} de vânzare`, verified: "Proprietăți verificate", report: "Raport de evaluare ANEVAR" },
  en: { forSale: (type: string) => `${typeLabel(type, "en")} for sale`, verified: "Verified properties", report: "ANEVAR valuation report" },
};

export const CARD_FORMATS = {
  link: { w: 1200, h: 630, label: "Previzualizare link (1200×630)" },
  post: { w: 1080, h: 1350, label: "Postare Instagram / Facebook (1080×1350)" },
} as const;
export type CardFormat = keyof typeof CARD_FORMATS;

const NAVY = "#17173A";
const GOLD = "#F2A93B";
const FONT = "Verdana, Geneva, 'DejaVu Sans', sans-serif";

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error("image"));
    img.src = src;
  });
}

/** Draws `img` so it covers the box, cropped from the centre. */
function cover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const sw = w / scale, sh = h / scale;
  ctx.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, x, y, w, h);
}

/** Wraps text to at most `maxLines`, adding an ellipsis when it is cut. Returns the y after the last line. */
function wrap(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lineH: number, maxLines: number) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width <= maxW || !line) line = test;
    else { lines.push(line); line = w; }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    let last = lines[maxLines - 1];
    while (ctx.measureText(last + "…").width > maxW && last.includes(" ")) last = last.slice(0, last.lastIndexOf(" "));
    lines[maxLines - 1] = last + "…";
  }
  lines.forEach((l, i) => ctx.fillText(l, x, y + i * lineH));
  return y + lines.length * lineH;
}

function pill(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, filled: boolean) {
  ctx.font = `bold ${size}px ${FONT}`;
  const padX = size * 0.8, h = size * 2.1, w = ctx.measureText(text).width + padX * 2;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, h / 2);
  if (filled) { ctx.fillStyle = GOLD; ctx.fill(); }
  else { ctx.strokeStyle = "rgba(255,255,255,0.55)"; ctx.lineWidth = 2; ctx.stroke(); }
  ctx.fillStyle = filled ? NAVY : "#fff";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + padX, y + h / 2 + 1);
  ctx.textBaseline = "alphabetic";
  return w;
}

/** Renders the card and returns a canvas. For English, pass a listing already run through inLang(). */
export async function drawCard(l: Listing, format: CardFormat, lang: Lang = "ro"): Promise<HTMLCanvasElement> {
  const t = TEXT[lang];
  const { w, h } = CARD_FORMATS[format];
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = NAVY;
  ctx.fillRect(0, 0, w, h);

  const img = l.photos[0] ? await loadImage(l.photos[0]).catch(() => null) : null;
  const wide = format === "link";
  // Photo area: left side for the link card, top for the post.
  const photo = wide ? { x: 0, y: 0, w: 700, h } : { x: 0, y: 0, w, h: 820 };
  if (img) cover(ctx, img, photo.x, photo.y, photo.w, photo.h);
  else {
    ctx.fillStyle = "#23234f";
    ctx.fillRect(photo.x, photo.y, photo.w, photo.h);
  }
  // Soft fade into the navy panel.
  const g = wide ? ctx.createLinearGradient(photo.w - 160, 0, photo.w, 0) : ctx.createLinearGradient(0, photo.h - 180, 0, photo.h);
  g.addColorStop(0, "rgba(23,23,58,0)");
  g.addColorStop(1, NAVY);
  ctx.fillStyle = g;
  if (wide) ctx.fillRect(photo.w - 160, 0, 160, h);
  else ctx.fillRect(0, photo.h - 180, w, 180);

  // Brand + type badge on the photo.
  const pad = wide ? 48 : 60;
  ctx.fillStyle = "rgba(255,255,255,0.94)";
  ctx.font = `bold ${wide ? 20 : 26}px ${FONT}`;
  const typeText = t.forSale(l.type);
  const tw = ctx.measureText(typeText).width + (wide ? 32 : 40);
  ctx.beginPath();
  ctx.roundRect(pad, pad, tw, wide ? 44 : 56, wide ? 22 : 28);
  ctx.fill();
  ctx.fillStyle = NAVY;
  ctx.textBaseline = "middle";
  ctx.fillText(typeText, pad + (wide ? 16 : 20), pad + (wide ? 23 : 29));
  ctx.textBaseline = "alphabetic";

  // Text panel.
  const tx = wide ? 740 : pad;
  const maxW = wide ? w - tx - 48 : w - pad * 2;
  let y = wide ? 92 : photo.h + 24;

  ctx.fillStyle = GOLD;
  ctx.font = `bold ${wide ? 22 : 28}px ${FONT}`;
  ctx.fillText("VALUEFY", tx, y);
  const brandW = ctx.measureText("VALUEFY").width;
  ctx.fillStyle = "#a9abc4";
  ctx.font = `${wide ? 18 : 24}px ${FONT}`;
  ctx.fillText(`·  ${t.verified}`, tx + brandW + 14, y);

  y += wide ? 62 : 74;
  ctx.fillStyle = "#fff";
  ctx.font = `bold ${wide ? 50 : 64}px ${FONT}`;
  ctx.fillText(formatEur(l.price, lang), tx, y);

  y += wide ? 48 : 60;
  ctx.font = `bold ${wide ? 26 : 34}px ${FONT}`;
  y = wrap(ctx, l.title, tx, y, maxW, wide ? 36 : 46, wide ? 3 : 2);

  ctx.fillStyle = "#c9cbe0";
  ctx.font = `${wide ? 20 : 27}px ${FONT}`;
  y += wide ? 8 : 10;
  y = wrap(ctx, [l.zone, l.city].filter(Boolean).join(", "), tx, y, maxW, wide ? 28 : 36, 1);
  const spec = specLine(l, lang);
  if (spec) y = wrap(ctx, spec, tx, y + 2, maxW, wide ? 28 : 36, 1);

  // Badges pinned to the bottom of the panel.
  const size = wide ? 18 : 24;
  const by = h - (wide ? 48 : 60) - size * 2.1;
  const first = pill(ctx, `✓ ${commissionNote(lang)}`, tx, by, size, true);
  if (l.report) {
    const badge = t.report;
    ctx.font = `bold ${size}px ${FONT}`;
    const fits = first + 14 + ctx.measureText(badge).width + size * 1.6 <= maxW;
    if (fits) pill(ctx, badge, tx + first + 14, by, size, false);
    else pill(ctx, badge, tx, by - size * 2.1 - 12, size, false);
  }
  return canvas;
}

export async function cardBlob(l: Listing, format: CardFormat, quality = 0.86, lang: Lang = "ro"): Promise<Blob> {
  const canvas = await drawCard(l, format, lang);
  return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("card"))), "image/jpeg", quality));
}

/** Generates the 1200×630 link preview (Romanian and English) and stores it, so the shared link shows it. */
export async function uploadShareImage(l: Listing) {
  const put = async (lang: Lang) => {
    const blob = await cardBlob(lang === "en" ? inLang(l, "en") : l, "link", 0.86, lang);
    const q = lang === "en" ? "?lang=en" : "";
    return (await fetch(`/api/crm/listings/${l.id}/social${q}`, { method: "PUT", headers: { "Content-Type": "image/jpeg" }, body: blob })).ok;
  };
  // Romanian first: it creates the row the English card is stored in.
  const ro = await put("ro");
  const en = await put("en");
  return ro && en;
}
