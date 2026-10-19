// The kinds of entities (Clienți / Entități). No server code here: the permissions editor uses the list too.
export const CLIENT_KINDS: [string, string][] = [
  ["person", "Persoană fizică"], ["company", "Persoană juridică"], ["broker", "Colaborator / broker"], ["bank", "Bancă"], ["ifn", "IFN"], ["uat", "Instituție publică (UAT)"],
  ["anaf", "ANAF"], ["other", "Altul"],
];
export const kindName = (k: string) => CLIENT_KINDS.find(([v]) => v === k)?.[1] ?? k;
