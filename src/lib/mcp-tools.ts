// Server-only: the actions Claude can use through the MCP connector — read-only (one exception: noting an offer),
// at most 50 rows per answer.
// Each one reuses the CRM's own queries where they exist, and returns compact JSON with links to the CRM pages.
import type { User } from "./users";
import { isAdmin } from "./users";
import { globalSearch } from "./search";
import { getOrder, orderDocuments, missingDocs } from "./orders";
import { orderCode, orderStatus, propertyLabel, SOURCE_LABEL } from "./order-labels";
import { getReport, listReports, reportAssets, reportTeam, REPORT_STATUS, type ReportFilters } from "./reports";
import { inspectionBoard } from "./inspections-board";
import { getClient, clientContacts, kindName } from "./clients";
import { nearby, AREA } from "./comparables";
import { parseGeo } from "./registry";
import { invoicesFor } from "./billing";
import { dashboard } from "./dashboard";
import { listLeads, leadStatus } from "./leads";
import { listInquiries } from "./listings";
import { createQuote, guessType, isExpired, listQuotes, quoteCode, QUOTE_STATUS, quoteWhat } from "./quotes";
import { PURPOSES } from "./order-labels";

export type Ctx = { db: D1Database; user: User; link: (path: string) => string };
type Args = Record<string, unknown>;
type Tool = {
  name: string; title: string; description: string;
  inputSchema: { type: "object"; properties: Record<string, unknown>; required?: string[] };
  adminOnly?: boolean;
  /** writes into the CRM (the connector is otherwise read-only) */
  write?: boolean;
  run: (c: Ctx, a: Args) => Promise<unknown>;
};

const MAX = 50;
const str = (a: Args, k: string) => (typeof a[k] === "string" ? (a[k] as string).trim() : typeof a[k] === "number" ? String(a[k]) : "");
const num = (a: Args, k: string) => { const n = Number(a[k]); return a[k] !== undefined && a[k] !== "" && Number.isFinite(n) ? n : undefined; };
const limit = (a: Args, def = 20) => Math.min(MAX, Math.max(1, Math.round(num(a, "limita") ?? def)));
const day = (s: string) => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "");
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Bucharest" });
const S = (description: string, extra: Record<string, unknown> = {}) => ({ type: "string", description, ...extra });
const N = (description: string, extra: Record<string, unknown> = {}) => ({ type: "number", description, ...extra });
const LIMIT = N(`Câte rânduri (implicit 20, maxim ${MAX}).`);

/** Finds a team member by (part of) the name or email; null when none or several match. */
async function findPerson(db: D1Database, q: string) {
  if (!q) return null;
  const { results } = await db.prepare(`SELECT id, COALESCE(NULLIF(name, ''), email) AS name FROM users WHERE kind = 'internal' AND status <> 'deleted'
    AND (name LIKE ?1 OR email LIKE ?1) LIMIT 3`).bind(`%${q.replace(/[%_]/g, "")}%`).all<{ id: string; name: string }>();
  return results.length === 1 ? results[0] : results.length ? { id: "", name: `Mai multe persoane: ${results.map((r) => r.name).join(", ")}` } : null;
}

/** Order by id, CO-number or the bank's reference. */
async function resolveOrder(db: D1Database, q: string) {
  const seq = /^(?:co-?)?(\d{3,7})$/i.exec(q)?.[1];
  const r = await db.prepare("SELECT id FROM orders WHERE id = ?1 OR (?2 IS NOT NULL AND seq = CAST(?2 AS INTEGER)) OR bank_ref = ?1 ORDER BY id = ?1 DESC LIMIT 1")
    .bind(q, seq ?? null).first<{ id: string }>();
  return r ? getOrder(db, r.id) : null;
}

async function geocode(address: string): Promise<[number, number] | null> {
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=ro&q=${encodeURIComponent(address)}`,
      { headers: { "User-Agent": "VALUEFY-CRM/1.0 (crm.valuefy.ro)", "Accept-Language": "ro" }, signal: AbortSignal.timeout(8000) });
    const d = (await r.json()) as { lat: string; lon: string }[];
    return d[0] ? [Number(d[0].lat), Number(d[0].lon)] : null;
  } catch { return null; }
}

const reportRow = (c: Ctx, r: { id: string; number: string | null; label: string | null; report_date: string | null; status: string; fee: number | null; result_value: number | null; client_name: string | null; bank_code: string | null; evaluator: string | null; asset: string | null }, admin: boolean) => ({
  id: r.id, numar: r.number, denumire: r.label, data: r.report_date, status: REPORT_STATUS[r.status]?.[0] ?? r.status,
  client: r.client_name, banca: r.bank_code, evaluator: r.evaluator, bun: r.asset?.replace("|", " · ") ?? null,
  valoare_lei: r.result_value, ...(admin ? { onorariu_lei: r.fee } : {}), link: c.link(`/rapoarte/${r.id}`),
});

export const TOOLS: Tool[] = [
  {
    name: "oferte",
    title: "Oferte făcute clienților",
    description: "Ofertele notate în CRM (Oferte): deschise (de trimis / în așteptarea răspunsului), acceptate, convertite în lucrări, refuzate sau expirate. Caută după client, telefon, adresă sau OF-număr.",
    inputSchema: { type: "object", properties: {
      stare: S("deschise (implicit) | acceptate | convertite | refuzate | toate", { enum: ["deschise", "acceptate", "convertite", "refuzate", "toate"] }),
      text: S("Client, telefon, adresă sau numărul ofertei (OF-12)."), limita: LIMIT,
    } },
    run: async (c, a) => {
      const rows = await listQuotes(c.db, { tab: str(a, "stare") || "deschise", q: str(a, "text") });
      return { oferte: rows.slice(0, limit(a)).map((q) => ({
        id: q.id, numar: quoteCode(q), stare: isExpired(q) ? "Expirată" : QUOTE_STATUS[q.status][0], client: q.client_name, telefon: q.client_phone, email: q.client_email,
        bun: quoteWhat(q) || null, scop: q.purpose, tip_raport: q.report_type, onorariu_lei: q.fee, termen_zile: q.term_days, valabila_pana: q.valid_until, urgent: !!q.urgent,
        trimisa_la: q.sent_at, canal: q.channel, colaborare: q.collab_firm, note: q.notes, de_cine: q.author, creata: q.created_at,
        ...(q.status === "converted" ? { raport: q.report_number, link_raport: q.report_id ? c.link(`/rapoarte/${q.report_id}`) : null } : {}), link: c.link(`/oferte/${q.id}`),
      })), total: rows.length };
    },
  },
  {
    name: "adauga_oferta",
    title: "Notează o ofertă",
    description: "Notează în CRM o ofertă făcută unui client (modulul Oferte), ca să nu fie uitată: cine, ce se evaluează, onorariul, termenul, cum a fost transmisă. Nu creează comandă sau contract: acestea se fac din CRM, la conversia ofertei. Singura acțiune care scrie în CRM.",
    inputSchema: { type: "object", properties: {
      client: S("Numele clientului (persoană sau firmă)."), telefon: S("Telefonul clientului (telefon sau email, cel puțin unul)."), email: S("Emailul clientului."),
      firma: { type: "boolean", description: "true dacă clientul e persoană juridică." }, cui: S("CUI-ul firmei, dacă e cazul."),
      bun: S("Ce se evaluează: apartament, casă, teren, spațiu comercial, autoturism… (se potrivește cu tipurile din CRM)."),
      adresa: S("Adresa bunului."), localitate: S("Localitatea."), judet: S("Județul."), suprafata: N("Suprafața utilă în m² (opțional)."),
      scop: S(`Utilizarea desemnată, de ex. ${["Garantare bancară", ...PURPOSES.filter((x) => x !== "Credit bancar")].slice(0, 5).join(", ")}…`),
      tip_raport: S("Raport de evaluare (implicit), Notă de evaluare sau Notă de inspecție."),
      onorariu: N("Onorariul fără TVA, în lei."), termen_zile: N("Termenul propus, în zile lucrătoare."), valabila_zile: N("Câte zile e valabilă oferta (implicit 14)."),
      transmisa_prin: S("email | whatsapp | phone | meeting — dacă oferta a fost deja transmisă clientului; lipsă = încă netrimisă.", { enum: ["email", "whatsapp", "phone", "meeting"] }),
      urgent: { type: "boolean", description: "Clientul are nevoie repede." }, note: S("Ce s-a discutat, condiții, de urmărit."),
    }, required: ["client", "bun"] },
    write: true,
    run: async (c, a) => {
      const days = num(a, "valabila_zile") ?? 14;
      const valid = new Date(Date.now() + Math.max(1, Math.min(365, days)) * 86400000).toLocaleDateString("sv-SE", { timeZone: "Europe/Bucharest" });
      const r = await createQuote(c.db, c.user.id, {
        client_name: str(a, "client"), client_phone: str(a, "telefon"), client_email: str(a, "email"), client_kind: a.firma === true ? "company" : "person", client_cui: str(a, "cui"),
        purpose: str(a, "scop"), report_type: str(a, "tip_raport") || "Raport de evaluare", fee: num(a, "onorariu"), term_days: num(a, "termen_zile") ?? 3, valid_until: valid,
        urgent: a.urgent === true, notes: str(a, "note"), sent_via: str(a, "transmisa_prin") || undefined,
        assets: [{ type: guessType(str(a, "bun")), full_address: str(a, "adresa"), city: str(a, "localitate"), county: str(a, "judet"), usable_area: num(a, "suprafata") != null ? String(num(a, "suprafata")) : "" }],
      });
      if (!r.ok) return { eroare: r.error };
      const q = (await listQuotes(c.db, { tab: "toate", q: "" })).find((x) => x.id === r.id);
      return { ok: true, numar: q ? quoteCode(q) : null, id: r.id, bun: q ? quoteWhat(q) : null, stare: q ? QUOTE_STATUS[q.status][0] : null, link: c.link(`/oferte/${r.id}`),
        mesaj: "Oferta a fost notată în CRM. Comanda sau contractul se fac din CRM, cu „Convertește în lucrare”." };
    },
  },
  {
    name: "cauta",
    title: "Căutare generală",
    description: "Caută în tot CRM-ul VALUEFY: rapoarte, comenzi, clienți, contracte și proprietăți. Merge după nume, număr de raport, număr de comandă (CO-1234), referința băncii, telefon, CUI, email, număr CF sau cadastral, adresă.",
    inputSchema: { type: "object", properties: { text: S("Ce cauți, de ex. „Popescu”, „0722123456”, „CF 412345”, „CO-1043”.") }, required: ["text"] },
    run: async (c, a) => {
      const hits = await globalSearch(c.db, str(a, "text"));
      return { rezultate: hits.map((h) => ({ tip: h.kind, id: h.id, titlu: h.title, detalii: h.sub, link: c.link(h.href) })) };
    },
  },
  {
    name: "comanda",
    title: "Detalii comandă",
    description: "Detaliile unei comenzi: sursă, client, proprietate, status, documente încărcate și lipsă, oferta trimisă/acceptată și rapoartele legate.",
    inputSchema: { type: "object", properties: { comanda: S("Id-ul comenzii, numărul ei (CO-1234) sau referința băncii.") }, required: ["comanda"] },
    run: async (c, a) => {
      const o = await resolveOrder(c.db, str(a, "comanda"));
      if (!o) return { eroare: "Comanda nu a fost găsită. Folosește „cauta” ca să găsești id-ul." };
      const [docs, offers, reports] = await Promise.all([
        orderDocuments(c.db, o.id),
        c.db.prepare("SELECT number, status, fee, term_days, valid_until, sent_at, accepted_at FROM offers WHERE order_id = ? ORDER BY created_at DESC").bind(o.id)
          .all<Record<string, unknown>>().then((r) => r.results).catch(() => []),
        c.db.prepare("SELECT id, number, label, status, report_date, due_on, stage FROM reports WHERE order_id = ? ORDER BY created_at DESC").bind(o.id).all<{ id: string; number: string | null; label: string | null; status: string; report_date: string | null; due_on: string | null; stage: string | null }>().then((r) => r.results),
      ]);
      const missing = o.property_type ? missingDocs(o.property_type, docs as { kind: string }[] as never) : [];
      return {
        cod: orderCode(o), id: o.id, status: orderStatus(o)[0], sursa: SOURCE_LABEL[o.source] ?? o.source, primita: o.ordered_on ?? o.created_at.slice(0, 10),
        citita: !!o.viewed_at, client: { nume: o.client_name, telefon: o.client_phone, email: o.client_email },
        proprietate: { tip: o.property_type ? propertyLabel(o.property_type) : null, adresa: [o.address, o.city].filter(Boolean).join(", ") || null, suprafata_mp: o.surface_area, teren_mp: o.land_area, camere: o.rooms },
        scop: o.purpose, banca: o.bank, ref_banca: o.bank_ref, urgent: !!o.urgent, note: o.notes,
        ...(isAdmin(c.user) ? { onorariu_lei: o.fee } : {}),
        documente: docs.map((d) => ({ tip: (d as { kind: string }).kind, fisier: (d as { filename?: string }).filename ?? null })),
        documente_lipsa: missing.map((m) => (m as { label?: string; key: string }).label ?? m.key),
        oferte: offers, rapoarte: reports.map((r) => ({ ...r, link: c.link(`/rapoarte/${r.id}`) })),
        link: c.link(`/comenzi/${o.id}`),
      };
    },
  },
  {
    name: "comenzi",
    title: "Listă comenzi",
    description: "Lista comenzilor, cele mai noi primele. Filtre: status, sursă, bancă, perioadă, doar cele necitite de echipă.",
    inputSchema: {
      type: "object",
      properties: {
        status: S("Status.", { enum: ["primite", "in_lucru", "finalizate", "anulate", "suspendate", "documente_lipsa"] }),
        sursa: S("De unde a venit comanda.", { enum: ["bank", "partner", "client", "site", "collab", "direct"] }),
        banca: S("Codul sau numele băncii, de ex. BCR."),
        de_la: S("Data de început (AAAA-LL-ZZ)."), pana_la: S("Data de sfârșit (AAAA-LL-ZZ)."),
        necitite: { type: "boolean", description: "Doar comenzile pe care nu le-a deschis nimeni din echipă." },
        limita: LIMIT,
      },
    },
    run: async (c, a) => {
      const w: string[] = [], p: (string | number)[] = [];
      const st: Record<string, string> = { in_lucru: "in_progress", finalizate: "done", anulate: "cancelled", suspendate: "suspended" };
      const s = str(a, "status");
      if (st[s]) { w.push("o.status = ?"); p.push(st[s]); }
      if (s === "primite") w.push("o.status IN ('received', 'draft')");
      if (s === "documente_lipsa") w.push("o.docs_missing > 0 AND o.status NOT IN ('done', 'cancelled')");
      if (str(a, "sursa")) { w.push("o.source = ?"); p.push(str(a, "sursa")); }
      if (str(a, "banca")) { w.push("o.bank LIKE ?"); p.push(`%${str(a, "banca")}%`); }
      const d = "COALESCE(o.ordered_on, substr(o.created_at, 1, 10))";
      if (day(str(a, "de_la"))) { w.push(`${d} >= ?`); p.push(str(a, "de_la")); }
      if (day(str(a, "pana_la"))) { w.push(`${d} <= ?`); p.push(str(a, "pana_la")); }
      if (a.necitite === true) w.push("o.viewed_at IS NULL");
      const where = w.length ? `WHERE ${w.join(" AND ")}` : "";
      const [rows, total] = await Promise.all([
        c.db.prepare(`SELECT o.id, o.seq, o.source, o.status, o.docs_missing, o.bank, o.bank_ref, o.client_name, o.property_type, o.report_type, o.city, o.address, o.viewed_at, ${d} AS d
          FROM orders o ${where} ORDER BY ${d} DESC, o.created_at DESC LIMIT ${limit(a)}`).bind(...p)
          .all<{ id: string; seq: number | null; source: string; status: string; docs_missing: number; bank: string | null; bank_ref: string | null; client_name: string | null; property_type: string | null; report_type: string | null; city: string | null; address: string | null; viewed_at: string | null; d: string }>(),
        c.db.prepare(`SELECT COUNT(*) AS n FROM orders o ${where}`).bind(...p).first<{ n: number }>(),
      ]);
      return {
        total: total?.n ?? 0,
        comenzi: rows.results.map((o) => ({
          cod: orderCode(o), id: o.id, data: o.d, status: orderStatus(o)[0], sursa: SOURCE_LABEL[o.source] ?? o.source, banca: o.bank, client: o.client_name,
          ce: o.property_type ? propertyLabel(o.property_type) : o.report_type, adresa: [o.address, o.city].filter(Boolean).join(", ") || null, citita: !!o.viewed_at, link: c.link(`/comenzi/${o.id}`),
        })),
      };
    },
  },
  {
    name: "rapoarte",
    title: "Listă rapoarte",
    description: "Rapoartele de evaluare, cu filtre: status, etapă, termen depășit sau apropiat (2 zile), evaluator, bancă, an, text. Include totalurile pentru filtrul ales.",
    inputSchema: {
      type: "object",
      properties: {
        status: S("deschise = încă nelivrate.", { enum: ["deschise", "draft", "in_progress", "done", "suspended", "cancelled"] }),
        etapa: S("Etapa rapoartelor deschise.", { enum: ["inspectie", "redactare", "verificare"] }),
        termen: S("depasit = termen trecut; curand = în următoarele 2 zile.", { enum: ["depasit", "curand"] }),
        evaluator: S("Numele (sau o parte din nume) evaluatorului."),
        banca: S("Codul băncii, de ex. BCR, BRD, UCB."),
        an: S("Anul raportului, de ex. 2026."),
        text: S("Text liber: număr, client, adresă, CF."),
        limita: LIMIT,
      },
    },
    run: async (c, a) => {
      const f: ReportFilters = { status: str(a, "status") || undefined, etapa: str(a, "etapa") || undefined, termen: str(a, "termen") || undefined,
        bank: str(a, "banca") || undefined, year: str(a, "an") || undefined, q: str(a, "text") || undefined, sort: "new" };
      if (str(a, "evaluator")) {
        const u = await findPerson(c.db, str(a, "evaluator"));
        if (!u?.id) return { eroare: u?.name ?? `Nu găsesc evaluatorul „${str(a, "evaluator")}”.` };
        f.evaluator = u.id;
      }
      const r = await listReports(c.db, f);
      const admin = isAdmin(c.user);
      return {
        total: r.total, deschise: r.open, livrate: r.done, suspendate: r.suspended, ...(admin ? { onorarii_livrate_lei: r.fees } : {}),
        rapoarte: r.rows.slice(0, limit(a)).map((x) => reportRow(c, x, admin)),
      };
    },
  },
  {
    name: "raport",
    title: "Detalii raport",
    description: "Detaliile unui raport: client, bancă, scop, bunurile evaluate cu valorile lor, echipa (evaluator, inspector, verificator), etapa, termenul și datele importante.",
    inputSchema: { type: "object", properties: { raport: S("Id-ul raportului sau numărul lui.") }, required: ["raport"] },
    run: async (c, a) => {
      const q = str(a, "raport");
      const hit = await c.db.prepare("SELECT id FROM reports WHERE id = ?1 OR number = ?1 ORDER BY id = ?1 DESC, created_at DESC LIMIT 1").bind(q).first<{ id: string }>();
      const r = hit ? await getReport(c.db, hit.id) : null;
      if (!r) return { eroare: "Raportul nu a fost găsit. Folosește „cauta” ca să găsești id-ul." };
      const [team, assets] = await Promise.all([reportTeam(c.db, r.id), reportAssets(c.db, r.id)]);
      const admin = isAdmin(c.user);
      return {
        id: r.id, numar: r.number, denumire: r.label, status: REPORT_STATUS[r.status]?.[0] ?? r.status, etapa: r.stage,
        data_raport: r.report_date, data_evaluare: r.valuation_date, primit: r.received_on, termen: r.due_on, livrat: r.delivered_at,
        client: { nume: r.client_name, telefon: r.client_phone, email: r.client_email, cui: r.client_cui },
        banca: r.bank_name, sucursala: r.bank_branch, scop: r.purpose, tip_valoare: r.value_type, valoare_lei: r.result_value, moneda: r.currency,
        ...(admin ? { onorariu_lei: r.fee, onorariu_colaborator_lei: r.collab_fee } : {}),
        echipa: team.map((m) => ({ rol: m.role, nume: m.name, telefon: m.phone })),
        bunuri: assets.map((x) => ({ tip: x.type, categorie: x.category, adresa: x.full_address ?? x.city, cf: x.cf_number, valoare_lei: x.value, principal: !!x.is_main, abordare: x.approach })),
        motiv_suspendare: r.suspend_reason, note: r.notes, link: c.link(`/rapoarte/${r.id}`),
      };
    },
  },
  {
    name: "inspectii",
    title: "Agenda inspecțiilor",
    description: "Inspecțiile programate sau de programat, cu adresă, inspector, persoana de contact și raportul legat. Implicit: inspecțiile active de azi înainte.",
    inputSchema: {
      type: "object",
      properties: {
        perioada: S("Perioada.", { enum: ["azi", "maine", "saptamana", "luna", "30"] }),
        stare: S("deprogramat = încă neprogramate.", { enum: ["deprogramat", "programate", "intarziate", "realizate", "toate"] }),
        inspector: S("Numele inspectorului."),
        limita: LIMIT,
      },
    },
    run: async (c, a) => {
      let inspector: string | undefined;
      if (str(a, "inspector")) {
        const u = await findPerson(c.db, str(a, "inspector"));
        if (!u?.id) return { eroare: u?.name ?? `Nu găsesc inspectorul „${str(a, "inspector")}”.` };
        inspector = u.id;
      }
      const b = await inspectionBoard(c.db, { perioada: str(a, "perioada") || undefined, stare: str(a, "stare") || undefined, inspector });
      return {
        azi: b.today, contoare: b.counts,
        inspectii: b.rows.slice(0, limit(a)).map((i) => ({
          programata: i.scheduled_at, realizata: i.done_at, termen: i.due_on, intarziata: i.late, inspector: i.inspector,
          tip: i.type, adresa: [i.address, i.city].filter(Boolean).join(", "), contact: i.contact_name, telefon_contact: i.contact_phone,
          raport: i.report_number ?? i.report_label, link: i.report_id ? c.link(`/rapoarte/${i.report_id}`) : null,
        })),
      };
    },
  },
  {
    name: "client",
    title: "Fișa clientului",
    description: "Datele unui client (persoană, firmă, bancă), persoanele de contact și ultimele lui rapoarte. Dacă textul se potrivește cu mai mulți clienți, întoarce lista lor.",
    inputSchema: { type: "object", properties: { client: S("Id-ul clientului, numele, CUI-ul, emailul sau telefonul.") }, required: ["client"] },
    run: async (c, a) => {
      const q = str(a, "client");
      let id = (await c.db.prepare("SELECT id FROM entities WHERE id = ? AND kind <> 'valuation_firm'").bind(q).first<{ id: string }>())?.id;
      if (!id) {
        // Banks and institutions are often named by their code (BCR, BRD, UCB).
        const code = await c.db.prepare("SELECT id FROM entities WHERE kind <> 'valuation_firm' AND upper(code) = upper(?) LIMIT 2").bind(q).all<{ id: string }>();
        if (code.results.length === 1) id = code.results[0].id;
      }
      if (!id) {
        const hits = (await globalSearch(c.db, q)).filter((h) => h.kind === "client");
        if (!hits.length) return { eroare: "Clientul nu a fost găsit." };
        if (hits.length > 1) return { mai_multi_clienti: hits.map((h) => ({ id: h.id, nume: h.title, detalii: h.sub })) };
        id = hits[0].id;
      }
      const e = await getClient(c.db, id);
      if (!e) return { eroare: "Clientul nu a fost găsit." };
      const admin = isAdmin(c.user);
      const [contacts, reports, stats] = await Promise.all([
        clientContacts(c.db, id),
        c.db.prepare(`SELECT r.id, r.number, r.label, r.status, r.report_date, r.result_value, r.fee FROM reports r WHERE r.client_id = ?1 OR r.recipient_id = ?1
          ORDER BY COALESCE(r.report_date, substr(r.created_at, 1, 10)) DESC LIMIT 15`).bind(id)
          .all<{ id: string; number: string | null; label: string | null; status: string; report_date: string | null; result_value: number | null; fee: number | null }>(),
        c.db.prepare("SELECT COUNT(*) AS n, SUM(fee) AS fees, MIN(report_date) AS first, MAX(report_date) AS last FROM reports WHERE client_id = ?1 OR recipient_id = ?1").bind(id)
          .first<{ n: number; fees: number | null; first: string | null; last: string | null }>(),
      ]);
      return {
        id: e.id, tip: kindName(e.kind), nume: e.name, cui: e.cui, nr_reg_com: e.reg_no, adresa: e.billing_address, telefon: e.phone, email: e.email, note: e.notes,
        contacte: contacts.map((x) => ({ nume: x.name, functie: x.role, telefon: x.phone, email: x.email })),
        rapoarte_total: stats?.n ?? 0, primul: stats?.first, ultimul: stats?.last, ...(admin ? { onorarii_total_lei: stats?.fees ?? 0 } : {}),
        ultimele_rapoarte: reports.results.map((r) => ({ numar: r.number, denumire: r.label, data: r.report_date, status: REPORT_STATUS[r.status]?.[0] ?? r.status, valoare_lei: r.result_value, ...(admin ? { onorariu_lei: r.fee } : {}), link: c.link(`/rapoarte/${r.id}`) })),
        link: c.link(`/clienti/${e.id}`),
      };
    },
  },
  {
    name: "comparabile",
    title: "Proprietăți evaluate și comparabile",
    description: "Proprietățile evaluate de VALUEFY într-o rază în jurul unei adrese, al unor coordonate sau al unei proprietăți din CRM, cu valoarea pe m² și statistici (mediană, quartile). Tipurile din CRM sunt de forma „APARTAMENT IN BLOC”, „CASA CU TEREN”, „TEREN INTRAVILAN CONSTRUCTII”; categoriile: REZIDENTIAL, COMERCIAL, INDUSTRIAL, TEREN.",
    inputSchema: {
      type: "object",
      properties: {
        adresa: S("Adresa în jurul căreia cauți, de ex. „Str. Ion Ionescu de la Brad 10, Timișoara”."),
        lat: N("Latitudine (în loc de adresă)."), lng: N("Longitudine (în loc de adresă)."),
        proprietate_id: S("Id-ul unei proprietăți din CRM (în loc de adresă)."),
        tip: S("Tipul proprietății, ca în CRM (ex. APARTAMENT IN BLOC)."),
        categorie: S("Categoria, dacă nu dai tipul (ex. REZIDENTIAL)."),
        suprafata_mp: N("Suprafața utilă a proprietății de comparat (filtrează ±toleranță)."),
        toleranta_suprafata: S("Toleranța pe suprafață.", { enum: AREA.map(([k]) => k) }),
        raza_km: S("Raza în km.", { enum: ["0.5", "1", "2", "5"] }),
        ani: S("Cât de recente să fie evaluările, în ani (0 = oricând).", { enum: ["1", "2", "3", "5", "0"] }),
      },
    },
    run: async (c, a) => {
      let ll: [number, number] | null = null;
      let subject = { id: undefined as string | undefined, type: str(a, "tip") || null, category: str(a, "categorie") || null, usable_area: num(a, "suprafata_mp") ?? null };
      if (str(a, "proprietate_id")) {
        const p = await c.db.prepare("SELECT id, type, category, geo, usable_area FROM crm_properties WHERE id = ?").bind(str(a, "proprietate_id"))
          .first<{ id: string; type: string | null; category: string | null; geo: string | null; usable_area: number | null }>();
        if (!p) return { eroare: "Proprietatea nu a fost găsită." };
        ll = parseGeo(p.geo);
        subject = { id: p.id, type: subject.type ?? p.type, category: subject.category ?? p.category, usable_area: subject.usable_area ?? p.usable_area };
      } else if (num(a, "lat") !== undefined && num(a, "lng") !== undefined) ll = [num(a, "lat")!, num(a, "lng")!];
      else if (str(a, "adresa")) ll = await geocode(str(a, "adresa"));
      if (!ll) return { eroare: "Nu am putut localiza punctul. Dă o adresă mai exactă (stradă, număr, localitate) sau coordonatele." };
      const r = await nearby(c.db, ll, subject, { raza: str(a, "raza_km") || undefined, ani: str(a, "ani") || undefined, supr: str(a, "toleranta_suprafata") || undefined, potrivire: subject.type ? undefined : "categorie" });
      return {
        punct: ll, criterii: r.settings,
        statistici_lei_mp: r.stats && Object.fromEntries(Object.entries(r.stats).map(([k, v]) => [k, typeof v === "number" ? Math.round(v) : v])),
        proprietati: r.rows.slice(0, MAX).map((x) => ({ tip: x.type, adresa: x.full_address ?? x.city, suprafata_mp: x.usable_area, an_constructie: x.year_built,
          valoare_lei: x.value, lei_mp: x.sqm ? Math.round(x.sqm) : null, data: x.last_date, distanta_km: x.km, raport: x.report_number,
          link: x.report_id ? c.link(`/rapoarte/${x.report_id}`) : c.link(`/proprietati/${x.id}`) })),
      };
    },
  },
  {
    name: "facturi",
    title: "Facturi",
    adminOnly: true,
    description: "Facturile și proformele emise: neîncasate, scadente (termen de plată trecut), încasate; pe client sau perioadă. Include totalul sumelor.",
    inputSchema: {
      type: "object",
      properties: {
        status: S("Statusul.", { enum: ["neincasate", "scadente", "paid", "cancelled"] }),
        client: S("Numele clientului sau numărul facturii."),
        de_la: S("Data emiterii, de la (AAAA-LL-ZZ)."), pana_la: S("Data emiterii, până la (AAAA-LL-ZZ)."),
        limita: LIMIT,
      },
    },
    run: async (c, a) => {
      const rows = (await invoicesFor(c.db, { status: str(a, "status") || undefined, q: str(a, "client") || undefined, limit: 2000 }))
        .filter((i) => (!day(str(a, "de_la")) || i.issue_date >= str(a, "de_la")) && (!day(str(a, "pana_la")) || i.issue_date <= str(a, "pana_la")));
      const t = today();
      return {
        numar: rows.length, total_lei: Math.round(rows.reduce((s, i) => s + (i.total ?? 0), 0) * 100) / 100,
        facturi: rows.slice(0, limit(a)).map((i) => ({ tip: i.kind === "invoice" ? "factură" : i.kind, serie_numar: `${i.series} ${i.number}`, emisa: i.issue_date, scadenta: i.due_date,
          zile_intarziere: i.status === "issued" && i.due_date && i.due_date < t ? Math.round((Date.parse(t) - Date.parse(i.due_date)) / 86400000) : 0,
          client: i.client_name, contract: i.contract_number, total_lei: i.total, status: i.status, incasata: i.paid_at })),
      };
    },
  },
  {
    name: "statistici",
    title: "Statistici",
    description: "Rapoartele livrate într-o perioadă, grupate după lună, bancă, tip de proprietate, evaluator, sursa comenzii sau client: număr, onorarii (doar pentru administratori), onorariul mediu și valoarea medie.",
    inputSchema: {
      type: "object",
      properties: {
        de_la: S("Data de început (AAAA-LL-ZZ). Implicit: începutul anului."),
        pana_la: S("Data de sfârșit (AAAA-LL-ZZ). Implicit: azi."),
        grupare: S("Cum grupezi rezultatele.", { enum: ["luna", "banca", "tip", "evaluator", "sursa", "client"] }),
      },
      required: ["grupare"],
    },
    run: async (c, a) => {
      const from = day(str(a, "de_la")) || `${today().slice(0, 4)}-01-01`, to = day(str(a, "pana_la")) || today();
      const done = "COALESCE(substr(r.delivered_at, 1, 10), r.report_date)";
      const key: Record<string, string> = {
        luna: `substr(${done}, 1, 7)`,
        banca: "COALESCE(b.code, b.name, 'fără bancă')",
        tip: "COALESCE((SELECT p.type FROM assets x JOIN crm_properties p ON p.id = x.property_id WHERE x.report_id = r.id ORDER BY x.is_main DESC LIMIT 1), r.report_type, '—')",
        evaluator: "COALESCE((SELECT COALESCE(NULLIF(u.name, ''), u.email) FROM report_members m JOIN users u ON u.id = m.user_id WHERE m.report_id = r.id AND m.role = 'evaluator' LIMIT 1), '—')",
        sursa: "COALESCE((SELECT o.source FROM orders o WHERE o.id = r.order_id), '—')",
        client: "COALESCE(c.name, '—')",
      };
      const g = key[str(a, "grupare")] ?? key.luna;
      const { results } = await c.db.prepare(`SELECT ${g} AS grup, COUNT(*) AS n, SUM(r.fee) AS fees, AVG(r.fee) AS avg_fee, AVG(r.result_value) AS avg_value
        FROM reports r LEFT JOIN entities b ON b.id = r.recipient_id LEFT JOIN entities c ON c.id = r.client_id
        WHERE r.status = 'done' AND ${done} BETWEEN ? AND ? GROUP BY grup ORDER BY ${str(a, "grupare") === "luna" ? "grup" : "n DESC"} LIMIT 100`).bind(from, to)
        .all<{ grup: string; n: number; fees: number | null; avg_fee: number | null; avg_value: number | null }>();
      const admin = isAdmin(c.user);
      const r0 = (x: number | null) => (x == null ? null : Math.round(x));
      return {
        perioada: { de_la: from, pana_la: to }, grupare: str(a, "grupare"),
        randuri: results.map((x) => ({ grup: str(a, "grupare") === "sursa" ? SOURCE_LABEL[x.grup] ?? x.grup : x.grup, rapoarte_livrate: x.n,
          ...(admin ? { onorarii_lei: r0(x.fees), onorariu_mediu_lei: r0(x.avg_fee) } : {}), valoare_medie_lei: r0(x.avg_value) })),
      };
    },
  },
  {
    name: "rezumat_zi",
    title: "Rezumatul zilei",
    description: "Ce e important azi: inspecțiile de azi și mâine, rapoartele deschise și cele cu termen depășit, alertele (alocări lipsă, documente lipsă, oferte fără răspuns), comenzile noi necitite și luna curentă pe scurt.",
    inputSchema: { type: "object", properties: {} },
    run: async (c) => {
      const d = await dashboard(c.db, "");
      const admin = isAdmin(c.user);
      const unread = await c.db.prepare("SELECT COUNT(*) AS n FROM orders WHERE viewed_at IS NULL").first<{ n: number }>();
      return {
        azi: d.today,
        luna_curenta: { rapoarte_livrate: d.delivered.n, luna_trecuta_aceeasi_perioada: d.delivered.pn, ...(admin ? { onorarii_lei: d.delivered.fees } : {}), comenzi_noi: d.newOrders.n },
        comenzi_necitite: unread?.n ?? 0,
        rapoarte_deschise: d.openCount, rapoarte_intarziate: d.late,
        inspectii: d.visits.map((v) => ({ ora: v.scheduled_at, maine: v.tomorrow, inspector: v.inspector, tip: v.type, adresa: v.address, contact: v.contact_name, link: v.report_id ? c.link(`/rapoarte/${v.report_id}`) : null })),
        alerte: d.alerts,
      };
    },
  },
  {
    name: "cereri_site",
    title: "Cereri de pe site",
    description: "Cererile venite de pe valuefy.ro: solicitările de evaluare/vânzare din asistent și cererile de vizionare sau de raport din paginile anunțurilor.",
    inputSchema: { type: "object", properties: { doar_noi: { type: "boolean", description: "Doar cererile încă netratate." }, limita: LIMIT } },
    run: async (c, a) => {
      const onlyNew = a.doar_noi === true;
      const [leads, inq] = await Promise.all([listLeads(c.db), listInquiries(c.db)]);
      const L = leads.filter((l) => !onlyNew || l.status === "NEW").slice(0, limit(a));
      const I = inq.filter((q) => !onlyNew || q.status === "NEW").slice(0, limit(a));
      return {
        solicitari: L.map((l) => ({ data: l.created_at, tip: l.kind === "sale" ? "vânzare" : "evaluare", status: leadStatus(l.status)[0], nume: l.name, telefon: l.phone, email: l.email,
          proprietate: [l.property_type, l.city, l.address].filter(Boolean).join(", "), rezumat: l.summary, link: c.link(`/comenzi/site/${l.id}`) })),
        cereri_anunturi: I.map((q) => ({ data: q.created_at, tip: q.kind === "report" ? "raport" : "vizionare", status: q.status, anunt: q.listing_title, nume: q.name, telefon: q.phone, email: q.email,
          mesaj: [q.reason, q.message].filter(Boolean).join(" — ") || null, link: c.link("/anunturi#cereri") })),
      };
    },
  },
];

/** The tools this user may use (facturi: owner and administrators). */
export const toolsFor = (u: User) => TOOLS.filter((t) => !t.adminOnly || isAdmin(u));
