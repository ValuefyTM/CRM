// The kinds of documents attached to an asset of a report, and the kind guessed from a file's name. No server code:
// also used by the drop zone of the forms. "cf" and "rlv" are the ones the inspector takes to the visit.
export const DOC_KINDS: [kind: string, label: string][] = [
  ["proprietate", "Act de proprietate"], ["cf", "Extras CF"], ["rlv", "Releveu"], ["energetic", "Certificat energetic"],
  ["amplasament", "Plan de amplasament"], ["other", "Alte acte"],
];
export const DOC_KIND_KEYS = DOC_KINDS.map(([k]) => k);
export const docKindLabel = (k: string | null | undefined) => DOC_KINDS.find(([x]) => x === k)?.[1] ?? "Alte acte";

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[_\-.]+/g, " ");
const word = (n: string, w: string) => new RegExp(`(^|[^a-z0-9])${w}([^a-z0-9]|$)`).test(n);

/** "Extras CF 412309.pdf" → cf, "contract vanzare-cumparare.pdf" → proprietate, "CPE ap 8.pdf" → energetic… */
export function guessDocKind(filename: string): string {
  const n = fold(filename.replace(/\.\w{2,5}$/, ""));
  if (/certificat( de)? performan|energetic|(^|\s)cpe(\s|$)/.test(n)) return "energetic";
  if (/plan( de)? (amplasament|situatie|incadrare)|amplasament|pad(\s|$)|plan incadrare/.test(n)) return "amplasament";
  if (word(n, "cf") || /extras|carte( a)? funciar|cf\d|^cf/.test(n)) return "cf";
  if (word(n, "rlv") || /releve|schit|plan (apartament|etaj|parter|casa|locuinta)|cadastr/.test(n)) return "rlv";
  if (/contract|vanzare|cumparare|act(e)? (de )?proprietate|titlu|certificat de mostenitor|mostenire|donatie|partaj|autentificat|notarial|proces verbal de receptie|autorizatie de construire|hotarare/.test(n)) return "proprietate";
  return "other";
}
