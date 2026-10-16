// The four segments of a report's stage in the list (inspecție · raport · verificare · predare / facturare) and the
// days counter since the order. No server code here.
/** Same rule as stageOf in dossier.ts (kept here so client components can import this file). */
const stageOf = (r: { stage: string | null; delivered_at: string | null; status: string }, insp: { total: number; done: number; none: number }) =>
  r.delivered_at || r.status === "done" ? "delivered" : r.stage === "review" ? "review"
  : r.stage === "drafting" || (insp.total > 0 && insp.done === insp.total) || (insp.total === 0 && insp.none > 0) ? "drafting" : "inspection";

export type SegState = "done" | "now" | "late" | "todo";
export type StageRow = {
  status: string; stage: string | null; delivered_at: string | null; verified_at: string | null; report_date: string | null;
  insp_total: number; insp_done: number; no_insp: number; insp_next: string | null; insp_last: string | null;
  invoiced: number; ordered_at: string | null; received_on: string | null; created_at: string; term_days: number | null;
};
export const SEGMENTS = ["Inspecție", "Raport", "Verificare", "Predare / facturare"];
export const DEFAULT_TERM = 3;

const day = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : null);
const daysBetween = (a: string, b: string) => Math.max(0, Math.round((Date.parse(`${b.slice(0, 10)}T12:00:00Z`) - Date.parse(`${a.slice(0, 10)}T12:00:00Z`)) / 86400000));
const short = (iso: string, time = false) => {
  const d = new Date(iso.length <= 10 ? `${iso}T12:00:00` : iso);
  const s = d.toLocaleDateString("ro-RO", { day: "numeric", month: "short", timeZone: "Europe/Bucharest" }).replace(".", "");
  return time && iso.length > 10 ? `${s}, ${d.toLocaleTimeString("ro-RO", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Bucharest" })}` : s;
};

/** Calendar days since the order (or since the report came in), the term set at processing and whether it is past. */
export function daysOf(r: StageRow, today: string) {
  const start = day(r.ordered_at) ?? day(r.received_on) ?? day(r.created_at)!;
  const delivered = r.delivered_at || r.status === "done";
  const end = delivered ? (day(r.delivered_at) ?? day(r.report_date) ?? today) : today;
  const days = daysBetween(start, end);
  const term = r.term_days && r.term_days > 0 ? r.term_days : DEFAULT_TERM;
  return { days, term, over: Math.max(0, days - term), late: days > term, delivered };
}

/** The four segments and a one-line caption under them. */
export function segmentsOf(r: StageRow, today: string): { seg: SegState[]; caption: string } {
  const st = stageOf(r, { total: r.insp_total, done: r.insp_done, none: r.no_insp });
  const { late } = daysOf(r, today);
  const seg: SegState[] = ["todo", "todo", "todo", "todo"];
  let caption = "";
  const at = (i: number) => { for (let k = 0; k < i; k++) seg[k] = "done"; seg[i] = late ? "late" : "now"; };
  if (st === "inspection") {
    at(0);
    if (r.insp_next) {
      caption = `programată ${short(r.insp_next, true)}`;
      if (r.insp_next < today) seg[0] = "late";
    } else caption = r.insp_total ? "de programat" : "fără inspecție încă";
  } else if (st === "drafting") {
    at(1);
    caption = r.insp_last ? `inspecție ${short(r.insp_last)}` : "în redactare";
  } else if (st === "review") {
    at(2);
    caption = r.verified_at ? `verificat ${short(r.verified_at)}` : "la verificare";
    if (r.verified_at) seg[2] = "done";
  } else {
    seg[0] = seg[1] = seg[2] = "done";
    const when = r.delivered_at ?? r.report_date;
    seg[3] = r.invoiced ? "done" : "now";
    caption = `${when ? `predat ${short(when)}` : "predat"}${r.invoiced ? " și facturat" : " · factura neemisă"}`;
  }
  if (r.status === "cancelled") caption = "anulat";
  return { seg, caption };
}
