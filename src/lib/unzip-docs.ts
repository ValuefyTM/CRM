// Server-only: a ZIP of documents opened into its files (each kept as its own document): the ones the CRM accepts,
// without folders, system files (__MACOSX, .DS_Store, Thumbs.db) or archives inside the archive.
import { unzipSync } from "fflate";

const ACCEPTED = /\.(pdf|jpe?g|png|heic|heif|webp|docx?|xlsx?)$/i;
const MAX_FILES = 100;
const MAX_TOTAL = 90 * 1024 * 1024; // what a worker can hold at once

export const isZip = (name: string) => /\.zip$/i.test(name);

export type Unzipped = { name: string; data: Uint8Array }[];

export function unzipDocs(bytes: Uint8Array): { ok: true; files: Unzipped; skipped: string[] } | { ok: false; error: string } {
  const skipped: string[] = [];
  let total = 0, count = 0, tooBig = false;
  let out: Record<string, Uint8Array>;
  try {
    out = unzipSync(bytes, {
      filter: (f) => {
        const base = f.name.split("/").pop() ?? "";
        if (!base || f.name.endsWith("/") || f.name.startsWith("__MACOSX/") || base.startsWith(".") || /^thumbs\.db$/i.test(base)) return false;
        if (!ACCEPTED.test(base)) { skipped.push(base); return false; }
        if (count >= MAX_FILES || total + f.originalSize > MAX_TOTAL) { tooBig = true; skipped.push(base); return false; }
        count++; total += f.originalSize;
        return true;
      },
    });
  } catch {
    return { ok: false, error: "Arhiva nu poate fi deschisă (e protejată cu parolă sau deteriorată). Încarcă fișierele separat." };
  }
  const files = Object.entries(out).filter(([, d]) => d.byteLength > 0).map(([path, data]) => ({ name: path.split("/").pop()!, data }))
    .sort((a, b) => a.name.localeCompare(b.name, "ro", { numeric: true }));
  if (!files.length) return { ok: false, error: skipped.length ? "Arhiva nu conține fișiere acceptate (PDF, imagini, Word, Excel)." : "Arhiva e goală." };
  if (tooBig) skipped.push(`(arhiva are mai mult de ${MAX_FILES} fișiere sau peste 90 MB dezarhivat: restul nu s-au încărcat)`);
  return { ok: true, files, skipped };
}
