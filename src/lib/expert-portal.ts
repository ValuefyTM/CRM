// Server-only: the public query service of the courts' portal (portal.just.ro): a case by its number, with its
// parties and its hearings (panel, kind of solution, the solution in short, the hearing's document). No sign-in.
// The documents themselves are not there: they are in the electronic case file, where the expert looks.
import { now, uuid } from "./db";
import { DONE_STAGE, FILE_BEFORE_DAYS, type Case } from "./expert-labels";

const ENDPOINTS = ["http://portalquery.just.ro/query.asmx", "https://portalquery.just.ro/query.asmx"];

export type PortalSession = { date: string; time: string | null; panel: string | null; solution: string | null; summary: string | null; doc: string | null; doc_no: string | null; doc_date: string | null };
export type PortalCase = { number: string; court: string | null; section: string | null; object: string | null; category: string | null; stage: string | null; modified: string | null;
  parties: { name: string; role: string }[]; sessions: PortalSession[] };

const decode = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16))).replace(/&amp;/g, "&");
const tag = (xml: string, name: string) => { const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`).exec(xml); const t = m ? decode(m[1]).replace(/\s+/g, " ").trim() : ""; return t || null; };
const blocks = (xml: string, name: string) => [...xml.matchAll(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "g"))].map((m) => m[1]);
const day = (s: string | null) => (s && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null);
const hour = (s: string | null) => { const m = /^(\d{1,2}):(\d{2})/.exec(s ?? ""); return m ? `${m[1].padStart(2, "0")}:${m[2]}` : null; };
/** "JudecatoriaTIMISOARA" → "Judecătoria Timișoara" is not possible without a list; shown as "Judecatoria Timisoara". */
const institution = (s: string | null) => (s ? s.replace(/([a-zăâîșț])([A-Z])/g, "$1 $2").replace(/\b([A-ZĂÂÎȘȚ])([A-ZĂÂÎȘȚ]+)\b/g, (_, a: string, b: string) => a + b.toLowerCase()) : null);
/** The role as the CRM names it ("Pârât", "Reclamant", "Intervenient"…), from the portal's own wording. */
const role = (s: string | null) => { const t = (s ?? "").trim(); return t ? t.charAt(0).toUpperCase() + t.slice(1).toLowerCase() : "Altă parte"; };

/** The answer of the service as cases (one per court the number is at: the first court, the appeal…). */
export function parsePortal(xml: string): PortalCase[] {
  return blocks(xml, "Dosar").map((d) => {
    // the case's own fields come after its parties and hearings: read them outside those lists
    const own = d.replace(/<parti>[\s\S]*?<\/parti>/, "").replace(/<sedinte>[\s\S]*?<\/sedinte>/, "").replace(/<caiAtac>[\s\S]*?<\/caiAtac>/, "");
    return {
      number: tag(own, "numar") ?? "", court: institution(tag(own, "institutie")), section: tag(own, "departament"), object: tag(own, "obiect"), category: tag(own, "categorieCaz"),
      stage: tag(own, "stadiuProcesual"), modified: tag(own, "dataModificare"),
      parties: blocks(d, "DosarParte").map((p) => ({ name: tag(p, "nume") ?? "", role: role(tag(p, "calitateParte")) })).filter((p) => p.name),
      sessions: blocks(d, "DosarSedinta").map((x) => ({ date: day(tag(x, "data")) ?? "", time: hour(tag(x, "ora")), panel: tag(x, "complet"), solution: tag(x, "solutie"), summary: tag(x, "solutieSumar"),
        doc: tag(x, "documentSedinta"), doc_no: tag(x, "numarDocument"), doc_date: day(tag(x, "dataDocument")) })).filter((x) => x.date).sort((a, b) => a.date.localeCompare(b.date)),
    };
  }).filter((c) => c.number);
}

/** Asks the portal for a case number. Throws with a message for the page when the portal does not answer. */
export async function portalLookup(number: string): Promise<PortalCase[]> {
  const nr = number.trim();
  if (!/^\d{1,7}\/\d{1,4}\/\d{4}(\/[\w.]+)?\**$/.test(nr)) throw new Error("Numărul dosarului nu are forma număr/instanță/an (ex. 38331/325/2024).");
  const body = `<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><CautareDosare xmlns="portalquery.just.ro"><numarDosar>${nr.replace(/[<>&]/g, "")}</numarDosar></CautareDosare></soap:Body></soap:Envelope>`;
  let last = "portalul nu răspunde";
  for (const url of ENDPOINTS) {
    try {
      const r = await fetch(url, { method: "POST", headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: '"portalquery.just.ro/CautareDosare"' }, body, signal: AbortSignal.timeout(25_000) });
      const xml = await r.text();
      if (!r.ok) { last = `portalul a răspuns ${r.status}`; continue; }
      if (!xml.includes("CautareDosareResponse")) { last = "răspuns neașteptat de la portal"; continue; }
      return parsePortal(xml);
    } catch (e) { last = e instanceof Error && e.name === "TimeoutError" ? "portalul nu a răspuns în 25 de secunde" : "portalul nu a putut fi contactat"; }
  }
  throw new Error(`Nu am putut citi portal.just.ro: ${last}.`);
}

const plain = (s: string | null | undefined) => (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
/** Of the courts a number is at, the one of this case (by its name), else the one changed last. */
export function pickCase(list: PortalCase[], court: string | null | undefined) {
  const want = plain(court);
  return (want && list.find((c) => plain(c.court) === want)) || [...list].sort((a, b) => (b.modified ?? "").localeCompare(a.modified ?? ""))[0] || null;
}

const ro = (d: string) => d.split("-").reverse().join(".");
const minus = (d: string, days: number) => new Date(Date.parse(`${d}T12:00:00Z`) - days * 864e5).toISOString().slice(0, 10);

/**
 * Brings a case up to date with the portal: every hearing becomes (or completes) a term of the case — past ones with
 * their kind of solution, the solution in short and the document, the coming one as the next term, with the day by
 * which the report is filed. Parties and the case's empty fields are filled in. What is new since the last check is
 * kept on the case as an alert for its expert: to look into the electronic file and see whether something is theirs to do.
 */
export async function syncCase(db: D1Database, c: Case & { portal_at?: string | null }) {
  const t = now(), today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Bucharest" });
  let found: PortalCase | null;
  try { found = pickCase(await portalLookup(c.number), c.court); } catch (e) {
    const msg = e instanceof Error ? e.message : "Nu am putut citi portalul.";
    await db.prepare("UPDATE expert_cases SET portal_error = ? WHERE id = ?").bind(msg.slice(0, 300), c.id).run();
    return { ok: false as const, error: msg };
  }
  if (!found) {
    const msg = "Dosarul nu a fost găsit pe portal.just.ro (numărul poate fi scris altfel sau dosarul nu este public).";
    await db.prepare("UPDATE expert_cases SET portal_error = ?, portal_at = ? WHERE id = ?").bind(msg, t, c.id).run();
    return { ok: false as const, error: msg };
  }
  const first = !c.portal_at;
  const [terms, parties] = await Promise.all([
    db.prepare("SELECT id, on_date, kind, done, solution, summary, source FROM expert_case_terms WHERE case_id = ?").bind(c.id).all<{ id: string; on_date: string; kind: string; done: number; solution: string | null; summary: string | null; source: string }>(),
    db.prepare("SELECT name FROM expert_case_parties WHERE case_id = ?").bind(c.id).all<{ name: string }>(),
  ]);
  const stmts: D1PreparedStatement[] = [], news: string[] = [];
  // the case's empty fields
  stmts.push(db.prepare("UPDATE expert_cases SET court = COALESCE(court, ?), section = COALESCE(section, ?), object = COALESCE(object, ?), portal_stage = ? WHERE id = ?").bind(found.court, found.section, found.object, found.stage, c.id));
  const known = new Set(parties.results.map((p) => plain(p.name)));
  found.parties.filter((p) => !known.has(plain(p.name))).forEach((p, i) => {
    stmts.push(db.prepare("INSERT INTO expert_case_parties (id, case_id, role, name, position) VALUES (?, ?, ?, ?, ?)").bind(uuid(), c.id, p.role, p.name, parties.results.length + i));
    if (!first) news.push(`parte nouă: ${p.name} (${p.role.toLowerCase()})`);
  });
  for (const s of found.sessions) {
    const held = !!(s.solution || s.summary) || s.date < today;
    const old = terms.results.find((x) => x.on_date === s.date && x.kind === "judecata");
    if (old) {
      const fresh = (s.solution ?? "") !== (old.solution ?? "") || (s.summary ?? "") !== (old.summary ?? "");
      stmts.push(db.prepare(`UPDATE expert_case_terms SET at_time = COALESCE(?, at_time), panel = ?, solution = ?, summary = ?, doc = ?, doc_no = ?, doc_date = ?, done = CASE WHEN ? THEN 1 ELSE done END,
        source = CASE WHEN source = 'manual' AND ? = 0 THEN source ELSE 'portal' END WHERE id = ?`).bind(s.time, s.panel, s.solution, s.summary, s.doc, s.doc_no, s.doc_date, s.solution || s.summary ? 1 : 0, 0, old.id));
      // the hearing was held: the day by which the report had to be filed for it is no longer open
      if (s.solution || s.summary) stmts.push(db.prepare("UPDATE expert_case_terms SET done = 1 WHERE case_id = ? AND kind = 'depunere' AND on_date = ? AND done = 0").bind(c.id, minus(s.date, FILE_BEFORE_DAYS)));
      if (fresh && (s.solution || s.summary) && !first) news.push(`soluție la ședința din ${ro(s.date)}: ${[s.solution, s.summary].filter(Boolean).join(" · ").slice(0, 220)}`);
      continue;
    }
    stmts.push(db.prepare("INSERT INTO expert_case_terms (id, case_id, on_date, at_time, kind, title, done, source, panel, solution, summary, doc, doc_no, doc_date) VALUES (?, ?, ?, ?, 'judecata', ?, ?, 'portal', ?, ?, ?, ?, ?, ?)")
      .bind(uuid(), c.id, s.date, s.time, held ? "Ședință de judecată" : "Termen de judecată", held ? 1 : 0, s.panel, s.solution, s.summary, s.doc, s.doc_no, s.doc_date));
    if (first) { /* the history of the case: no news */ }
    else if (held) news.push(`ședință nouă pe portal, ${ro(s.date)}: ${[s.solution, s.summary].filter(Boolean).join(" · ").slice(0, 220) || "fără soluție încă"}`);
    else news.push(`termen nou: ${ro(s.date)}${s.time ? `, ora ${s.time}` : ""}`);
    // a coming hearing while the report is not filed: the day by which it has to be
    const limit = minus(s.date, FILE_BEFORE_DAYS);
    if (!held && c.stage < 4 && !terms.results.some((x) => x.kind === "depunere" && x.on_date === limit))
      stmts.push(db.prepare("INSERT INTO expert_case_terms (id, case_id, on_date, kind, title, note, done, source) VALUES (?, ?, ?, 'depunere', 'Limită depunere raport', ?, 0, 'portal')")
        .bind(uuid(), c.id, limit, `cu ${FILE_BEFORE_DAYS} zile înainte de termenul din ${ro(s.date)}`));
  }
  stmts.push(news.length
    ? db.prepare("UPDATE expert_cases SET portal_at = ?, portal_error = NULL, portal_changed_at = ?, portal_change = ?, updated_at = ? WHERE id = ?").bind(t, t, news.join("\n").slice(0, 1500), t, c.id)
    : db.prepare("UPDATE expert_cases SET portal_at = ?, portal_error = NULL WHERE id = ?").bind(t, c.id));
  for (let i = 0; i < stmts.length; i += 80) await db.batch(stmts.slice(i, i + 80));
  const next = found.sessions.find((s) => s.date >= today && !s.solution && !s.summary) ?? null;
  return { ok: true as const, news, sessions: found.sessions.length, next: next ? { date: next.date, time: next.time } : null, stage: found.stage };
}

/** The cron: the monitored open cases not checked in the last 6 hours, the oldest check first, a few at a time. */
export async function syncMonitoredCases(db: D1Database, max = 8) {
  const { results } = await db.prepare(`SELECT * FROM expert_cases WHERE monitor = 1 AND stage < ${DONE_STAGE} AND (portal_at IS NULL OR portal_at < ?) ORDER BY COALESCE(portal_at, '') LIMIT ?`)
    .bind(new Date(Date.now() - 6 * 3600e3).toISOString(), max).all<Case & { portal_at: string | null }>();
  let changed = 0, failed = 0;
  for (const c of results) {
    const r = await syncCase(db, c).catch(() => null);
    // a failed check also counts as a check: the case waits its turn again instead of being retried every pass
    if (!r?.ok) { failed++; await db.prepare("UPDATE expert_cases SET portal_at = ? WHERE id = ?").bind(now(), c.id).run().catch(() => {}); }
    else if (r.news.length) changed++;
  }
  return { checked: results.length, changed, failed };
}
