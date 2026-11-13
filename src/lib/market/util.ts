// Server-only helpers of the market crawler (anunțuri de piață): number parsing, text cleanup, embedded JSON.

/** "1.234,5" / "1,234.5" / "12 949" / "3 000 €" → number; null when there is none. */
export function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const m = String(v).replace(/[  ]/g, " ").match(/\d[\d .,]*/);
  if (!m) return null;
  let s = m[0].trim().replace(/ /g, "");
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, "");
  else { s = s.replace(",", "."); if ((s.match(/\./g) ?? []).length > 1) s = s.replace(/\./g, ""); }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
export const unescapeHtml = (s: string) =>
  s.replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e: string) => e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENT[e.toLowerCase()] ?? m);

export const stripAccents = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
export const norm = (s: string | null | undefined) => stripAccents(unescapeHtml(s ?? "")).toLowerCase().replace(/\s+/g, " ").trim();

export function htmlToText(t: string | null | undefined) {
  if (!t) return "";
  return unescapeHtml(t.replace(/<br\s*\/?>|<\/p>|<\/li>|<\/div>|<\/h\d>/gi, "\n").replace(/<li[^>]*>/gi, "- ").replace(/<[^>]+>/g, ""))
    .replace(/[ \t\r]+/g, " ").replace(/\n\s*\n+/g, "\n\n").trim();
}

/** Markdown for the search index: no images, links reduced to their text. */
export const cleanMd = (md: string | null | undefined) =>
  (md ?? "").replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[ \t]+\n/g, "\n").replace(/\n\s*\n+/g, "\n\n").trim();

export function between(s: string, start: string, ends: string[]) {
  const i = s.indexOf(start);
  if (i < 0) return "";
  const rest = s.slice(i + start.length);
  const cut = ends.map((e) => rest.indexOf(e)).filter((x) => x >= 0);
  return cut.length ? rest.slice(0, Math.min(...cut)) : rest;
}

export async function sha1(...parts: unknown[]) {
  const data = new TextEncoder().encode(JSON.stringify(parts));
  return hex(await crypto.subtle.digest("SHA-1", data));
}
export const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");

export function ldJson(raw: string): unknown[] {
  const out: unknown[] = [];
  for (const m of raw.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g)) {
    try { out.push(JSON.parse(m[1])); } catch {
      // some sites put raw newlines inside strings
      try { out.push(JSON.parse(m[1].replace(/[\u0000-\u001f]+/g, " "))); } catch { /* skip */ }
    }
  }
  return out;
}

/** Every object inside a JSON value. */
export function* walk(o: unknown): Generator<Record<string, unknown>> {
  if (Array.isArray(o)) for (const v of o) yield* walk(v);
  else if (o && typeof o === "object") {
    yield o as Record<string, unknown>;
    for (const v of Object.values(o)) yield* walk(v);
  }
}

export function nextData(raw: string): Record<string, unknown> | null {
  const m = raw.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  try { return m ? JSON.parse(m[1]) : null; } catch { return null; }
}

export function olxState(raw: string): Record<string, unknown> | null {
  const m = raw.match(/window\.__PRERENDERED_STATE__\s*=\s*("(?:[^"\\]|\\.)*")/);
  try { return m ? JSON.parse(JSON.parse(m[1])) : null; } catch { return null; }
}

/** Image URLs in markdown, in order, without duplicates, from the domains that match. */
export function mdImages(md: string, domain: RegExp) {
  const out: string[] = [];
  for (const m of md.matchAll(/!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/g)) if (domain.test(m[1]) && !out.includes(m[1])) out.push(m[1]);
  return out;
}

export const uniq = <T,>(a: T[]) => [...new Set(a)];
export const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
export const arr = (v: unknown) => (Array.isArray(v) ? (v as unknown[]) : []);
export const s = (v: unknown) => (typeof v === "string" ? v : v == null ? null : String(v));

export function withParam(url: string, k: string, v: string | null) {
  const u = new URL(url);
  if (v == null) u.searchParams.delete(k); else u.searchParams.set(k, v);
  return u.toString();
}
