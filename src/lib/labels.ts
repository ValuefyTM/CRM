// Labels for account kinds, roles and statuses. No server code here: also used by client components.
import type { Kind } from "./site";

export const KIND_LABEL: Record<Kind, string> = { internal: "Intern", partner: "Colaborator", client: "Client" };

export const INTERNAL_ROLES = [
  ["owner", "Proprietar"],
  ["admin", "Administrator"],
  ["evaluator", "Evaluator"],
  ["operator", "Secretariat"],
] as const;
/** Before Permisiuni v2: work a team member did besides the role (kept for old accounts; not edited any more). Work, whatever their role in the CRM (several can be ticked). */
export const DUTIES = [
  ["evaluator", "Evaluator"],
  ["inspector", "Inspector"],
] as const;
export const dutiesOf = (u: { role: string; duties?: string | null }) =>
  Array.from(new Set([...(u.duties ?? "").split(",").filter(Boolean), ...(u.role === "evaluator" || u.role === "inspector" ? [u.role] : [])]));
export const hasDuty = (u: { role: string; duties?: string | null }, d: "evaluator" | "inspector") => dutiesOf(u).includes(d);

export const PARTNER_ROLES = [
  ["owner", "Administrator cont"],
  ["member", "Membru"],
] as const;
export const ENGAGEMENTS = [
  ["employee", "Intern (angajat)"],
  ["contractor", "Colaborator extern"],
] as const;
export const SPECIALIZATIONS = [
  ["EPI", "Proprietăți imobiliare"],
  ["EBM", "Bunuri mobile"],
  ["EI", "Întreprinderi"],
  ["EIF", "Instrumente financiare"],
] as const;
export const CLIENT_TYPES = [
  ["person", "Persoană fizică"],
  ["company", "Companie"],
] as const;

const find = (list: readonly (readonly [string, string])[], v: string | null | undefined) => list.find(([k]) => k === v)?.[1];

/** Role of a team member; `names` adds the roles the owner created in Setări → Permisiuni. */
export const teamLabel = (u: { role: string }, names?: Record<string, string>) => names?.[u.role] ?? find(INTERNAL_ROLES, u.role) ?? (u.role === "inspector" ? "Inspector" : u.role);

export const roleLabel = (kind: string, role: string, names?: Record<string, string>) =>
  kind === "internal" ? teamLabel({ role }, names) : kind === "partner" ? find(PARTNER_ROLES, role) ?? role : "Client";
export const engagementLabel = (v: string | null) => find(ENGAGEMENTS, v) ?? "—";
export const clientTypeLabel = (v: string | null) => find(CLIENT_TYPES, v) ?? "—";

export const STATUS_LABEL: Record<string, [string, string]> = {
  active: ["Activ", "pillOk"],
  invited: ["Invitat", "pillWarn"],
  disabled: ["Dezactivat", "pillErr"],
};

const KEEP_UPPER = new Set(["SA", "SRL", "SRL-D", "IFN", "PFA", "II", "IF", "SCS", "SNC", "RA", "SC", "BCR", "BRD", "CEC", "ING", "OTP", "UCB", "RO", "ANEVAR", "ONG", "SCA", "SPRL", "IPURL"]);

/** "PISTA RALUCA-ANDREEA" → "Pista Raluca-Andreea", "UNICREDIT BANK SA" → "Unicredit Bank SA". Names written normally stay as they are. */
export function niceName(s: string | null | undefined) {
  if (!s || s !== s.toUpperCase() || !/\p{Lu}{2}/u.test(s)) return s ?? "";
  return s.split(/(\s+)/).map((w) => {
    const bare = w.replace(/[.,()"]/g, "");
    if (KEEP_UPPER.has(bare)) return w;
    return w.toLowerCase().replace(/(^|[-.("'])(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase());
  }).join("");
}
