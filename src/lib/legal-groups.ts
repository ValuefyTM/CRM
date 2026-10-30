// What the findings of the legal check are about (shared by the server and the page): the chain of ownership, the
// agreement between the documents and the errors in them are the real problems; the file's completeness (validity,
// auxiliary documents) is secondary; an encumbrance (a mortgage) is not a problem at all, only something to mention.

export type IssueGroup = "lant" | "concordanta" | "erori" | "dosar" | "sarcini";

export const GROUPS: [IssueGroup, string, string][] = [
  ["lant", "Lanțul de proprietate", "acte lipsă din lanț, transmisiuni neintabulate, proprietari care nu se leagă"],
  ["concordanta", "Concordanța între acte", "carte funciară, cadastral, suprafețe, nume"],
  ["erori", "Greșeli în acte", "CNP-uri, cote, mențiuni din acte"],
  ["dosar", "De completat la dosar", "valabilitate și acte auxiliare"],
];

export const groupOf = (key: string): IssueGroup =>
  /^enc:/.test(key) ? "sarcini"
  : /^(chain|cfchain|unreg|owner:cf|miss:cf|miss:title)/.test(key) ? "lant"
  : /^(cf:no|cf:cad|area:|name:|cfname:)/.test(key) ? "concordanta"
  : /^(cnp:|note:|shares)/.test(key) ? "erori"
  : "dosar";

/** A finding that is a problem of the documents themselves (or a document that could not be read). */
export const isProblem = (i: { key: string; level: string }) =>
  (["lant", "concordanta", "erori"].includes(groupOf(i.key)) && i.level !== "info") || i.key.startsWith("read:");

/** The verdict from the findings still open: problems (chain / agreement / errors, critical), to check, or fine. */
export function verdictOf(issues: { key: string; level: string }[]): "ok" | "incomplete" | "problems" {
  const p = issues.filter(isProblem);
  return p.some((i) => i.level === "critic") ? "problems" : p.length ? "incomplete" : "ok";
}
