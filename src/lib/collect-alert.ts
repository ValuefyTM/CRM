// The alert "inspection done, report not collected" of a framework contract / collaboration (Setări → Facturare).
// No server code here: the settings panel uses the same lists.
export type CollectAlertTo = "evaluator" | "ops" | "both";
export type CollectAlert = { collect_alert_days: number | null; collect_alert_to: CollectAlertTo | null };
export const COLLECT_ALERT_DAYS: [number, string][] = [[0, "Imediat după inspecție"], [1, "La 1 zi după inspecție"], [2, "La 2 zile după"], [3, "La 3 zile după"], [5, "La 5 zile după"]];
export const COLLECT_ALERT_TO: [CollectAlertTo, string][] = [["evaluator", "Evaluatorului"], ["ops", "Operațional (Facturare)"], ["both", "Evaluator + operațional"]];
