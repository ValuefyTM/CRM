// Expertize judiciare: the lists and shapes shared by the server and the pages (no server code here).

export const STAGES = ["Numire", "Onorariu consemnat", "Convocare", "Constatare la fața locului", "Raport depus", "Obiecțiuni", "Finalizat"] as const;
export const DONE_STAGE = 6;
export const TERM_KINDS: [string, string][] = [["judecata", "Termen de judecată"], ["depunere", "Limită depunere raport"], ["obiectiuni", "Limită răspuns la obiecțiuni"],
  ["onorariu", "Consemnare onorariu"], ["constatare", "Constatare la fața locului"], ["eveniment", "Alt eveniment"]];
export const SUMMON_METHODS = ["Scrisoare recomandată cu confirmare de primire", "E-mail", "Telefon", "Personal, sub semnătură", "Prin avocat"];
export const PARTY_ROLES = ["Reclamant", "Pârât", "Intervenient", "Chemat în garanție", "Avocat", "Expert consilier", "Altă parte"];
export const PRESET_FOLDERS = ["Încheiere de numire", "Acte din dosar", "Convocări și confirmări", "Proces-verbal constatare", "Raport de expertiză", "Răspuns la obiecțiuni", "Onorariu și decont"];
/** The report is filed at least this many days before the hearing (the reminder line added with a hearing). */
export const FILE_BEFORE_DAYS = 10;
/** Days before an open term when its expert is told (bell, phone, email). */
export const REMIND_DAYS = [7, 3, 1, 0];
export const MAX_FILE = 40 * 1024 * 1024;
export const stagePill = (stage: number) => (stage === DONE_STAGE ? "pillOk" : stage === 5 ? "pillErr" : stage >= 2 ? "pillWarn" : "");

/** `by`: who asked for it — the court („instanța”) or a party. */
export type Objective = { text: string; done: boolean; by?: string };
export type Case = {
  id: string; owner_id: string; number: string; court: string | null; section: string | null; panel: string | null; object: string | null; specialty: string | null;
  appointed_on: string | null; property: string | null; objectives: string; stage: number; visit_on: string | null; visit_time: string | null; visit_place: string | null; visit_done: number;
  fee_prov: number | null; fee_paid: number; fee_extra: number | null; fee_final: number | null; fee_cashed: number | null; notes: string | null; created_at: string; updated_at: string;
  /** the portal (portal.just.ro): watched or not, the last check, what was new and whether the expert has looked */
  monitor?: number; portal_at?: string | null; portal_error?: string | null; portal_stage?: string | null; portal_changed_at?: string | null; portal_change?: string | null; portal_ack_at?: string | null;
};
export type Party = { id: string; role: string; name: string; address: string | null; phone: string | null; email: string | null; lawyer: string | null; note: string | null };
export type Term = { id: string; on_date: string; at_time: string | null; kind: string; title: string; note: string | null; done: number; result: string | null;
  source?: string; panel?: string | null; solution?: string | null; summary?: string | null; doc?: string | null; doc_no?: string | null; doc_date?: string | null };
export type Summon = { id: string; to_name: string; method: string; sent_on: string | null; confirmed_on: string | null; proof: string | null };
export type Folder = { id: string; name: string; preset: number };
export type Doc = { id: string; folder_id: string; filename: string; size_bytes: number; version: number; current: number; created_at: string };

/** The expert's own alert settings (set in the module, by each expert for themself). */
export type ExpertPrefs = {
  /** days before an open term when they are told (0 = on the day) */
  remind: number[];
  /** told once more after a term has passed without being closed */
  overdue: boolean;
  /** told when the portal has something new on a monitored case */
  portal: boolean;
  /** also by email (the bell and the phone always) */
  email: boolean;
  /** new cases are monitored on the portal unless unticked */
  monitor_new: boolean;
  /** the report is filed this many days before the hearing (the limit added with a hearing) */
  file_before: number;
};
export const REMIND_CHOICES = [30, 14, 10, 7, 5, 3, 2, 1, 0];
export const DEFAULT_PREFS: ExpertPrefs = { remind: [...REMIND_DAYS], overdue: true, portal: true, email: true, monitor_new: true, file_before: FILE_BEFORE_DAYS };
export function cleanPrefs(v: Partial<ExpertPrefs> | null | undefined): ExpertPrefs {
  const D = DEFAULT_PREFS, x = v ?? {};
  const remind = Array.isArray(x.remind) ? [...new Set(x.remind.map(Number).filter((n) => REMIND_CHOICES.includes(n)))].sort((a, b) => b - a) : D.remind;
  const fb = Math.round(Number(x.file_before));
  return { remind, overdue: x.overdue ?? D.overdue, portal: x.portal ?? D.portal, email: x.email ?? D.email, monitor_new: x.monitor_new ?? D.monitor_new, file_before: Number.isFinite(fb) && fb >= 0 && fb <= 60 ? fb : D.file_before };
}
