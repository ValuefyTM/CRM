// What each team role may see and do in the CRM (Setări → Permisiuni): roles on the rows, modules on the columns.
// For each role × module: on or off (off = not in the menu), the rights (see, add, edit, delete), on which records
// (all; only the user's own; or only where the user is main evaluator / verifier of the report) and the module's
// special actions. The owner always has everything and only the owner
// changes the matrix. Inside a report, what someone may do follows their role in the report's team (TEAM_*).
// No server code here: the labels and `can` are also used by client components.

import { CLIENT_KINDS } from "./client-kinds";

export type Right = "A" | "E" | "D";
export const RIGHTS: [Right | "V", string][] = [["V", "Vede"], ["A", "Adaugă"], ["E", "Editează"], ["D", "Șterge"]];

/** On which records a role works in a module: all, the user's own (created / team / assigned), or where the user is
 * main evaluator or verifier of the report they belong to (managers who answer only for their reports). */
export type Scope = "all" | "own" | "lead";
type ModDef = { k: string; l: string; group: string; rights: Right[]; scope?: readonly (readonly [Scope, string])[]; sp?: [string, string][]; hint?: string;
  /** the special actions (and the scope) can be given without the module itself (no menu entry) */
  offSp?: true;
  /** the role can be limited to some kinds of entities (Clienți: only clients and collaborators, say) */
  kinds?: true };
const LEAD = ["lead", "Unde e evaluator / verificator"] as const;

export const MODULES = [
  { k: "clients", l: "Clienți / Entități", group: "CRM", rights: ["A", "E", "D"], scope: [["all", "Toți"], ["own", "Adăugați de el"], LEAD], kinds: true,
    hint: "„Ce tipuri”: lasă toate bifele goale pentru toate tipurile, sau bifează doar ce vede rolul (de exemplu clienții și colaboratorii, nu băncile)." },
  { k: "partners", l: "Parteneri", group: "CRM", rights: ["A", "E", "D"], hint: "Firmele partenere și conturile lor din portal." },
  { k: "contracts", l: "Contracte", group: "CRM", rights: ["A", "E", "D"], scope: [["all", "Toate"], LEAD], sp: [["sign", "Marchează semnat"]] },
  { k: "orders", l: "Comenzi", group: "CRM", rights: ["A", "E", "D"], scope: [["all", "Toate"], ["own", "Create de el"], LEAD],
    sp: [["process", "Procesează comanda"], ["offer", "Trimite oferta"]], hint: "Comenzile, cererile de pe site, ofertele." },
  { k: "tenders", l: "Licitații SEAP", group: "CRM", rights: ["E"], sp: [["rules", "Schimbă criteriile"]] },
  { k: "listings", l: "Anunțuri imobiliare", group: "CRM", rights: ["A", "E", "D"] },
  { k: "reports", l: "Rapoarte", group: "Operațional", rights: ["A", "E", "D"], scope: [["all", "Toate"], ["own", "Din echipa lui"], LEAD],
    sp: [["status", "Schimbă statusul"], ["deliver", "Predă raportul"], ["team", "Alocă echipa"]],
    hint: "„Din echipa lui”: drepturile din echipa raportului (mai jos). „Unde e evaluator / verificator”: drepturile de aici, pe rapoartele unde e evaluator principal sau verificator; rapoartele unde e doar inspector nu le vede (are inspecțiile, în Inspecții)." },
  { k: "inspections", l: "Inspecții", group: "Operațional", rights: ["E"], scope: [["all", "Toate"], ["own", "Alocate lui"], ["lead", "Alocate lui și din rapoartele unde e evaluator / verificator"]], sp: [["assign", "Alocă inspectorul"]] },
  { k: "properties", l: "Proprietăți", group: "Operațional", rights: ["E"], scope: [["all", "Toate"], ["own", "Din echipa lui"], LEAD],
    hint: "Proprietățile evaluate în rapoartele pe care le vede (din echipa lui) sau pe care le conduce / verifică; comparabilele se caută tot printre ele. Raportul unei proprietăți se deschide doar dacă îl vede." },
  { k: "fees", l: "Onorarii și sume", group: "Financiar", rights: [], scope: [["all", "Toate sumele"], ["own", "Doar cota lui"], ["lead", "Toate sumele unde e evaluator / verificator"]] },
  { k: "billing", l: "Facturare", group: "Financiar", rights: ["A", "E", "D"], scope: [["all", "Toate"], ["own", "Doar ale lui"]], sp: [["issue", "Emite factura"]], offSp: true,
    hint: "„Doar ale lui”: rapoartele de facturat unde e evaluator principal și facturile emise de el (evaluatorii care își fac singuri facturile). „Emite factura” merge și fără modulul din meniu: atunci lista „De facturat” apare pe tabloul de bord, pe scopul ales." },
  { k: "statements", l: "Borderouri", group: "Financiar", rights: ["A", "E", "D"], scope: [["all", "Toate"], ["own", "Doar al lui"]] },
  { k: "dashboard", l: "Tablou de bord", group: "Administrare", rights: [], scope: [["all", "Al firmei"], ["own", "Personal"]] },
  { k: "users", l: "Utilizatori", group: "Administrare", rights: ["A", "E", "D"] },
  { k: "settings", l: "Setări firmă", group: "Administrare", rights: ["E"], hint: "Datele firmei, facturare, conexiuni Claude." },
  { k: "templates", l: "Fișe de inspecție", group: "Administrare", rights: ["E"] },
] as const satisfies readonly ModDef[];

export type ModKey = (typeof MODULES)[number]["k"];
type SpOf<M> = M extends { k: infer K extends string; sp: readonly (readonly [infer S extends string, string])[] } ? `${K}:${S}` : never;
/** A permission: a module (sees it), a right on it, "all" or "lead" records, or a special action.
 * "orders.contract": the orders of the framework contracts the user is accredited on (agreeri, see accreditations.ts). */
export type Perm = ModKey | `${ModKey}.${Right}` | `${ModKey}.all` | `${ModKey}.lead` | SpOf<(typeof MODULES)[number]> | "orders.contract";

export type Cell = { on: boolean; r: Right[]; scope?: Scope; sp: string[];
  /** Clienți: only these kinds of entities (empty / missing = all) */
  kinds?: string[] };
export type Role = { id: string; name: string; cells: Partial<Record<ModKey, Cell>> };

// ---------- the report team ----------

export const TEAM_ROLES = [
  ["evaluator", "Evaluator principal"],
  ["verifier", "Verificator"],
  ["assistant", "Evaluator membru / asistent"],
  ["inspector", "Inspector"],
] as const;
export type TeamRole = (typeof TEAM_ROLES)[number][0];
export const TEAM_RIGHTS = [
  ["view", "Vede în lucru"], ["viewDone", "Vede după finalizare"], ["edit", "Editează datele"], ["assets", "Bunuri"],
  ["docs", "Încarcă documente"], ["docsDelete", "Șterge documente"], ["schedule", "Programează inspecția"], ["members", "Adaugă / scoate membri"],
  ["status", "Schimbă status și etapa"], ["verify", "Verificare: finalizează / întoarce"], ["deliver", "Predă raportul"], ["messages", "Mesaje"],
] as const;
export type TeamRight = (typeof TEAM_RIGHTS)[number][0];
export type FeeView = "all" | "share" | "none";
export const FEE_VIEWS: [FeeView, string][] = [["all", "Tot"], ["share", "Doar cota lui"], ["none", "Nu vede"]];
export type TeamRow = { r: TeamRight[]; fee: FeeView };
export type TeamMatrix = Record<TeamRole, TeamRow>;

export type PermConfig = { roles: Role[]; team: TeamMatrix };

// ---------- defaults ----------

const cell = (r: Right[] = [], o: { scope?: Scope; sp?: string[] } = {}): Cell => ({ on: true, r, scope: o.scope, sp: o.sp ?? [] });
const fullCell = (m: (typeof MODULES)[number]): Cell => ({ on: true, r: [...m.rights], sp: "sp" in m ? m.sp.map(([s]) => s) : [] });

export const DEFAULT_CONFIG: PermConfig = {
  roles: [
    { id: "admin", name: "Administrator", cells: Object.fromEntries(MODULES.map((m) => [m.k, fullCell(m)])) },
    { id: "operator", name: "Secretariat", cells: {
      clients: cell(["A", "E"]), partners: cell(["A", "E"]), contracts: cell(["A", "E"], { sp: ["sign"] }),
      orders: cell(["A", "E"], { sp: ["process", "offer"] }), tenders: cell(), listings: cell(["A", "E"]),
      reports: cell(["A", "E"], { sp: ["team"] }), inspections: cell(["E"], { sp: ["assign"] }), properties: cell(),
      dashboard: cell(), settings: cell(),
    } },
    { id: "evaluator", name: "Evaluator", cells: {
      tenders: cell(), reports: cell([], { scope: "own" }), inspections: cell(["E"], { scope: "own" }), properties: cell(),
      fees: cell([], { scope: "own" }), dashboard: cell([], { scope: "own" }),
    } },
  ],
  team: {
    evaluator: { r: ["view", "viewDone", "edit", "assets", "docs", "docsDelete", "schedule", "members", "status", "deliver", "messages"], fee: "share" },
    verifier: { r: ["view", "viewDone", "verify", "messages"], fee: "share" },
    assistant: { r: ["view", "edit", "assets", "docs", "schedule", "messages"], fee: "none" },
    inspector: { r: ["view", "docs", "schedule", "messages"], fee: "share" },
  },
};

/** Roles nobody can delete (they exist in every firm). */
export const BUILTIN_ROLES = ["admin", "operator", "evaluator"];

// ---------- checks ----------

/** A saved configuration checked against the known modules and rights (missing parts get the defaults). */
export function cleanConfig(raw: unknown): PermConfig {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const rolesIn = Array.isArray(src.roles) ? (src.roles as Record<string, unknown>[]) : [];
  const roles: Role[] = [];
  const seen = new Set<string>();
  for (const r of rolesIn.length ? rolesIn : DEFAULT_CONFIG.roles) {
    const id = String(r?.id ?? "").replace(/[^\w-]/g, "").slice(0, 40);
    const name = String(r?.name ?? "").trim().slice(0, 60);
    if (!id || !name || id === "owner" || seen.has(id)) continue;
    seen.add(id);
    const cellsIn = (r.cells && typeof r.cells === "object" ? r.cells : {}) as Record<string, Partial<Cell> & { own?: boolean }>;
    const cells: Role["cells"] = {};
    for (const m of MODULES) {
      const c = cellsIn[m.k];
      const sps = "sp" in m ? m.sp.map(([s]) => s as string) : [];
      // A module off with a special action kept (billing: "Emite factura" without the menu entry).
      const offSp = !!c && !c.on && "offSp" in m && sps.some((s) => c.sp?.includes(s));
      if (!c?.on && !offSp) continue;
      cells[m.k] = {
        on: !!c.on, r: c.on ? (m.rights as readonly Right[]).filter((x) => c.r?.includes(x)) : [],
        // Saved before "lead" existed: own = true.
        scope: "scope" in m ? (m.scope.some(([v]) => v === (c.scope ?? (c.own ? "own" : "all"))) ? (c.scope ?? (c.own ? "own" : "all")) : "all") : undefined,
        sp: sps.filter((s) => c.sp?.includes(s)),
        ...("kinds" in m && Array.isArray(c.kinds) && c.kinds.length ? { kinds: CLIENT_KINDS.map(([k]) => k).filter((k) => c.kinds!.includes(k)) } : {}),
      };
    }
    roles.push({ id, name, cells });
  }
  for (const d of DEFAULT_CONFIG.roles) if (!seen.has(d.id)) roles.push(structuredClone(d));
  const teamIn = (src.team && typeof src.team === "object" ? src.team : {}) as Record<string, Partial<TeamRow>>;
  const team = {} as TeamMatrix;
  for (const [t] of TEAM_ROLES) {
    const row = teamIn[t];
    team[t] = row
      ? { r: TEAM_RIGHTS.map(([k]) => k).filter((k) => row.r?.includes(k)), fee: FEE_VIEWS.some(([f]) => f === row.fee) ? row.fee! : "none" }
      : structuredClone(DEFAULT_CONFIG.team[t]);
  }
  return { roles, team };
}

/** The flat list of permissions of a role ("orders", "orders.E", "orders.all" / "orders.lead", "orders:process"…). */
export function permsFor(cfg: PermConfig, role: string): string[] {
  const out: string[] = [];
  for (const m of MODULES) {
    const c: Cell | undefined = role === "owner" ? fullCell(m) : cfg.roles.find((r) => r.id === role)?.cells[m.k];
    if (!c) continue;
    // Module off, special actions kept (billing's "Emite factura"): the actions and the scope, not the module.
    if (!c.on) { if (!c.sp.length) continue; }
    else out.push(m.k, ...c.r.map((x) => `${m.k}.${x}`));
    out.push(...c.sp.map((s) => `${m.k}:${s}`));
    const scope = c.scope ?? "all";
    if (scope === "all") out.push(`${m.k}.all`);
    if (scope === "lead") out.push(`${m.k}.lead`);
    // only some kinds of entities: "clients.kind:person"… (none = all kinds)
    if ("kinds" in m && c.kinds?.length) out.push(...c.kinds.map((k) => `${m.k}.kind:${k}`));
  }
  return out;
}

/** The kinds of entities the user may see in Clienți (null = all; the owner sees all). */
export function clientKindsOf(u: WithPerms | null | undefined): string[] | null {
  if (!u || u.role === "owner") return null;
  const kinds = (u.perms ?? []).filter((p) => p.startsWith("clients.kind:")).map((p) => p.slice("clients.kind:".length));
  return kinds.length ? kinds : null;
}

/** A signed-in CRM user with the permissions of their role (see currentUser). */
export type WithPerms = { role: string; perms?: readonly string[] };
export const can = (u: WithPerms | null | undefined, p: Perm) => !!u && (u.role === "owner" || !!u.perms?.includes(p));

/** Names of the roles (built-in, renamed or added by the owner), for teamLabel / roleLabel. */
export const roleNames = (cfg: PermConfig) => Object.fromEntries(cfg.roles.map((r) => [r.id, r.name])) as Record<string, string>;

/** Name of a role (built-in or added by the owner). */
export const roleName = (cfg: PermConfig | null | undefined, role: string) =>
  role === "owner" ? "Proprietar" : cfg?.roles.find((r) => r.id === role)?.name ?? (role === "inspector" ? "Inspector" : role);

/** On which records the user works in a module (owner: all). */
export const scopeOf = (u: WithPerms | null | undefined, m: ModKey): Scope =>
  !u ? "own" : u.role === "owner" || u.perms?.includes(`${m}.all`) ? "all" : u.perms?.includes(`${m}.lead`) ? "lead" : "own";

/** SQL (binds the user id once): the report `col` has the user as main evaluator or verifier. */
export const leadSql = (col: string) =>
  `EXISTS (SELECT 1 FROM report_members lm WHERE lm.report_id = ${col} AND lm.user_id = ? AND lm.role IN ('evaluator', 'verifier'))`;
