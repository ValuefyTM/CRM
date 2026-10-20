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
  /** the report's number, for the link */
  number?: string | null;
};
export const totalOf = (lines: Line[]) => Math.round(lines.filter((l) => !l.removed).reduce((s, l) => s + l.amount, 0) * 100) / 100;

/** `splits`: the share (percent) each administrator carries, by user id. */
export type FixedCost = { id: string; label: string; amount: number; from_period: string; to_period: string | null; notes: string | null; splits: Record<string, number> };
