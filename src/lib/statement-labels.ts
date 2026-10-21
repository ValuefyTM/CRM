// Labels of the statements (borderouri), shared by server and client code (no server code here).
export type Kind = "payout" | "receivable";
export type Status = "open" | "validated" | "issued";
export type Basis = "delivered" | "collected";
export type Recurrence = "monthly" | "manual";
export type Source = "evaluator" | "verifier" | "inspector" | "referral" | "fixed" | "report" | "manual";

export const KIND_LABEL: Record<Kind, string> = { payout: "Plată colaborator", receivable: "De încasat" };
export const STATUS_LABEL: Record<Status, [string, string]> = { open: ["În curs", "pillInfo"], validated: ["Validat", "pillWarn"], issued: ["Emis", "pillOk"] };
export const BASIS_PICK: [Basis, string, string][] = [
  ["delivered", "Rapoartele predate în lună", "intră raportul în luna în care a fost predat (data raportului)"],
  ["collected", "Rapoartele încasate în lună", "intră raportul în luna în care a fost încasat (bifa „Achitat” / factura încasată)"],
];
export const RECURRENCE_PICK: [Recurrence, string, string][] = [
  ["monthly", "Lunar", "în fiecare lună apare un borderou în curs, de la prima zi a lunii"],
  ["manual", "Doar când îl deschid", "nu apare singur; îl deschizi tu, pe luna pe care o vrei"],
];
export const SOURCE_LABEL: Record<Source, string> = {
  evaluator: "cotă evaluator principal", verifier: "cotă verificator", inspector: "tarif inspecție", referral: "comision recomandare",
  fixed: "sumă fixă lunară", report: "raport", manual: "adăugat manual",
};

export type Rule = {
  id: string; kind: Kind; party: string; user_id: string | null; contract_id: string | null; collaboration_id: string | null;
  recurrence: Recurrence; basis: Basis; inc_evaluator: number; inc_verifier: number; inc_inspector: number;
  referral_pct: number | null; fixed_amount: number | null; fixed_label: string | null; active: number; notes: string | null;
  // joined: who the statement is for
  name: string; sub: string | null;
};
export type Line = {
  id: string | null; key: string | null; source: Source; report_id: string | null; inspection_id: string | null; label: string; detail: string | null;
  on_date: string | null; base: number | null; rate: string | null; auto_amount: number | null; amount: number; removed: number; reason: string | null;
  changed_by: string | null; changed_at: string | null; changed_name?: string | null; sort: number;
  /** the collaborator accepted the adjustment (when) */
  accepted_at?: string | null;
  /** the report's number, for the link */
  number?: string | null;
};
export const totalOf = (lines: Line[]) => Math.round(lines.filter((l) => !l.removed).reduce((s, l) => s + l.amount, 0) * 100) / 100;

/** `splits`: the share (percent) each administrator carries, by user id. */
export type FixedCost = { id: string; label: string; amount: number; from_period: string; to_period: string | null; notes: string | null; splits: Record<string, number> };

/** The columns a statement can be exported with (XLSX): the line's own, then the report's. */
export const EXPORT_FIELDS: { key: string; label: string; group: "Linie" | "Raport" | "Bun" | "Echipă" }[] = [
  { key: "nr", label: "Nr. crt.", group: "Linie" },
  { key: "line", label: "Linie (descriere)", group: "Linie" },
  { key: "source", label: "Tip linie", group: "Linie" },
  { key: "on_date", label: "Data liniei", group: "Linie" },
  { key: "base", label: "Bază de calcul (lei)", group: "Linie" },
  { key: "rate", label: "Cotă", group: "Linie" },
  { key: "auto_amount", label: "Sumă calculată (lei)", group: "Linie" },
  { key: "amount", label: "Sumă pe borderou (lei)", group: "Linie" },
  { key: "adjust", label: "Ajustare (scoasă / modificată / adăugată)", group: "Linie" },
  { key: "reason", label: "Motivul ajustării", group: "Linie" },
  { key: "number", label: "Nr. raport", group: "Raport" },
  { key: "report_date", label: "Data raportului", group: "Raport" },
  { key: "delivered_at", label: "Data predării", group: "Raport" },
  { key: "client", label: "Client", group: "Raport" },
  { key: "client_cui", label: "CUI / CNP client", group: "Raport" },
  { key: "recipient", label: "Utilizator desemnat (bancă)", group: "Raport" },
  { key: "bank_branch", label: "Agenție bancară", group: "Raport" },
  { key: "bank_ref", label: "Nr. comandă bancă", group: "Raport" },
  { key: "contract", label: "Contract", group: "Raport" },
  { key: "purpose", label: "Scop", group: "Raport" },
  { key: "report_type", label: "Tip raport", group: "Raport" },
  { key: "value_type", label: "Tip valoare", group: "Raport" },
  { key: "fee", label: "Onorariu fără TVA (lei)", group: "Raport" },
  { key: "fee_gross", label: "Onorariu cu TVA (lei)", group: "Raport" },
  { key: "collected", label: "Încasat", group: "Raport" },
  { key: "invoice", label: "Factura", group: "Raport" },
  { key: "result_value", label: "Valoare rezultat (lei)", group: "Raport" },
  { key: "result_eur", label: "Valoare rezultat (EUR)", group: "Raport" },
  { key: "prop_type", label: "Tip bun", group: "Bun" },
  { key: "address", label: "Adresă", group: "Bun" },
  { key: "city", label: "Localitate", group: "Bun" },
  { key: "county", label: "Județ", group: "Bun" },
  { key: "cf_number", label: "Nr. CF", group: "Bun" },
  { key: "cad", label: "Nr. cadastral", group: "Bun" },
  { key: "usable_area", label: "Suprafață utilă (mp)", group: "Bun" },
  { key: "land_area", label: "Suprafață teren (mp)", group: "Bun" },
  { key: "evaluator", label: "Evaluator principal", group: "Echipă" },
  { key: "verifier", label: "Verificator", group: "Echipă" },
  { key: "inspector", label: "Inspector", group: "Echipă" },
  { key: "referral", label: "Recomandată de", group: "Echipă" },
];
export const DEFAULT_EXPORT = ["nr", "number", "report_date", "client", "recipient", "prop_type", "address", "fee", "rate", "amount", "adjust", "reason"];
