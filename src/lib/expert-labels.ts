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

export type Objective = { text: string; done: boolean };
export type Case = {
  id: string; owner_id: string; number: string; court: string | null; section: string | null; panel: string | null; object: string | null; specialty: string | null;
  appointed_on: string | null; property: string | null; objectives: string; stage: number; visit_on: string | null; visit_time: string | null; visit_place: string | null; visit_done: number;
  fee_prov: number | null; fee_paid: number; fee_extra: number | null; fee_final: number | null; fee_cashed: number | null; notes: string | null; created_at: string; updated_at: string;
};
export type Party = { id: string; role: string; name: string; address: string | null; phone: string | null; email: string | null; lawyer: string | null; note: string | null };
export type Term = { id: string; on_date: string; at_time: string | null; kind: string; title: string; note: string | null; done: number; result: string | null };
export type Summon = { id: string; to_name: string; method: string; sent_on: string | null; confirmed_on: string | null; proof: string | null };
export type Folder = { id: string; name: string; preset: number };
export type Doc = { id: string; folder_id: string; filename: string; size_bytes: number; version: number; current: number; created_at: string };

