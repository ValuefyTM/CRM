// What each team role may see and do in the CRM (Setări → Permisiuni): roles on the rows, modules on the columns.
// For each role × module: on or off (off = not in the menu), the rights (see, add, edit, delete), on which records
// (all, or only the user's own) and the module's special actions. The owner always has everything and only the owner
// changes the matrix. Inside a report, what someone may do follows their role in the report's team (TEAM_*).
// No server code here: the labels and `can` are also used by client components.

export type Right = "A" | "E" | "D";
export const RIGHTS: [Right | "V", string][] = [["V", "Vede"], ["A", "Adaugă"], ["E", "Editează"], ["D", "Șterge"]];

type ModDef = { k: string; l: string; group: string; rights: Right[]; scope?: [string, string]; sp?: [string, string][]; hint?: string };

export const MODULES = [
  { k: "clients", l: "Clienți / Entități", group: "CRM", rights: ["A", "E", "D"], scope: ["Toți", "Adăugați de el"] },
  { k: "partners", l: "Parteneri", group: "CRM", rights: ["A", "E", "D"], hint: "Firmele partenere și conturile lor din portal." },
  { k: "contracts", l: "Contracte", group: "CRM", rights: ["A", "E", "D"], sp: [["sign", "Marchează semnat"]] },
  { k: "orders", l: "Comenzi", group: "CRM", rights: ["A", "E", "D"], scope: ["Toate", "Create de el"],
    sp: [["process", "Procesează comanda"], ["offer", "Trimite oferta"]], hint: "Comenzile, cererile de pe site, ofertele." },
  { k: "tenders", l: "Licitații SEAP", group: "CRM", rights: ["E"], sp: [["rules", "Schimbă criteriile"]] },
  { k: "listings", l: "Anunțuri imobiliare", group: "CRM", rights: ["A", "E", "D"] },
  { k: "reports", l: "Rapoarte", group: "Operațional", rights: ["A", "E", "D"], scope: ["Toate", "Din echipa lui"],
    sp: [["status", "Schimbă statusul"], ["deliver", "Predă raportul"], ["team", "Alocă echipa"]],
    hint: "Pe rapoartele din echipa lui contează și drepturile din echipa raportului (mai jos)." },
  { k: "inspections", l: "Inspecții", group: "Operațional", rights: ["E"], scope: ["Toate", "Alocate lui"], sp: [["assign", "Alocă inspectorul"]] },
  { k: "properties", l: "Proprietăți / comparabile", group: "Operațional", rights: ["E"], hint: "Raportul unei proprietăți se deschide doar dacă îl vede." },
  { k: "fees", l: "Onorarii și sume", group: "Financiar", rights: [], scope: ["Toate sumele", "Doar cota lui"] },
  { k: "billing", l: "Facturare", group: "Financiar", rights: ["A", "E", "D"], sp: [["issue", "Emite factura"]] },
  { k: "statements", l: "Borderouri", group: "Financiar", rights: ["A", "E", "D"], scope: ["Toate", "Doar al lui"] },
  { k: "dashboard", l: "Tablou de bord", group: "Administrare", rights: [], scope: ["Al firmei", "Personal"] },
  { k: "users", l: "Utilizatori", group: "Administrare", rights: ["A", "E", "D"] },
  { k: "settings", l: "Setări firmă", group: "Administrare", rights: ["E"], hint: "Datele firmei, facturare, conexiuni Claude." },
  { k: "templates", l: "Fișe de inspecție", group: "Administrare", rights: ["E"] },
] as const satisfies readonly ModDef[];

export type ModKey = (typeof MODULES)[number]["k"];
type SpOf<M> = M extends { k: infer K extends string; sp: readonly (readonly [infer S extends string, string])[] } ? `${K}:${S}` : never;
/** A permission: a module (sees it), a right on it, "all" records, or a special action. */
export type Perm = ModKey | `${ModKey}.${Right}` | `${ModKey}.all` | SpOf<(typeof MODULES)[number]>;

export type Cell = { on: boolean; r: Right[]; own?: boolean; sp: string[] };
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

const cell = (r: Right[] = [], o: { own?: boolean; sp?: string[] } = {}): Cell => ({ on: true, r, own: o.own, sp: o.sp ?? [] });
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
      tenders: cell(), reports: cell([], { own: true }), inspections: cell(["E"], { own: true }), properties: cell(),
      fees: cell([], { own: true }), dashboard: cell([], { own: true }),
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
    const cellsIn = (r.cells && typeof r.cells === "object" ? r.cells : {}) as Record<string, Partial<Cell>>;
    const cells: Role["cells"] = {};
    for (const m of MODULES) {
      const c = cellsIn[m.k];
      if (!c?.on) continue;
      const sps = "sp" in m ? m.sp.map(([s]) => s as string) : [];
      cells[m.k] = {
        on: true, r: (m.rights as readonly Right[]).filter((x) => c.r?.includes(x)),
        own: "scope" in m ? !!c.own : undefined, sp: sps.filter((s) => c.sp?.includes(s)),
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

/** The flat list of permissions of a role ("orders", "orders.E", "orders.all", "orders:process"…). */
export function permsFor(cfg: PermConfig, role: string): string[] {
  const out: string[] = [];
  for (const m of MODULES) {
    const c: Cell | undefined = role === "owner" ? fullCell(m) : cfg.roles.find((r) => r.id === role)?.cells[m.k];
    if (!c?.on) continue;
    out.push(m.k, ...c.r.map((x) => `${m.k}.${x}`), ...c.sp.map((s) => `${m.k}:${s}`));
    if (!c.own) out.push(`${m.k}.all`);
  }
  return out;
}

/** A signed-in CRM user with the permissions of their role (see currentUser). */
export type WithPerms = { role: string; perms?: readonly string[] };
export const can = (u: WithPerms | null | undefined, p: Perm) => !!u && (u.role === "owner" || !!u.perms?.includes(p));

/** Names of the roles (built-in, renamed or added by the owner), for teamLabel / roleLabel. */
export const roleNames = (cfg: PermConfig) => Object.fromEntries(cfg.roles.map((r) => [r.id, r.name])) as Record<string, string>;

/** Name of a role (built-in or added by the owner). */
export const roleName = (cfg: PermConfig | null | undefined, role: string) =>
  role === "owner" ? "Proprietar" : cfg?.roles.find((r) => r.id === role)?.name ?? (role === "inspector" ? "Inspector" : role);
