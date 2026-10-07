// Labels for account kinds, roles and statuses. No server code here: also used by client components.
import type { Kind } from "./site";

export const KIND_LABEL: Record<Kind, string> = { internal: "Intern", partner: "Colaborator", client: "Client" };

export const INTERNAL_ROLES = [
  ["owner", "Proprietar"],
  ["admin", "Administrator"],
  ["evaluator", "Evaluator"],
  ["inspector", "Inspector"],
  ["operator", "Operator"],
] as const;
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

export const roleLabel = (kind: string, role: string) =>
  kind === "internal" ? find(INTERNAL_ROLES, role) ?? role : kind === "partner" ? find(PARTNER_ROLES, role) ?? role : "Client";
export const engagementLabel = (v: string | null) => find(ENGAGEMENTS, v) ?? "—";
export const clientTypeLabel = (v: string | null) => find(CLIENT_TYPES, v) ?? "—";

export const STATUS_LABEL: Record<string, [string, string]> = {
  active: ["Activ", "pillOk"],
  invited: ["Invitat", "pillWarn"],
  disabled: ["Dezactivat", "pillErr"],
};
