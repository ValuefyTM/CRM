// The number of rooms of a listing: the site's own field when it has one ("Număr camere", rooms_num…), otherwise the
// title ("Apartament 2 camere", "3 cam.", "garsonieră").
const plain = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const WORDS: Record<string, number> = { o: 1, una: 1, doua: 2, trei: 3, patru: 4, cinci: 5, sase: 6 };

export function roomsOf(features: Record<string, unknown> | null | undefined, title: string | null | undefined): number | null {
  for (const [k, v] of Object.entries(features ?? {})) {
    const key = plain(k);
    if (!/camere|rooms|^nr\.? ?cam/.test(key) || /bai|bath|bucatar|kitchen/.test(key)) continue;
    const t = plain(String(Array.isArray(v) ? v[0] : v ?? ""));
    const n = Number(/\d{1,2}/.exec(t)?.[0]) || ({ one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 } as Record<string, number>)[t] || 0;
    if (n >= 1 && n <= 30) return n;
  }
  const t = plain(title ?? "");
  const m = /(\d{1,2})\s*(?:camere|camera|cam\b|cam\.)/.exec(t);
  if (m && Number(m[1]) >= 1 && Number(m[1]) <= 30) return Number(m[1]);
  const w = /\b(o|una|doua|trei|patru|cinci|sase)\s+camer[ae]\b/.exec(t);
  if (w) return WORDS[w[1]];
  return /\bgarsonier|\bstudio\b/.test(t) ? 1 : null;
}
