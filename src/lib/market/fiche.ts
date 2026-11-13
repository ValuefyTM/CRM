// Client-side: the comparable's sheet (fișa comparabilei) for the report: PDF (the browser's print, so the diacritics
// stay), Word (.docx, the `docx` library) and PNG (SVG → canvas). Photos come from the archive (R2, same origin) and
// are turned into JPEG; the map is a plan drawn from the real coordinates (subject, comparable, distance, scale, north).

export type FicheData = {
  index?: number;
  title: string; source: string; ref: string; url: string; status: string; place: string; caption: string | null;
  price: string; unit: string; details: string; floorYear: string; days: string; portals: string; history: string;
  sim: number | null; distance: string; description: string | null; seller: string; snapshot: string | null;
  verification: string | null;
  photos: string[];
  subject: { lat: number; lng: number; label: string } | null; point: { lat: number; lng: number } | null;
};

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
export const simColor = (v: number) => (v > 80 ? "#1fa971" : v >= 60 ? "#e0a00f" : "#e07b2e");

/** A photo of the archive as a JPEG data URL (null when it cannot be read, e.g. a foreign image without CORS). */
export async function jpeg(src: string, w = 900): Promise<string | null> {
  try {
    const r = await fetch(src, { credentials: "same-origin" });
    if (!r.ok) return null;
    const bmp = await createImageBitmap(await r.blob());
    const h = Math.round((bmp.height / bmp.width) * w);
    const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
    cv.getContext("2d")!.drawImage(bmp, 0, 0, w, h);
    return cv.toDataURL("image/jpeg", 0.85);
  } catch { return null; }
}

/** The plan of the two points: subject and comparable, the dashed line with the distance, a scale bar and north. */
export function planSvg(d: FicheData, W = 1000, H = 600) {
  if (!d.subject || !d.point) return null;
  const k = Math.cos((d.subject.lat * Math.PI) / 180);
  const dx = (d.point.lng - d.subject.lng) * 111_320 * k, dy = (d.point.lat - d.subject.lat) * 111_320;
  const meters = Math.hypot(dx, dy) || 1;
  const scale = Math.min((W * 0.5) / Math.max(Math.abs(dx), 1), (H * 0.5) / Math.max(Math.abs(dy), 1), (W * 0.45) / meters * 1.6);
  const cx = W / 2 - (dx * scale) / 2, cy = H / 2 + (dy * scale) / 2;
  const px = cx + dx * scale, py = cy - dy * scale;
  const nice = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000].find((m) => m * scale >= W * 0.12) ?? 5000;
  const mx = (cx + px) / 2, my = (cy + py) / 2;
  const grid = Array.from({ length: 11 }, (_, i) => `<line x1="${(i * W) / 10}" y1="0" x2="${(i * W) / 10}" y2="${H}" stroke="#ece7db"/><line x1="0" y1="${(i * H) / 10}" x2="${W}" y2="${(i * H) / 10}" stroke="#ece7db"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#fbf8f2"/>${grid}` +
    `<line x1="${cx}" y1="${cy}" x2="${px}" y2="${py}" stroke="#e0931a" stroke-width="5" stroke-dasharray="16 10" stroke-linecap="round"/>` +
    `<rect x="${mx - 80}" y="${my - 22}" width="160" height="44" rx="8" fill="#e0931a"/><text x="${mx}" y="${my + 9}" text-anchor="middle" font-family="Arial" font-size="24" font-weight="bold" fill="#141414">~${esc(d.distance)}</text>` +
    `<circle cx="${cx}" cy="${cy}" r="24" fill="#fff" stroke="#e0931a" stroke-width="6"/><rect x="${cx - 10}" y="${cy - 10}" width="20" height="20" fill="#e0931a" transform="rotate(45 ${cx} ${cy})"/>` +
    `<rect x="${cx - 70}" y="${cy + 34}" width="140" height="34" rx="6" fill="#e0931a"/><text x="${cx}" y="${cy + 57}" text-anchor="middle" font-family="Arial" font-size="18" font-weight="bold" fill="#141414">SUBIECT</text>` +
    `<circle cx="${px}" cy="${py}" r="24" fill="#fff" stroke="#141414" stroke-width="6"/><circle cx="${px}" cy="${py}" r="11" fill="#141414"/>` +
    `<rect x="${px - 98}" y="${py + 34}" width="196" height="34" rx="6" fill="#141414"/><text x="${px}" y="${py + 57}" text-anchor="middle" font-family="Arial" font-size="18" font-weight="bold" fill="#fff">COMPARABILĂ</text>` +
    `<rect x="${W - 90}" y="22" width="66" height="70" rx="8" fill="#fff" stroke="#e2d8c4" stroke-width="2"/><path d="M${W - 57},32 L${W - 45},66 L${W - 57},58 L${W - 69},66 Z" fill="#141414"/><text x="${W - 57}" y="86" text-anchor="middle" font-family="Arial" font-size="15" fill="#6b6b6b">N</text>` +
    `<rect x="22" y="${H - 58}" width="${nice * scale + 110}" height="38" rx="6" fill="#fff" stroke="#e2d8c4" stroke-width="2"/><line x1="36" y1="${H - 39}" x2="${36 + nice * scale}" y2="${H - 39}" stroke="#141414" stroke-width="4"/>` +
    `<text x="${46 + nice * scale}" y="${H - 32}" font-family="Arial" font-size="18" fill="#4a4a4a">${nice >= 1000 ? `${nice / 1000} km` : `${nice} m`}</text></svg>`;
}

async function svgToJpeg(svg: string, w: number, h: number) {
  return new Promise<string | null>((res) => {
    const img = new Image();
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
    img.onload = () => { const cv = document.createElement("canvas"); cv.width = w; cv.height = h; const x = cv.getContext("2d")!; x.fillStyle = "#fff"; x.fillRect(0, 0, w, h); x.drawImage(img, 0, 0, w, h); URL.revokeObjectURL(url); res(cv.toDataURL("image/jpeg", 0.9)); };
    img.onerror = () => { URL.revokeObjectURL(url); res(null); };
    img.src = url;
  });
}

const rows = (d: FicheData): [string, string][] => [
  ["Adresă / zonă", d.place], ["Suprafețe", d.details], ["Etaj / an", d.floorYear], ["Preț / unitar", `${d.price} · ${d.unit}`], ["Istoric preț", d.history],
  ["Expunere", `${d.days} · ${d.portals}`], ["Sursă", `${d.source} · ref. ${d.ref}`], ["Vânzător", d.seller],
  ...(d.subject ? [["Distanța față de subiect", d.distance], ["Grad de similaritate", d.sim != null ? `${d.sim}%` : "—"]] as [string, string][] : []),
];

/** PDF: a print-ready sheet in a new window (2 pages), printed by the browser — „Salvează ca PDF”. */
export async function printFiche(d: FicheData) {
  const w = window.open("", "_blank");
  if (!w) throw new Error("Browserul a blocat fereastra nouă (permite ferestrele pop-up pentru CRM).");
  w.document.write("<p style='font-family:Arial;padding:24px'>Se pregătește fișa…</p>");
  const photos = (await Promise.all(d.photos.slice(0, 7).map((p) => jpeg(p, 900)))).filter((x): x is string => !!x);
  const plan = planSvg(d);
  const no = d.index ? `Comparabila ${d.index}` : "Fișa comparabilei";
  const html = `<!doctype html><html lang="ro"><head><meta charset="utf-8"><title>${esc(no)} · ${esc(d.source)} ${esc(d.ref)}</title><style>
    @page{size:A4;margin:14mm} *{box-sizing:border-box} body{font-family:Arial,Helvetica,sans-serif;color:#141414;margin:0;font-size:10.5pt}
    .bar{background:#141414;color:#fff;padding:8px 12px;display:flex;justify-content:space-between;align-items:center;font-size:10pt}
    .bar b{font-size:12pt} .bar a{color:#f2a93b;font-weight:bold;text-decoration:none}
    .top{display:grid;grid-template-columns:42% 1fr;gap:14px;margin-top:12px} .top img{width:100%;height:58mm;object-fit:cover;border:1px solid #e2d8c4}
    h1{font-size:15pt;margin:0 0 4px} .cap{color:#6b6b6b;font-size:8.5pt;margin:0 0 8px} .tags span{display:inline-block;font-size:8pt;font-weight:bold;padding:3px 7px;margin-right:4px;border-radius:4px;background:#f3eee3}
    .tags .sim{color:#fff} .price{font-size:17pt;font-weight:bold;margin-top:10px} .price small{font-size:9pt;color:#6b6b6b;font-weight:normal}
    .sec{margin-top:14px;border-top:1px solid #e2d8c4;padding-top:6px;font-size:8pt;font-weight:bold;letter-spacing:.08em;text-transform:uppercase;color:#4a4a4a} .sec i{color:#e0931a;font-style:normal;margin-right:8px}
    table{width:100%;border-collapse:collapse;margin-top:6px} td{padding:5px 8px;vertical-align:top;font-size:9.5pt} tr:nth-child(odd) td{background:#fbf8f2} td:first-child{width:32%;color:#6b6b6b;font-size:8pt;text-transform:uppercase;letter-spacing:.04em}
    .desc{white-space:pre-wrap;font-style:italic;color:#4a4a4a;font-size:9.5pt;line-height:1.5;margin-top:6px} .ver{margin-top:6px;padding:10px 12px;border-left:4px solid ${d.verification ? "#1fa971" : "#e2d8c4"};background:${d.verification ? "#eef8f2" : "#fbf8f2"};font-size:9.5pt;line-height:1.5}
    .snap{margin-top:10px;font-size:8pt;color:#157f55} .p2{page-break-before:always} .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:6px} .grid img{width:100%;height:42mm;object-fit:cover;border:1px solid #e2d8c4}
    .plan{margin-top:6px;border:1px solid #e2d8c4} .plan svg{width:100%;height:auto;display:block} .foot{margin-top:6px;font-size:9pt;color:#4a4a4a}
  </style></head><body>
  <div class="bar"><span><b>${esc(no)}</b> &nbsp; ${esc(d.source)} · ref. ${esc(d.ref)}</span><a href="${esc(d.url)}">anunț original ↗</a></div>
  <div class="top">${photos[0] ? `<img src="${photos[0]}" alt="">` : "<div></div>"}<div>
    <h1>${esc(d.title)}</h1>${d.caption ? `<p class="cap">${esc(d.caption)}</p>` : ""}
    <div class="tags">${d.sim != null ? `<span class="sim" style="background:${simColor(d.sim)}">SIM ${d.sim}%</span>` : ""}${d.subject ? `<span>~${esc(d.distance)}</span>` : ""}<span>${esc(d.status.toUpperCase())}</span></div>
    <div class="price">${esc(d.price)} <small>${esc(d.unit)}</small></div></div></div>
  <div class="sec"><i>01</i>Datele proprietății</div><table>${rows(d).map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join("")}</table>
  <div class="sec"><i>02</i>Descrierea din anunțul original</div><div class="desc">${esc(d.description ?? "—")}</div>
  <div class="sec"><i>03</i>Verificare telefonică</div><div class="ver">${esc(d.verification ?? "Comparabila nu a fost verificată telefonic până la data întocmirii prezentei fișe.")}</div>
  ${d.snapshot ? `<div class="snap">✓ ${esc(d.snapshot)}</div>` : ""}
  <div class="p2"><div class="bar"><span><b>${esc(no)}</b> — fotografii și amplasament</span><span>${esc(d.source)} · ref. ${esc(d.ref)}</span></div>
  <div class="sec"><i>04</i>Fotografii din anunțul original</div><div class="grid">${photos.slice(1, 7).map((p) => `<img src="${p}" alt="">`).join("") || "<p>Fără fotografii arhivate.</p>"}</div>
  ${d.subject ? `<div class="sec"><i>05</i>Amplasament față de proprietatea subiect</div>${plan ? `<div class="plan">${plan}</div>` : "<p>Fără coordonate.</p>"}
  <p class="foot">Distanța față de proprietatea subiect: ~${esc(d.distance)} (linie dreaptă) · grad de similaritate: ${d.sim != null ? `${d.sim}%` : "—"}</p>` : ""}</div>
  <script>window.onload=()=>setTimeout(()=>window.print(),300)<\/script></body></html>`;
  w.document.open(); w.document.write(html); w.document.close();
}

/** Word (.docx): the same sheet, two pages, Arial, with the diacritics. */
export async function wordFiche(d: FicheData) {
  const dx = await import("docx");
  const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, ImageRun, AlignmentType, ExternalHyperlink, BorderStyle, ShadingType } = dx;
  const none = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
  const noB = { top: none, bottom: none, left: none, right: none };
  const u8 = (url: string) => Uint8Array.from(atob(url.split(",")[1]), (c) => c.charCodeAt(0));
  const img = (url: string, w: number, h: number) => new ImageRun({ data: u8(url), type: "jpg", transformation: { width: w, height: h } });
  const SEC = (no: string, t: string) => new Paragraph({ children: [new TextRun({ text: `${no}  `, bold: true, size: 18, color: "E0931A" }), new TextRun({ text: t.toUpperCase(), bold: true, size: 18, color: "4A4A4A" })],
    spacing: { before: 260, after: 140 }, border: { top: { style: BorderStyle.SINGLE, size: 4, color: "E2D8C4", space: 6 } } });
  const kv = (k: string, v: string, i: number) => new TableRow({ children: [
    new TableCell({ width: { size: 32, type: WidthType.PERCENTAGE }, borders: noB, shading: i % 2 ? undefined : { type: ShadingType.CLEAR, fill: "FBF8F2", color: "auto" }, margins: { top: 60, bottom: 60, left: 80, right: 80 },
      children: [new Paragraph({ children: [new TextRun({ text: k.toUpperCase(), size: 15, color: "6B6B6B" })] })] }),
    new TableCell({ width: { size: 68, type: WidthType.PERCENTAGE }, borders: noB, shading: i % 2 ? undefined : { type: ShadingType.CLEAR, fill: "FBF8F2", color: "auto" }, margins: { top: 60, bottom: 60, left: 80, right: 80 },
      children: [new Paragraph({ children: [new TextRun({ text: v, size: 19 })] })] }),
  ] });
  const photos = (await Promise.all(d.photos.slice(0, 7).map((p) => jpeg(p, 900)))).filter((x): x is string => !!x);
  const plan = planSvg(d);
  const planImg = plan ? await svgToJpeg(plan, 1000, 600) : null;
  const no = d.index ? `Comparabila ${d.index}` : "Fișa comparabilei";
  const head = [
    new Paragraph({ children: [new TextRun({ text: no, bold: true, size: 34 }), new TextRun({ text: `   ${d.source} · ref. ${d.ref}   `, size: 16, color: "6B6B6B" }),
      new ExternalHyperlink({ link: d.url, children: [new TextRun({ text: "anunț original ↗", size: 16, color: "E0931A", bold: true, underline: {} })] })], spacing: { after: 200 } }),
    new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: { ...noB, insideHorizontal: none, insideVertical: none }, rows: [new TableRow({ children: [
      new TableCell({ width: { size: 40, type: WidthType.PERCENTAGE }, borders: noB, children: [new Paragraph({ children: photos[0] ? [img(photos[0], 210, 140)] : [] })] }),
      new TableCell({ width: { size: 60, type: WidthType.PERCENTAGE }, borders: noB, margins: { left: 160 }, children: [
        new Paragraph({ children: [new TextRun({ text: d.title, bold: true, size: 26 })], spacing: { after: 80 } }),
        ...(d.caption ? [new Paragraph({ children: [new TextRun({ text: d.caption, size: 16, color: "6B6B6B" })], spacing: { after: 120 } })] : []),
        new Paragraph({ children: [
          ...(d.sim != null ? [new TextRun({ text: ` SIM ${d.sim}% `, bold: true, size: 16, color: "FFFFFF", shading: { type: ShadingType.CLEAR, fill: simColor(d.sim).slice(1).toUpperCase(), color: "auto" } })] : []),
          new TextRun({ text: `   ~${d.distance}   ${d.status.toUpperCase()}`, size: 16, color: "4A4A4A" })], spacing: { after: 140 } }),
        new Paragraph({ children: [new TextRun({ text: d.price, bold: true, size: 32 }), new TextRun({ text: `   ${d.unit}`, size: 18, color: "6B6B6B" })] }),
      ] }),
    ] })] }),
    SEC("01", "Datele proprietății"),
    new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: { ...noB, insideHorizontal: none, insideVertical: none }, rows: rows(d).map(([k, v], i) => kv(k, v, i)) }),
    SEC("02", "Descrierea din anunțul original"),
    ...(d.description ?? "—").split(/\n\s*\n/).map((p) => new Paragraph({ alignment: AlignmentType.JUSTIFIED, children: [new TextRun({ text: p.trim(), size: 19, italics: true, color: "4A4A4A" })], spacing: { after: 120, line: 300 } })),
    SEC("03", "Verificare telefonică"),
    new Paragraph({ alignment: AlignmentType.JUSTIFIED, shading: { type: ShadingType.CLEAR, fill: d.verification ? "EEF8F2" : "FBF8F2", color: "auto" },
      border: { left: { style: BorderStyle.SINGLE, size: 18, color: d.verification ? "1FA971" : "E2D8C4", space: 8 } },
      children: [new TextRun({ text: d.verification ?? "Comparabila nu a fost verificată telefonic până la data întocmirii prezentei fișe.", size: 19, color: d.verification ? "141414" : "6B6B6B" })], spacing: { line: 300 } }),
    ...(d.snapshot ? [new Paragraph({ children: [new TextRun({ text: `✓ ${d.snapshot}`, size: 15, color: "157F55" })], spacing: { before: 200 } })] : []),
  ];
  const page2 = [
    new Paragraph({ pageBreakBefore: true, children: [new TextRun({ text: `${no} — fotografii și amplasament`, bold: true, size: 26 })], spacing: { after: 160 } }),
    SEC("04", "Fotografii din anunțul original"),
    ...(photos.length > 1 ? [0, 3].filter((r) => photos[1 + r]).map((r) => new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: { ...noB, insideHorizontal: none, insideVertical: none },
      rows: [new TableRow({ children: [0, 1, 2].map((k) => new TableCell({ borders: noB, margins: { top: 40, bottom: 40, left: 40, right: 40 },
        children: [new Paragraph({ children: photos[1 + r + k] ? [img(photos[1 + r + k], 150, 100)] : [] })] })) })] }))
      : [new Paragraph({ children: [new TextRun({ text: "Fără fotografii arhivate.", size: 18, color: "6B6B6B" })] })]),
    ...(d.subject ? [SEC("05", "Amplasament față de proprietatea subiect"),
      ...(planImg ? [new Paragraph({ children: [img(planImg, 470, 282)], spacing: { after: 120 } })] : []),
      new Paragraph({ children: [new TextRun({ text: `Distanța față de proprietatea subiect: ~${d.distance} (linie dreaptă) · grad de similaritate: ${d.sim != null ? `${d.sim}%` : "—"}`, size: 18, color: "4A4A4A" })] })] : []),
  ];
  const doc = new Document({ styles: { default: { document: { run: { font: "Arial" } } } }, sections: [{ properties: { page: { margin: { top: 900, bottom: 900, left: 900, right: 900 } } }, children: [...head, ...page2] }] });
  download(await Packer.toBlob(doc), `comparabila_${d.source}_${d.ref}.docx`);
}

/** PNG: a one-image summary of the sheet. */
export async function pngFiche(d: FicheData) {
  const photos = (await Promise.all(d.photos.slice(0, 3).map((p) => jpeg(p, 440)))).filter((x): x is string => !!x);
  const ln = (y: number, k: string, v: string) => `<text x="30" y="${y}" font-family="Arial" font-size="11.5" fill="#6b6b6b">${esc(k.toUpperCase())}</text><text x="190" y="${y}" font-family="Arial" font-size="13" fill="#141414">${esc(v)}</text>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 500" width="720" height="500"><rect width="720" height="500" fill="#fff"/>` +
    `<rect width="720" height="44" fill="#141414"/><text x="24" y="28" font-family="Arial" font-size="13" font-weight="bold" fill="#fff">FIȘA COMPARABILEI · ${esc(d.source)} · ${esc(d.ref)}</text>` +
    (d.sim != null ? `<rect x="610" y="11" width="90" height="22" rx="4" fill="${simColor(d.sim)}"/><text x="655" y="27" text-anchor="middle" font-family="Arial" font-size="12" font-weight="bold" fill="#fff">SIM ${d.sim}%</text>` : "") +
    `<text x="24" y="76" font-family="Arial" font-size="20" font-weight="bold" fill="#141414">${esc(d.title.slice(0, 64))}</text><text x="24" y="97" font-family="Arial" font-size="11" fill="#6b6b6b">${esc(d.place.slice(0, 100))}</text>` +
    [0, 1, 2].map((i) => photos[i] ? `<image href="${photos[i]}" x="${24 + i * 232}" y="112" width="216" height="110" preserveAspectRatio="xMidYMid slice"/>` : `<rect x="${24 + i * 232}" y="112" width="216" height="110" fill="#f3eee3"/>`).join("") +
    ln(252, "Suprafețe", d.details) + ln(278, "Preț", `${d.price} · ${d.unit}`) + ln(304, "Istoric preț", d.history) + ln(330, "Pe piață", `${d.days} · ${d.status} · ${d.portals}`) +
    ln(356, "Distanță subiect", d.subject ? `~${d.distance}` : "—") + ln(382, "Vânzător", d.seller) +
    `<rect x="24" y="410" width="672" height="64" rx="6" fill="${d.verification ? "#eef8f2" : "#fbf8f2"}" stroke="#e2d8c4"/>` +
    `<text x="36" y="434" font-family="Arial" font-size="11" font-weight="bold" fill="${d.verification ? "#157f55" : "#6b6b6b"}">${d.verification ? "✓ VERIFICATĂ TELEFONIC" : "NEVERIFICATĂ TELEFONIC"}</text>` +
    `<text x="36" y="456" font-family="Arial" font-size="10.5" fill="#157f55">${esc(d.snapshot ? `✓ ${d.snapshot}` : "")}</text></svg>`;
  const url = await new Promise<string | null>((res) => {
    const img = new Image();
    const u = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
    img.onload = () => { const cv = document.createElement("canvas"); cv.width = 1440; cv.height = 1000; const x = cv.getContext("2d")!; x.fillStyle = "#fff"; x.fillRect(0, 0, 1440, 1000); x.drawImage(img, 0, 0, 1440, 1000); URL.revokeObjectURL(u); res(cv.toDataURL("image/png")); };
    img.onerror = () => { URL.revokeObjectURL(u); res(null); };
    img.src = u;
  });
  if (!url) throw new Error("Generarea imaginii a eșuat.");
  const a = document.createElement("a"); a.href = url; a.download = `fisa_${d.source}_${d.ref}.png`; a.click();
}

function download(blob: Blob, name: string) {
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
