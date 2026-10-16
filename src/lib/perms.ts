// What each team role may see and do in the CRM (Setări → Permisiuni). The owner always has everything; the
// matrix for the other roles is a setting the owner and administrators change. No server code here: the labels and
// `can` are also used by client components.
//
// Rules that do not depend on the matrix:
// - every team member sees the reports they work on (a team member: evaluator, verifier, inspector, assistant);
//   once a report is finished, only its main evaluator and its verifier still see it ("reports.all" sees every report);
// - the main evaluator of a report sets its status and its team; anyone with "team" can do it on any report they see.

export const PERMS = [
  ["dashboard", "Tablou de bord complet (firmă)", "Fără: doar tabloul personal (rapoartele și inspecțiile lui)."],
  ["reports.all", "Rapoarte – toate", "Fără: doar rapoartele la care este în echipă (cele finalizate doar ca evaluator principal sau verificator)."],
  ["properties", "Proprietăți / comparabile", "Caută proprietățile evaluate ca și comparabile. Raportul se deschide doar dacă îl vede."],
  ["orders", "Comenzi (vezi / procesează)", "Comenzile, cererile de pe site, ofertele."],
  ["clients", "Clienți / contracte", "Clienții, entitățile și contractele."],
  ["inspections.all", "Agenda inspecțiilor (toată echipa)", "Fără: doar inspecțiile lui."],
  ["tenders", "Licitații SEAP", "Anunțurile de licitație. Criteriile de căutare le schimbă cine are „Utilizatori, setări…”."],
  ["listings", "Anunțuri imobiliare", "Anunțurile de pe valuefy.ro și cererile primite."],
  ["fees", "Onorarii și sume", "Onorarii, valori facturate, totaluri. Fără: vede doar cota lui."],
  ["billing", "Facturare", "Facturile și setările de facturare."],
  ["team", "Alocare echipă pe raport", "Pe orice raport pe care îl vede. Evaluatorul principal își alocă oricum echipa."],
  ["delete", "Ștergere comenzi și rapoarte", ""],
  ["admin", "Utilizatori, setări, import, fișe de inspecție", "Și permisiunile de aici."],
] as const;

export type Perm = (typeof PERMS)[number][0];
export const PERM_KEYS = PERMS.map(([k]) => k) as Perm[];

/** Roles the matrix applies to (inspectors use only the inspections app). */
export const PERM_ROLES = [
  ["admin", "Administrator"],
  ["evaluator", "Evaluator"],
  ["operator", "Secretariat"],
] as const;
export type PermRole = (typeof PERM_ROLES)[number][0];
export type Matrix = Record<PermRole, Perm[]>;

export const DEFAULT_MATRIX: Matrix = {
  admin: [...PERM_KEYS],
  evaluator: ["properties", "tenders"],
  operator: ["dashboard", "reports.all", "properties", "orders", "clients", "inspections.all", "tenders", "listings", "team"],
};

/** A saved matrix checked against the known roles and permissions (a role missing from it gets the default). */
export function cleanMatrix(raw: unknown): Matrix {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out = {} as Matrix;
  for (const [r] of PERM_ROLES) {
    const v = src[r];
    out[r] = Array.isArray(v) ? PERM_KEYS.filter((k) => v.includes(k)) : [...DEFAULT_MATRIX[r]];
  }
  return out;
}

export const permsFor = (m: Matrix, role: string): Perm[] => (role === "owner" ? [...PERM_KEYS] : (m[role as PermRole] ?? []));

/** A signed-in CRM user with the permissions of their role (see currentUser). */
export type WithPerms = { role: string; perms?: readonly string[] };
export const can = (u: WithPerms | null | undefined, p: Perm) => !!u && (u.role === "owner" || !!u.perms?.includes(p));
