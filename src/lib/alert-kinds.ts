// The configurable alerts (Setări → Alerte): the situations the CRM can warn about, who can be told and where.
// No server code here: the settings editor and the server use the same lists.

export type AlertKind =
  | "report_assigned" | "insp_done" | "insp_not_scheduled" | "insp_overdue"
  | "uncollected_after_insp" | "delivered_uncollected" | "to_invoice"
  | "review_waiting" | "overdue" | "order_new" | "docs_missing";

export type AlertRule = {
  id: string; kind: AlertKind;
  /** calendar days after the moment of the situation (0 = at once) */
  days: number;
  /** who: roles in the report (evaluator, verifier, inspector, team), modules (ops, orders), admins, all, or "u:<user id>" */
  to: string[];
  /** which work: [] = all; "k:<framework contract id>", "c:<collaboration id>", "direct" (no framework contract, no collaboration) */
  scope: string[];
  /** also a card on the dashboard (not only the bell and the phone) */
  dashboard: boolean;
  /** also sent by email */
  email?: boolean;
  enabled: boolean;
  /** an own title instead of the situation's */
  title?: string;
  /** a lasting situation: told again every this many hours while it lasts (0 / none = once) */
  every?: number;
};

export type KindInfo = {
  label: string; hint: string;
  /** what "days" count from */
  from: string;
  group: "Inspecții" | "Rapoarte" | "Bani" | "Comenzi";
  tone: "err" | "warn" | "info";
  /** the alert stays until the situation ends (else it is a one-time event) */
  lasting: boolean;
  /** the roles that make sense for it */
  roles: string[];
};

export const ALERT_KINDS: Record<AlertKind, KindInfo> = {
  report_assigned: { label: "Raport alocat", hint: "cineva a fost pus în echipa unui raport", from: "de la alocare", group: "Rapoarte", tone: "info", lasting: false, roles: ["assigned", "evaluator", "team", "ops", "admins", "all"] },
  insp_done: { label: "Inspecție realizată", hint: "fișa a fost finalizată de inspector", from: "de la finalizarea inspecției", group: "Inspecții", tone: "info", lasting: false, roles: ["evaluator", "verifier", "team", "ops", "admins", "all"] },
  insp_not_scheduled: { label: "Inspecție alocată, neprogramată", hint: "inspectorul nu a programat vizita", from: "de la alocare", group: "Inspecții", tone: "warn", lasting: true, roles: ["inspector", "evaluator", "team", "admins", "all"] },
  insp_overdue: { label: "Inspecție programată, nerealizată", hint: "data programată a trecut fără fișă", from: "de la data programată", group: "Inspecții", tone: "err", lasting: true, roles: ["inspector", "evaluator", "team", "admins", "all"] },
  uncollected_after_insp: { label: "Inspecție făcută, raport neîncasat", hint: "plata nu e bifată „Achitat” după inspecție", from: "de la prima inspecție realizată", group: "Bani", tone: "warn", lasting: true, roles: ["evaluator", "team", "ops", "admins", "all"] },
  delivered_uncollected: { label: "Raport predat, neîncasat", hint: "predat, dar fără bifa „Achitat”", from: "de la predare", group: "Bani", tone: "err", lasting: true, roles: ["evaluator", "team", "ops", "admins", "all"] },
  to_invoice: { label: "Raport de facturat", hint: "predat pe contract facturat per raport, fără factură", from: "de la predare", group: "Bani", tone: "warn", lasting: true, roles: ["evaluator", "ops", "admins", "all"] },
  review_waiting: { label: "Raport la verificare", hint: "așteaptă verificatorul", from: "de la trimiterea la verificare", group: "Rapoarte", tone: "warn", lasting: true, roles: ["verifier", "evaluator", "team", "admins", "all"] },
  overdue: { label: "Raport nepredat la termen", hint: "termenul de predare a trecut", from: "de la ziua următoare termenului", group: "Rapoarte", tone: "err", lasting: true, roles: ["evaluator", "verifier", "team", "ops", "admins", "all"] },
  docs_missing: { label: "Documente lipsă", hint: "un act cerut (marcat lipsă) nu a fost încă încărcat", from: "de la marcarea ca lipsă", group: "Rapoarte", tone: "err", lasting: true, roles: ["evaluator", "team", "ops", "orders", "admins", "all"] },
  order_new: { label: "Comandă neprocesată", hint: "nimeni nu a deschis comanda", from: "de la primirea comenzii", group: "Comenzi", tone: "warn", lasting: true, roles: ["orders", "admins", "all"] },
};

export const ALERT_TO: [string, string, string][] = [
  ["assigned", "Persoana alocată", "cel pus în echipă"],
  ["evaluator", "Evaluatorul principal", "al raportului"],
  ["verifier", "Verificatorul", "al raportului"],
  ["inspector", "Inspectorul", "al inspecției"],
  ["team", "Toată echipa raportului", "evaluator, verificator, inspector, asistent"],
  ["ops", "Operațional (Facturare)", "cine are acces la modulul Facturare"],
  ["orders", "Cine procesează comenzile", "cine are acces la modulul Comenzi"],
  ["admins", "Proprietar și administratori", ""],
  ["all", "Toată lumea", "toți utilizatorii interni"],
];

export const DAY_CHOICES: [number, string][] = [[0, "imediat"], [1, "după 1 zi"], [2, "după 2 zile"], [3, "după 3 zile"], [5, "după 5 zile"], [7, "după 7 zile"], [14, "după 14 zile"], [30, "după 30 de zile"]];

/** How often a lasting alert is told again while the situation lasts (hours; 0 = once). */
export const EVERY_CHOICES: [number, string][] = [[0, "o singură dată"], [1, "la fiecare oră"], [2, "la 2 ore"], [4, "la 4 ore"], [8, "la 8 ore"], [12, "la 12 ore"], [24, "o dată pe zi"], [48, "la 2 zile"], [72, "la 3 zile"], [168, "o dată pe săptămână"]];

/** The rules of a firm that set none yet. */
export const DEFAULT_RULES: AlertRule[] = [
  { id: "r-assigned", kind: "report_assigned", days: 0, to: ["assigned"], scope: [], dashboard: false, enabled: true },
  { id: "r-insp-done", kind: "insp_done", days: 0, to: ["team", "admins"], scope: [], dashboard: false, enabled: true },
];

export const newRuleId = () => `r-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
