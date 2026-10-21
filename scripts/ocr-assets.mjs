// Copies the OCR engine (tesseract.js worker + core, Romanian and English data) into public/ocr, so the identity card
// is read in the browser from the CRM itself, with no CDN. Runs before dev and build.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";

const out = "public/ocr";
mkdirSync(out, { recursive: true });
const files = [
  ["node_modules/tesseract.js/dist/worker.min.js", "worker.min.js"],
  ...["", "-simd", "-relaxedsimd"].map((v) => [`node_modules/tesseract.js-core/tesseract-core${v}-lstm.wasm.js`, `tesseract-core${v}-lstm.wasm.js`]),
  ...["ron", "eng"].map((l) => [`node_modules/@tesseract.js-data/${l}/4.0.0_best_int/${l}.traineddata.gz`, `${l}.traineddata.gz`]),
];
for (const [from, to] of files) {
  if (!existsSync(from)) { console.warn(`ocr-assets: lipsește ${from}`); continue; }
  copyFileSync(from, `${out}/${to}`);
}
console.log(`ocr-assets: ${files.length} fișiere în ${out}`);
