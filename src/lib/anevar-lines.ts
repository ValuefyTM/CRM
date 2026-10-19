// The rows of Anexa 4 (the ANEVAR yearly activity report): shared by the server and the browser.
export const SPECS: [number, string, string][] = [
  [1, "EPI", "Evaluarea proprietăților imobiliare"],
  [2, "EI", "Evaluarea întreprinderii și activelor necorporale"],
  [3, "EBM", "Evaluarea bunurilor mobile"],
  [4, "EIF", "Evaluarea instrumentelor financiare"],
  [5, "VE", "Verificarea evaluării"],
];
export const LINES: [number, string][] = [
  [7, "Evaluare pentru raportare financiară"],
  [8, "Evaluare pentru garantarea împrumuturilor"],
  [9, "Evaluare pentru instanțe judecătorești"],
  [10, "Evaluare de întreprinderi pentru fuziuni, achiziții, delistare"],
  [11, "Evaluare pentru impozitare"],
  [12, "Evaluare pentru stabilirea despăgubirilor în caz de expropriere"],
  [13, "Evaluare în proceduri de insolvență sau faliment"],
  [14, "Evaluare pentru autorități publice (vânzări, concesionări, schimburi etc.)"],
  [15, "Evaluare pentru garantarea și reeșalonarea datoriilor către stat"],
  [16, "Verificare de evaluări"],
  [17, "Alte tipuri de lucrări"],
];
export const LINE_LABEL = Object.fromEntries(LINES) as Record<number, string>;
export const SPEC_LABEL = Object.fromEntries(SPECS.map(([n, , l]) => [n, l])) as Record<number, string>;
export const SPEC_CODE = Object.fromEntries(SPECS.map(([n, c]) => [n, c])) as Record<number, string>;

