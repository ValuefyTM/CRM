// Glide export (CSV files) → rows for the CRM tables, plus a list of anomalies to review.
// Pure TypeScript with no server or browser APIs: it runs in the browser on the import page,
// so personal data never leaves the owner's computer until they confirm the import.
//
// Ids are derived from the Glide ids ("g-<table>-<glide id>"), so running the import again
// updates the same rows instead of creating duplicates. References to users and partner firms
// use the same "g-usr-" / "g-prt-" ids and are resolved on the server (people may already exist).

export type Row = Record<string, string | number | null>;
export type Anomaly = { table: string; id: string; issue: string; detail: string };
export type ImportPlan = { tables: { name: TableName; rows: Row[] }[]; anomalies: Anomaly[]; sources: Record<string, number> };

/** Insert order: every table only references tables before it. */
export const TABLES = [
  "partners", "users", "entities", "contracts", "collaborations", "statements", "orders",
  "reports", "report_members", "crm_properties", "assets", "inspections", "inspection_sheets", "notes",
] as const;
export type TableName = (typeof TABLES)[number];

export const TABLE_LABEL: Record<TableName, string> = {
  partners: "Firme partenere", users: "Utilizatori (echipă și colaboratori)", entities: "Clienți, bănci, firme",
  contracts: "Contracte", collaborations: "Contracte de colaborare", statements: "Borderouri", orders: "Comenzi",
  reports: "Rapoarte", report_members: "Echipa rapoartelor", crm_properties: "Proprietăți", assets: "Bunuri evaluate",
  inspections: "Inspecții", inspection_sheets: "Fișe de inspecție", notes: "Notițe",
};

// ---------- CSV ----------

export function parseCsv(text: string): Record<string, string>[] {
  const s = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field); field = "";
      rows.push(row); row = [];
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [head, ...body] = rows.filter((r) => r.some((v) => v !== ""));
  if (!head) return [];
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), r[i] ?? ""])));
}

// ---------- value cleaning ----------

const t = (v: string | undefined) => {
  const x = (v ?? "").replace(/\s+/g, " ").trim();
  return x === "" ? null : x;
};
/** Romanian cedilla letters (ş ţ) → comma-below (ș ț). */
const ro = (v: string | null) => (v ? v.replace(/ş/g, "ș").replace(/Ş/g, "Ș").replace(/ţ/g, "ț").replace(/Ţ/g, "Ț") : v);
const lower = (v: string | null) => (v ? v.toLowerCase() : v);

export function num(v: string | undefined): number | null {
  let x = (v ?? "").replace(/\s/g, "");
  if (!x) return null;
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(x)) x = x.replace(/\./g, "").replace(",", ".");
  else x = x.replace(",", ".");
  const n = Number(x);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}
const pos = (v: string | undefined) => {
  const n = num(v);
  return n && n > 1 ? n : null; // Glide uses 0 / 1 as "no value"
};

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number, hh = 0, mm = 0, ss = 0) => {
  if (y < 100) y += 2000;
  if (y === 1899) return null; // Glide's "empty date" (30.12.1899)
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1990 || y > 2100) return null;
  return hh || mm || ss ? `${y}-${pad(m)}-${pad(d)}T${pad(hh)}:${pad(mm)}:${pad(ss)}` : `${y}-${pad(m)}-${pad(d)}`;
};

/** Every date format found in the export: 10.08.2021[, 12:00:00] · 44412 (Excel) · 8/5/2021 11:51 · 11/17/21 · ISO. */
export function date(v: string | undefined): string | null {
  const x = (v ?? "").trim();
  if (!x) return null;
  let m = x.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:,?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) return iso(+m[3], +m[2], +m[1], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0));
  m = x.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) return iso(+m[3], +m[1], +m[2], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0));
  m = x.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) return iso(+m[1], +m[2], +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0));
  if (/^\d{5}(\.\d+)?$/.test(x)) {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(x)) * 864e5);
    return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  return null;
}
const day = (v: string | undefined) => date(v)?.slice(0, 10) ?? null;
/** ISO timestamp for created_at columns (a date alone becomes midday, so the calendar day never shifts). */
const stamp = (v: string | undefined) => {
  const d = date(v);
  return d ? (d.length === 10 ? `${d}T12:00:00.000Z` : `${d}.000Z`) : null;
};

const key = (v: string | null) => (v ?? "").toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Z0-9]/g, "");
const slug = (v: string) => key(v).toLowerCase().slice(0, 40) || "x";
const digits = (v: string | null) => (v ?? "").replace(/\D/g, "");
const bool = (v: string | undefined) => (/^(true|da)$/i.test((v ?? "").trim()) ? 1 : /^(false|nu)$/i.test((v ?? "").trim()) ? 0 : null);
const url = (v: string | undefined) => {
  const x = t(v);
  return x && /^https?:\/\//.test(x) ? x : null;
};

// ---------- nomenclatures ----------

const pick = (map: Record<string, string>, v: string | null) => (v ? map[key(v)] ?? null : null);

const STREET: Record<string, string> = {
  STRADA: "Strada", STR: "Strada", CALEA: "Calea", CALE: "Calea", BULEVARDUL: "Bulevardul", BD: "Bulevardul", BULEVARD: "Bulevardul",
  ALEEA: "Aleea", ALEE: "Aleea", INTR: "Intrarea", INTRAREA: "Intrarea", PIATA: "Piața", PTA: "Piața", SPLAIUL: "Splaiul", SPLAI: "Splaiul",
};
const COUNTY: Record<string, string> = {
  TIMIS: "Timiș", CLUJ: "Cluj", ARAD: "Arad", CARASSEVERIN: "Caraș-Severin", BUCURESTI: "București", BIHOR: "Bihor", HUNEDOARA: "Hunedoara",
};
const REPORT_TYPE: Record<string, string> = {
  RAPORTDEEVALUARE: "Raport de evaluare", NOTADEEVALUARE: "Notă de evaluare", NOTADEINSPECTIE: "Notă de inspecție",
  NOTADEOPINIE: "Notă de opinie", NOTADEINFORMARE: "Notă de informare", INSPECTIESIEVALUARE: "Raport de evaluare",
};
const PURPOSE: Record<string, string> = {
  GARANTAREBANCARA: "Garantare bancară", IMPOZITARE: "Impozitare", INFORMARE: "Informare", ESALONAREDATORII: "Eșalonare datorii",
  RAPORTAREFINANCIARA: "Raportare financiară", INSOLVENTA: "Insolvență", LICHIDARE: "Lichidare",
};
const VALUE_TYPE: Record<string, string> = {
  VALOAREDEPIATA: "Valoare de piață", VALOAREADEPIATA: "Valoare de piață", VALOAEDEPIATA: "Valoare de piață", VALOAREDEPAITA: "Valoare de piață",
  VALOAREJUSTA: "Valoare justă", CHIRIADEPIATA: "Chiria de piață", VALOAREIMPOZABILA: "Valoare impozabilă", VALOAREDEIMPOZITARE: "Valoare de impozitare",
};
const STATUS: Record<string, string> = {
  FINALIZATA: "done", ANULATA: "cancelled", DRAFT: "draft", INCURS: "in_progress", SUSPENDATA: "suspended",
  INPROCESARE: "received", ACCEPTATA: "done",
};
const INSPECTION: Record<string, string> = { FINALIZATA: "done", PROGRAMATA: "scheduled", INCURSDEPROGRAMARE: "to_schedule", ANULATA: "cancelled" };
const CONTACT: Record<string, string> = { CLIENTUL: "client", PROPRIETAR: "owner", AGENTIMOBILIAR: "agent", OTHER: "other", ALTCINEVA: "other", ALTAPERSOANA: "other" };
const ENTITY_KIND: Record<string, string> = { BANCA: "bank", IFN: "ifn", UAT: "uat", ANAF: "anaf", BROKER: "broker", DOARCLIENTUL: "other", PF: "person", PJ: "company" };
const APPROACH: Record<string, string> = { PIATA: "market", VENIT: "income", COST: "cost" };
const PROPERTY_KIND: Record<string, string> = {
  APARTAMENTINBLOC: "apartment", APARTAMENTINCASA: "apartment", CASACUTEREN: "house", ANSAMBLUREZIDENTIAL: "other",
  TERENINTRAVILANCONSTRUCTII: "land", TERENINTRAVILANARABIL: "land", TERENEXTRAVILAN: "land",
};
const NOTE_STATUS: Record<string, string> = { FINALIZATA: "done", TODO: "todo", INCURS: "in_progress" };
const evalTypes = (v: string | null) => {
  const list = (v ?? "").toUpperCase().split(/[,\s]+/).filter((x) => ["EPI", "EBM", "EI", "EIF"].includes(x));
  return list.length ? [...new Set(list)].join(",") : null;
};

// ---------- the transform ----------

/** `files`: CSV text by file name, as found in the Glide export zip. */
export function transform(files: Record<string, string>): ImportPlan {
  const byName: Record<string, Record<string, string>[]> = {};
  const sources: Record<string, number> = {};
  for (const [name, text] of Object.entries(files)) {
    const base = name.split("/").pop()!.replace(/\.csv$/i, "").replace(/\s*\(\d+\)$/, "").trim().toUpperCase();
    byName[base] = parseCsv(text);
    sources[base] = byName[base].length;
  }
  const T = (n: string) => byName[n] ?? [];
  const anomalies: Anomaly[] = [];
  const flag = (table: string, id: string, issue: string, detail = "") => anomalies.push({ table, id, issue, detail });
  const out: Record<TableName, Row[]> = Object.fromEntries(TABLES.map((n) => [n, []])) as unknown as Record<TableName, Row[]>;

  // --- team ---
  const VALUEFY_CUI = "38250411";
  const assoc = new Map(T("VFY_ASOCIERI USERI").filter((a) => t(a["ID COMPANIE"]) === VALUEFY_CUI).map((a) => [t(a["ID USER"])!, a]));
  const users = new Set<string>();
  for (const u of T("VFY_USERS")) {
    const gid = t(u["ID USER"]);
    if (!gid) continue;
    const a = assoc.get(gid) ?? {};
    const email = lower(t(u["Email notificari"]) ?? t(u["Email"]));
    if (!email) { flag("users", gid, "Utilizator fără email", t(u["Name"]) ?? ""); continue; }
    const role = bool(a["ROL/IS OWNER"]) ? "owner" : bool(a["ROL/IS ADMIN"]) || /TRUE/i.test(u["IS ADMIN"] ?? "") ? "admin" : bool(a["ROL/EVALUATOR"]) || bool(u["Evaluator"]) ? "evaluator" : "operator";
    users.add(gid);
    out.users.push({
      id: `g-usr-${gid}`, glide_id: gid, kind: "internal", email, name: t(u["Name"]) ?? "", phone: t(u["Telefon"]), role,
      engagement: /colaborator/i.test(a["FUNCTIE IN COMPANIE"] ?? "") ? "contractor" : "employee",
      anevar_no: t(u["LEGITIMATIE EVALUATOR"]), specializations: evalTypes(t(u["SPECIALIZARI"])),
      coverage: ro(t((a["JUDETE ACOPERITE"] ?? "").replace(/,+\s*$/, "").replace(/,/g, ", "))),
      share_evaluator: num(a["PROCENT EVALUATOR"]), share_verifier: num(a["PROCENT VERIFICATOR"]),
    });
  }
  const userRef = (gid: string | null, table: string, id: string, what: string) => {
    if (!gid) return null;
    if (users.has(gid)) return `g-usr-${gid}`;
    flag(table, id, `${what} necunoscut`, gid);
    return null;
  };

  // --- partner firms and their people (VFY_PARTENERI) ---
  const firmOf = new Map<string, string>();
  const partnerUsers = new Set<string>();
  const partnerEmails = new Set<string>();
  for (const p of T("VFY_PARTENERI")) {
    const gid = t(p["ID PARTENER"])!;
    const company = t(p["COMPANIA"]);
    const fn = (p["FUNCTIE"] ?? "").toUpperCase();
    if (company && key(company) === "VALUEFY") { flag("users", gid, "Contact VALUEFY sărit (e din echipă)", t(p["NUME PRENUME"]) ?? ""); continue; }
    const firmName = company ?? t(p["NUME PRENUME"]) ?? "Partener";
    const fid = `g-prt-${slug(firmName)}`;
    if (!out.partners.some((f) => f.id === fid))
      out.partners.push({ id: fid, glide_id: `firm:${slug(firmName)}`, name: firmName, kind: /BANK|BANCA|ADVISOR/.test(fn) || /BANK|UCB/i.test(firmName) ? "bank" : fn.includes("BROKER") ? "broker" : "other", status: "active" });
    const email = lower(t(p["ADRESA EMAIL"]));
    if (!email || partnerEmails.has(email)) { flag("users", gid, email ? "Email de colaborator duplicat" : "Colaborator fără email", t(p["NUME PRENUME"]) ?? ""); continue; }
    partnerEmails.add(email);
    partnerUsers.add(gid);
    firmOf.set(gid, fid);
    out.users.push({ id: `g-usr-${gid}`, glide_id: gid, kind: "partner", email, name: t(p["NUME PRENUME"]) ?? "", phone: t(p["NR TELEFON"]), role: "member", partner_id: fid });
  }

  // --- entities: valuation firms, banks & co., clients ---
  const entities = new Set<string>();
  const addEntity = (r: Row) => { entities.add(r.id as string); out.entities.push(r); };
  for (const c of T("VFY_COMPANII EVALUARE")) {
    const cui = digits(t(c["CUI COMPANIE"]));
    addEntity({ id: `g-ent-f-${cui}`, glide_id: `firm:${cui}`, kind: "valuation_firm", name: t(c["DENUMIRE COMPANIE"]) ?? cui, cui, anevar_auth: t(c["AUTORIZATIE ANEVAR"]), email: lower(t(c["EMAIL OFFICE"])), logo_url: url(c["LOGO COMPANIE"]) });
  }
  const firmEntity = (cui: string | null) => {
    const d = digits(cui);
    return d && entities.has(`g-ent-f-${d}`) ? `g-ent-f-${d}` : null;
  };
  const banks: { id: string; name: string; code: string | null }[] = [];
  for (const b of T("VFY_BANCI")) {
    const gid = t(b["ID BANCA"])!;
    const kind = pick(ENTITY_KIND, t(b["CATEGORIE"])) ?? "other";
    const name = t(b["DENUMIRE"]) ?? gid;
    addEntity({
      id: `g-ent-b-${gid}`, glide_id: `bank:${gid}`, kind, name, code: t(b["COD COMPANIE"]),
      approved: /^DA$/i.test(b["AGREERE"] ?? "") ? 1 : /^NU$/i.test(b["AGREERE"] ?? "") ? 0 : null,
      partner_visible: bool(b["ACTIV PENTRU COALBORATORI"]), logo_url: url(b["LOGO SQR"]) ?? url(b["LOGO"]),
    });
    banks.push({ id: `g-ent-b-${gid}`, name, code: t(b["COD COMPANIE"]) });
  }
  const bankRef = (gid: string | null) => (gid && entities.has(`g-ent-b-${gid}`) ? `g-ent-b-${gid}` : null);
  /** A bank listed among the clients (framework contracts) is the same bank as in VFY_BANCI. */
  const matchBank = (name: string) => {
    const k = key(name);
    return banks.find((b) => key(b.name) === k) ?? banks.find((b) => {
      const words = (s: string) => s.toUpperCase().split(/[^A-Z]+/).filter((w) => w.length > 2 && !["BANK", "BANCA", "ROMANIA", "SA", "GROUPE"].includes(w));
      const a = words(name), bb = words(b.name);
      return a.some((w) => bb.includes(w)) || (b.code && a.includes(b.code.toUpperCase()));
    });
  };

  const clientAlias = new Map<string, string>(); // Glide client id → entity id (duplicates merged)
  const seen = new Map<string, string>();
  const sameName = new Map<string, string[]>();
  for (const c of T("VFY_CLIENTI")) {
    const gid = t(c["ID CLIENT"])!;
    const name = t(c["DENUMIRE CLIENT"]) ?? "";
    const tip = pick(ENTITY_KIND, t(c["TIP CLIENT"]));
    if (tip === "bank") {
      const b = matchBank(name);
      if (b) { clientAlias.set(gid, b.id); continue; }
    }
    const phone = digits(t(c["TELEFON CLIENT"])).slice(-9);
    const dupKey = phone.length === 9 ? `${key(name)}|${phone}` : null;
    if (dupKey && seen.has(dupKey)) {
      clientAlias.set(gid, seen.get(dupKey)!);
      flag("entities", gid, "Client duplicat unit automat (același nume și telefon)", name);
      continue;
    }
    const id = `g-ent-c-${gid}`;
    if (dupKey) seen.set(dupKey, id);
    clientAlias.set(gid, id);
    sameName.set(key(name), [...(sameName.get(key(name)) ?? []), gid]);
    const kind = tip ?? "person";
    if (!tip) flag("entities", gid, "Tip client lipsă (importat ca persoană fizică)", name);
    let cui: string | null = null;
    const rawCui = t(c["CUI"]);
    if (kind === "company" && rawCui) {
      if (/E\+/i.test(rawCui)) flag("entities", gid, "CUI stricat de Excel (nu a fost importat)", `${name}: ${rawCui}`);
      else cui = rawCui.replace(/\s/g, "").toUpperCase();
    }
    addEntity({
      id, glide_id: `client:${gid}`, kind, name, cui, reg_no: kind === "company" ? t(c["NR DE INREGISTRARE"]) : null,
      billing_address: t(c["ADRESA DE FACTURARE"]), phone: t(c["TELEFON CLIENT"]), email: lower(t(c["EMAIL"])),
      created_at: stamp(c["TIMESTAMP"]) ?? stamp(c["RAPOARTE/LAST REPORT"]),
    });
  }
  for (const [, ids] of sameName) if (ids.length > 1) flag("entities", ids.join(", "), "Posibil duplicat (același nume, telefon diferit)", "de verificat manual");
  const client = (gid: string | null, table: string, id: string) => {
    if (!gid) return null;
    const e = clientAlias.get(gid);
    if (!e) flag(table, id, "Client necunoscut", gid);
    return e ?? null;
  };

  // --- contracts, collaborations, statements ---
  const contracts = new Map<string, Record<string, string>>();
  for (const c of T("VFY_CONTRACTE")) {
    const gid = t(c["ID CONTRACT"])!;
    contracts.set(gid, c);
    const services = t(c["TIP SERVICII"]);
    out.contracts.push({
      id: `g-ctr-${gid}`, glide_id: gid, kind: /CADRU/i.test(c["TIP CONTRACT"] ?? "") ? "framework" : "classic",
      number: t(c["NR CONTRACT"]), signed_on: day(c["DATA CONTRACT"]), client_id: client(t(c["ID CLIENT"]), "contracts", gid),
      currency: t(c["MONEDA CONTRACT"]) ?? "RON", fee: num(c["TARIF CONTRACT"]),
      services: services ? services.replace(/SERBICII/i, "SERVICII") : null, valuation_types: evalTypes(t(c["TIP EVALUARE"])),
      report_type: pick(REPORT_TYPE, t(c["TIP RAPORT"])), purpose: pick(PURPOSE, t(c["SCOPUL EVALUARII"])),
      created_at: stamp(c["DATA CONTRACT"]),
    });
  }
  const contractRef = (gid: string | null, table: string, id: string) => {
    if (!gid) return null;
    if (contracts.has(gid)) return `g-ctr-${gid}`;
    flag(table, id, "Contract inexistent", gid);
    return null;
  };
  /** Bank of a framework contract (the contract's client). */
  const contractBank = (gid: string | null) => {
    const c = gid ? contracts.get(gid) : null;
    if (!c) return null;
    const e = clientAlias.get(t(c["ID CLIENT"]) ?? "");
    if (e?.startsWith("g-ent-b-")) return e;
    // Framework contracts whose bank was entered as an ordinary company client.
    return /CADRU/i.test(c["TIP CONTRACT"] ?? "") ? matchBank(t(c["DENUMIRE CLIENT"]) ?? "")?.id ?? null : null;
  };

  const collabs = new Set<string>();
  for (const c of T("VFY_COLABORARI")) {
    const gid = t(c["ID CONTRACT"])!;
    const firm = firmEntity(c["CUI BENEFICIAR"]);
    if (!firm) { flag("collaborations", gid, "Firma colaboratoare nu există", t(c["NUME BENEFICIAR"]) ?? ""); continue; }
    collabs.add(gid);
    out.collaborations.push({ id: `g-col-${gid}`, glide_id: gid, firm_id: firm, number: t(c["NR CONTRACT"]), signed_on: day(c["DATA SEMNARII"]), share: num(c["PROCENT"]) });
  }
  const statements = new Set<string>();
  for (const s of T("VFY_BORDEROURI")) {
    const gid = t(s["ID BORDEROU"])!;
    statements.add(gid);
    out.statements.push({ id: `g-brd-${gid}`, glide_id: gid, contract_id: contractRef(t(s["ID CONTRACT"]), "statements", gid), number: t(s["NR BORDEROU"]), issued_on: day(s["DATA BORDEROU"]), total: num(s["TOTAL FACTURAT"]) });
  }

  // Report status by order (collaboration orders have no status of their own), and report dates for orders without one.
  const reportStatusByOrder = new Map<string, string>();
  const reportDateByOrder = new Map<string, string>();
  for (const r of T("VFY_RAPOARTE")) {
    const s = pick(STATUS, t(r["STATUS LABEL"]));
    if (s && t(r["ID COMANDA COLABORATOR"])) reportStatusByOrder.set(t(r["ID COMANDA COLABORATOR"])!, s);
    const d = r["DATA INTRARII"] && date(r["DATA INTRARII"]) ? r["DATA INTRARII"] : r["DATA RAPORT"];
    for (const k of [t(r["COMANDA/ID COMANDA CADRU"]), t(r["ID COMANDA COLABORATOR"])]) if (k && date(d)) reportDateByOrder.set(k, d);
  }
  /** Order date, else the date the report came in; orders with neither are dated 2021-01-01 and listed for review. */
  const orderDates = (raw: string | undefined, gid: string, ref: string | null) => {
    const own = date(raw) ? raw : reportDateByOrder.get(gid);
    if (!own) flag("orders", gid, "Comandă fără dată (pusă pe 01.01.2021)", ref ?? "");
    if (own && !date(raw)) flag("orders", gid, "Comandă fără dată (folosită data raportului)", ref ?? "");
    const created = own ? stamp(own) : "2021-01-01T12:00:00.000Z";
    return { ordered_on: own ? day(own) : null, created_at: created, viewed_at: created };
  };
  const bankName = (id: string | null) => (id ? banks.find((b) => b.id === id)?.code ?? banks.find((b) => b.id === id)?.name ?? null : null);

  // --- orders ---
  const orders = new Set<string>();
  const usedSeq = new Set<number>();
  for (const o of T("VFY_COMENZI PARTENERI")) {
    const gid = t(o["ID COMANDA"])!;
    const id = `g-ord-p-${gid}`;
    const by = t(o["ID PARTENER"]);
    const seq = num(o["NR COMANDA"]);
    const bank = bankRef(t(o["UNITATEA BANCARA"]));
    orders.add(id);
    const ok = seq && seq < 1000 && !usedSeq.has(seq);
    if (ok) usedSeq.add(seq);
    out.orders.push({
      id, glide_id: `p:${gid}`, seq: ok ? seq : null, source: "partner",
      created_by: by && partnerUsers.has(by) ? `g-usr-${by}` : null, partner_id: by ? firmOf.get(by) ?? null : null,
      property_type: pick(PROPERTY_KIND, t(o["TIPUL PROPRIETATII"])) ?? "other", address: t(o["Adresa Imobil"]),
      purpose: "Credit bancar", bank: bankName(bank), bank_id: bank, bank_branch: t(o["AGENTIA"]),
      client_id: client(t(o["CLIENT ID"]), "orders", gid), client_name: t(o["NUME CLIENT"]), client_phone: t(o["NUMAR DE TELEFON"]), client_email: lower(t(o["ADRESA EMAIL"])),
      contact_name: t(o["NUME CONTACT"]), contact_phone: t(o["TELEFON CONTACT"]),
      status: pick(STATUS, t(o["STATUS"])) ?? "received", ...orderDates(o["DATA COMENZII"], gid, t(o["NR COMANDA"])),
    });
  }
  for (const o of T("VFY_COMENZI_CONTRACTE CADRU")) {
    const gid = t(o["ID COMANDA"])!;
    if (!/\d/.test(o["DATA COMENZII"] ?? "")) { flag("orders", gid, "Rând gol în export (sărit)", t(o["NR COMANDA"]) ?? ""); continue; }
    const id = `g-ord-c-${gid}`;
    const ctr = t(o["ID CONTRACT CADRU"]);
    const isFramework = ctr && /CADRU/i.test(contracts.get(ctr)?.["TIP CONTRACT"] ?? "");
    if (ctr && !isFramework) flag("orders", gid, "Comandă de bancă legată de un contract care nu e cadru", `${t(o["NR COMANDA"])} → ${ctr}`);
    const bank = contractBank(ctr);
    const brd = t(o["ID BORDEROU"]);
    if (brd && !statements.has(brd)) flag("orders", gid, "Borderou inexistent", brd);
    orders.add(id);
    out.orders.push({
      id, glide_id: `c:${gid}`, source: "bank", contract_id: contractRef(ctr, "orders", gid), bank_id: bank, bank: bankName(bank),
      bank_ref: t(o["NR COMANDA"]), bank_branch: t(o["AGENTIA BANCARA"]), report_type: pick(REPORT_TYPE, t(o["TIP RAPORT"])), fee: num(o["TARIF"]),
      client_id: client(t(o["BENEFICIARUL/ID CLIENT"]), "orders", gid), client_name: t(o["BENEFICIARUL/NUME"]), purpose: "Garantare bancară",
      status: pick(STATUS, t(o["STATUS EVALUARE"])) ?? "received", statement_id: brd && statements.has(brd) ? `g-brd-${brd}` : null,
      ...orderDates(o["DATA COMENZII"], gid, t(o["NR COMANDA"])),
    });
  }
  for (const o of T("VFY_COMENZI_COLABORARI")) {
    const gid = t(o["ID COMANDA"])!;
    const id = `g-ord-k-${gid}`;
    const col = t(o["ID CONTRACT COLABORARE"]);
    const bank = bankRef(t(o["BANCA/ID BANCA"]));
    const ref = t(o["REFERAL ID"]);
    orders.add(id);
    out.orders.push({
      id, glide_id: `k:${gid}`, source: "collab", collaboration_id: col && collabs.has(col) ? `g-col-${col}` : null,
      bank_id: bank, bank: bankName(bank), bank_branch: t(o["AGENTIA BANCARA"]), report_type: pick(REPORT_TYPE, t(o["TIP RAPORT"])),
      fee: num(o["TARIF"]), share: num(o["PROCENT"]), fee_net: num(o["TARIF NET"]), purpose: "Garantare bancară",
      client_id: client(t(o["BENEFICIARUL/ID CLIENT"]), "orders", gid), client_name: t(o["CLIENTUL/DENUMIRE CLIENT"]),
      referral_order_id: ref ? `g-ord-p-${ref}` : null, status: reportStatusByOrder.get(gid) ?? "received",
      ...orderDates(o["DATA COMENZII"], gid, null),
    });
  }

  // --- reports and their team ---
  const reports = new Set<string>();
  const members = new Set<string>();
  const reportNumbers = new Map<string, string>();
  for (const r of T("VFY_RAPOARTE")) {
    const gid = t(r["ID RAPORT"])!;
    const id = `g-rap-${gid}`;
    reports.add(id);
    const issuer = firmEntity(r["EMITENT/ID EMITENT"]);
    const nr = t(r["NR RAPORT"]);
    const nrKey = `${issuer}|${nr}`;
    if (nr && reportNumbers.has(nrKey)) flag("reports", gid, "Număr de raport folosit de două ori", `${nr} (și la ${reportNumbers.get(nrKey)})`);
    else if (nr) reportNumbers.set(nrKey, gid);
    const cadru = t(r["COMANDA/ID COMANDA CADRU"]);
    const colab = t(r["ID COMANDA COLABORATOR"]);
    const orderId = cadru && orders.has(`g-ord-c-${cadru}`) ? `g-ord-c-${cadru}` : colab && orders.has(`g-ord-k-${colab}`) ? `g-ord-k-${colab}` : null;
    if ((cadru || colab) && !orderId) flag("reports", gid, "Comanda raportului nu există", cadru ?? colab ?? "");
    const tipRaport = t(r["TIP RAPORT"]);
    const rt = pick(REPORT_TYPE, tipRaport);
    if (tipRaport && !rt) flag("reports", gid, "Tip raport necunoscut", tipRaport);
    const vt = t(r["TIP VALOARE"]);
    if (vt && !pick(VALUE_TYPE, vt)) flag("reports", gid, "Tip valoare necunoscut", vt);
    const ref = t(r["REFERRAL"]);
    out.reports.push({
      id, glide_id: gid, number: nr, label: t(r["LABEL RAPORT"]), issuer_id: issuer,
      contract_id: contractRef(t(r["CONTRACTUL/ID CONTRACT"]), "reports", gid), order_id: orderId,
      client_id: client(t(r["CLIENTUL/ID CLIENT"]), "reports", gid), recipient_id: bankRef(t(r["UTILIZATORUL/ID UTILIZATOR"])),
      bank_branch: t(r["UTILIZATORUL/AGENTIA"]), report_type: rt, valuation_types: evalTypes(t(r["TIP EVALUARE"])),
      purpose: pick(PURPOSE, t(r["SCOPUL EVALUARII"])), value_type: pick(VALUE_TYPE, vt),
      valuation_date: day(r["DATA EVALUARII"]), report_date: day(r["DATA RAPORT"]), received_on: day(r["DATA INTRARII"]), uploaded_on: day(r["DATA INCARCARII"]),
      result_value: pos(r["REZULTAT EVALUARE"]), fee: num(r["TARIF RAPORT"]), collab_fee: num(r["TARIF COLABORATOR"]),
      status: pick(STATUS, t(r["STATUS LABEL"])) ?? pick(STATUS, t(r["STATUS EVALUARE"])) ?? "draft", suspend_reason: t(r["MOTIV SUSPENDARE"]),
      reporting_year: num(r["ANUL RAPORTARII"]), referral_user_id: ref && partnerUsers.has(ref) ? `g-usr-${ref}` : null,
      market_analysis: t(r["ANALIZA DE PIATA/OUTPUT"]),
      created_at: stamp(r["TIMESTAMP"]) ?? stamp(r["DATA INTRARII"]) ?? stamp(r["DATA RAPORT"]),
    });
    for (const [col, role] of [["ID INSPECTOR", "inspector"], ["EVALUATOR/ID EVALUATOR", "evaluator"], ["VERIFICATORUL/ID VERIFICATOR", "verifier"], ["ASISTENTUL/ID ASISTENT", "assistant"]] as const) {
      const u = userRef(t(r[col]), "reports", gid, `${role === "inspector" ? "Inspector" : role === "evaluator" ? "Evaluator" : role === "verifier" ? "Verificator" : "Asistent"}`);
      if (u && !members.has(`${id}|${u}|${role}`)) {
        members.add(`${id}|${u}|${role}`);
        out.report_members.push({ report_id: id, user_id: u, role });
      }
    }
  }

  // --- properties, assets, inspections ---
  const propertyByCf = new Map<string, string>();
  const assets = new Set<string>();
  let orphanAssets = 0;
  for (const b of T("VFY_BUNURI")) {
    const gid = t(b["ID BUN"])!;
    const city = ro(t(b["LOCALITATE"]));
    const cf = t(b["NR CARTE FUNCIARA"]);
    const cfKey = cf && digits(cf).length >= 4 ? `${key(cf)}|${key(city)}` : null;
    let pid = cfKey ? propertyByCf.get(cfKey) : undefined;
    if (!pid) {
      pid = `g-prp-${gid}`;
      if (cfKey) propertyByCf.set(cfKey, pid);
      const type = t(b["TIP BUN"]);
      const year = num(b["ANUL CONSTRUIRII"]);
      out.crm_properties.push({
        id: pid, glide_id: `bun:${gid}`, category: t(b["CATEGORIE BUN"]), type: type === "FERME AGRICOLE" ? "FERMA AGRICOLA" : type,
        construction: /CONSTRUCTIE/i.test(b["PROPRIETATE"] ?? "") ? "under_construction" : "existing",
        county: pick(COUNTY, t(b["JUDET"])) ?? ro(t(b["JUDET"])), city, street_type: pick(STREET, t(b["TIP ARTERA"])),
        street: t(b["NUME STRADA"]), number: t(b["NUMAR"]), block: t(b["BLOC"]), stair: t(b["SCARA"]), floor: t(b["ETAJUL"]), apartment: t(b["APARTAMENT"]),
        zone: lower(t(b["TIP ZONA"])), full_address: ro(t(b["ADRESA COMPLETA"]) ?? t(b["Adresa Completa"])), geo: t(b["GEOLOCATIE"]),
        cf_number: cf, cad_building: t(b["NR CAD CONSTRUCTIE"]), cad_land: t(b["NR CAD TEREN"]), usable_area: pos(b["SUPRAFATA UTILA"]),
        year_built: year && year > 1800 && year < 2100 ? year : null, description: t(b["Descriere imobil"]), image_url: url(b["IMAGINE BUN"]),
        cf_file: t(b["CF"]), plan_file: t(b["RLV"]),
      });
    }
    const rid = t(b["ID RAPORT"]);
    const report = rid && reports.has(`g-rap-${rid}`) ? `g-rap-${rid}` : null;
    if (!report) orphanAssets++;
    const aid = `g-ast-${gid}`;
    assets.add(aid);
    const principal = (b["BUN PRINCIPAL"] ?? "").trim().toLowerCase();
    out.assets.push({
      id: aid, glide_id: gid, report_id: report, property_id: pid, is_main: principal === "true" || principal === "" ? 1 : 0,
      value: pos(b["REZULTAT EVALUARE/VALOARE DE PIATA"]), approach: pick(APPROACH, t(b["REZULTAT EVALUARE/ABORDARE APLICATA"])),
    });
    const st = pick(INSPECTION, t(b["STATUS INSPECTIE"])) ?? "to_schedule";
    const rawDone = t(b["DATA INSPECTIEI"]);
    const done = date(rawDone ?? "");
    if (rawDone && !done) flag("inspections", gid, "Dată inspecție necitibilă", rawDone);
    out.inspections.push({
      id: `g-ins-${gid}`, glide_id: gid, asset_id: aid, report_id: report,
      inspector_id: userRef(t(b["INSPECTORUL/INSPECTOR ID"]) ?? t(b["ID INSPECTOR"]), "inspections", gid, "Inspector"),
      status: st, scheduled_at: date(b["DATA PROGRAMARE"]), done_at: st === "done" ? done : null,
      contact_kind: pick(CONTACT, t(b["CONTACT INSPECTIE"])), contact_name: t(b["NUME CONTACT INSPECTIE"]) ?? t(b["NUME CONTACT"]),
      contact_phone: t(b["TELEFON CONTACT INSPECTIE"]) ?? t(b["TELEFON CONTACT"]),
    });
  }
  if (orphanAssets) flag("assets", "—", "Bunuri fără raport în export (importate fără raport)", `${orphanAssets} bunuri`);
  const reportsWithAssets = new Set(out.assets.map((a) => a.report_id));
  const noAssets = [...reports].filter((r) => !reportsWithAssets.has(r)).length;
  if (noAssets) flag("reports", "—", "Rapoarte fără niciun bun", `${noAssets} rapoarte`);

  for (const f of T("VFY_FISE INSPECTII")) {
    const gid = t(f["🔒 Row ID"]) ?? t(f["ID FISA"])!;
    const bun = t(f["ID BUN"]);
    const aid = bun && assets.has(`g-ast-${bun}`) ? `g-ast-${bun}` : null;
    if (!aid) flag("inspection_sheets", gid, "Fișă fără bun", bun ?? "");
    out.inspection_sheets.push({
      id: `g-fis-${gid}`, glide_id: gid, inspection_id: aid ? `g-ins-${bun}` : null, asset_id: aid,
      inspector_id: userRef(t(f["INSPECTIE/ID INSPECTOR"]), "inspection_sheets", gid, "Inspector"),
      done_at: date(f["INSPECTIE/DATA INSPECTIEI"]), present_person: t(f["INSPECTIE/PERSOANA PREZENTA LA INSPECTIE"]),
      signature_url: url(f["INSPECTIE/SEMNATURA"]), location: t(f["INSPECTIE/LOCALIZAREA"]), photo_url: url(f["FOTOGRAFIE EXTERIOARA"]),
      description: t(f["Descriere imobil"]),
    });
  }

  for (const n of T("VFY_NOTITE PERSONALE")) {
    const gid = t(n["🔒 Row ID"])!;
    const u = userRef(t(n["USER ID"]), "notes", gid, "Utilizator");
    if (!u) continue;
    out.notes.push({
      id: `g-not-${gid}`, glide_id: gid, user_id: u, title: t(n["DENUMIRE TASK"]) ?? "Notiță", description: t(n["DESCRIERE TASK"]),
      status: pick(NOTE_STATUS, t(n["STATUS"])) ?? "todo", deadline: day(n["DEADLINE"]), created_at: stamp(n["DATA ADAUGARII"]),
    });
  }

  // created_at must never be empty (NOT NULL with a default): drop nulls so the default applies.
  for (const rows of Object.values(out)) for (const r of rows) for (const k of ["created_at", "viewed_at"]) if (r[k] === null) delete r[k];

  return { tables: TABLES.map((name) => ({ name, rows: out[name] })), anomalies, sources };
}

/** Anomalies as CSV (Excel-friendly: BOM + semicolons), to download from the import page. */
export function anomaliesCsv(list: Anomaly[]) {
  const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
  return "﻿" + ["Tabel;ID Glide;Problemă;Detalii", ...list.map((a) => [a.table, a.id, a.issue, a.detail].map(q).join(";"))].join("\r\n");
}
