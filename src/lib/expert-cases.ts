// Server-only: Expertize judiciare — the court cases in which a valuer is the appointed technical expert. Each case
// belongs to its expert (owner_id) and to nobody else: every read and write here goes through the owner's id, and there
// is no administrator's view. The module is given by the tick „Expert judiciar” on the user.
import { now, uuid, parseJson } from "./db";
import { bucket } from "./orders";
import { syncCase } from "./expert-portal";

import { DONE_STAGE, MAX_FILE, PRESET_FOLDERS, SUMMON_METHODS, TERM_KINDS, cleanPrefs, type ExpertPrefs, type Case, type Doc, type Folder, type Objective, type Party, type Summon, type Term } from "./expert-labels";
export * from "./expert-labels";

/** Has the module, as themself: an administrator looking at the CRM as this person („Vezi ca…”) does not get their cases. */
export const isExpert = (u: { judicial_expert?: number | null; kind?: string; impersonator?: unknown }) => !!u.judicial_expert && u.kind === "internal" && !u.impersonator;
export const objectivesOf = (c: Pick<Case, "objectives">) => parseJson<Objective[]>(c.objectives, []);
/** What is still to be received: the final fee (or the provisional one plus the raise asked), less what came in. */
export const feeDue = (c: Pick<Case, "fee_prov" | "fee_extra" | "fee_final" | "fee_cashed">) => Math.max(0, (c.fee_final ?? (c.fee_prov ?? 0) + (c.fee_extra ?? 0)) - (c.fee_cashed ?? 0));

const str = (v: unknown, max = 300) => { const t = typeof v === "string" ? v.trim().slice(0, max) : ""; return t || null; };
const date = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const time = (v: unknown) => (typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : null);
const money = (v: unknown) => { const n = Number(v); return v === "" || v == null || !Number.isFinite(n) || n < 0 ? null : Math.round(n * 100) / 100; };
const minus = (d: string, days: number) => new Date(Date.parse(`${d}T12:00:00Z`) - days * 864e5).toISOString().slice(0, 10);

// ---------------------------------------------------------------- the expert's own settings

const prefsKey = (userId: string) => `expert_prefs:${userId}`;
export async function getExpertPrefs(db: D1Database, userId: string): Promise<ExpertPrefs> {
  const row = await db.prepare("SELECT value FROM settings WHERE key = ?").bind(prefsKey(userId)).first<{ value: string }>().catch(() => null);
  return cleanPrefs(row ? parseJson<Partial<ExpertPrefs>>(row.value, {}) : null);
}
export async function saveExpertPrefs(db: D1Database, userId: string, v: Partial<ExpertPrefs>) {
  const p = cleanPrefs(v);
  await db.prepare("INSERT INTO settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by")
    .bind(prefsKey(userId), JSON.stringify(p), now(), userId).run();
  return p;
}

// ---------------------------------------------------------------- reading

export type CaseRow = Case & { claimant: string | null; defendant: string | null; next_on: string | null; next_title: string | null };

/** The expert's cases, with the two main parties and the next open term. */
export async function listCases(db: D1Database, ownerId: string) {
  const { results } = await db.prepare(`SELECT c.*,
      (SELECT p.name FROM expert_case_parties p WHERE p.case_id = c.id AND p.role = 'Reclamant' ORDER BY p.position LIMIT 1) AS claimant,
      (SELECT p.name FROM expert_case_parties p WHERE p.case_id = c.id AND p.role = 'Pârât' ORDER BY p.position LIMIT 1) AS defendant,
      (SELECT t.on_date FROM expert_case_terms t WHERE t.case_id = c.id AND t.done = 0 ORDER BY t.on_date LIMIT 1) AS next_on,
      (SELECT t.title FROM expert_case_terms t WHERE t.case_id = c.id AND t.done = 0 ORDER BY t.on_date LIMIT 1) AS next_title
    FROM expert_cases c WHERE c.owner_id = ? ORDER BY c.stage = ${DONE_STAGE}, COALESCE(next_on, '9999'), c.created_at DESC`).bind(ownerId).all<CaseRow>();
  return results;
}

/** One case of this expert (null for anyone else's). */
export const getCase = (db: D1Database, ownerId: string, id: string) =>
  db.prepare("SELECT * FROM expert_cases WHERE id = ? AND owner_id = ?").bind(id, ownerId).first<Case>();

export async function caseDetail(db: D1Database, ownerId: string, id: string) {
  const c = await getCase(db, ownerId, id);
  if (!c) return null;
  const [parties, terms, summons, folders, docs] = await Promise.all([
    db.prepare("SELECT id, role, name, address, phone, email, lawyer, note FROM expert_case_parties WHERE case_id = ? ORDER BY position, rowid").bind(id).all<Party>(),
    db.prepare("SELECT id, on_date, at_time, kind, title, note, done, result, source, panel, solution, summary, doc, doc_no, doc_date, court, phase FROM expert_case_terms WHERE case_id = ? ORDER BY on_date, COALESCE(at_time, ''), rowid").bind(id).all<Term>(),
    db.prepare("SELECT id, to_name, method, sent_on, confirmed_on, proof FROM expert_case_summons WHERE case_id = ? ORDER BY COALESCE(sent_on, created_at), rowid").bind(id).all<Summon>(),
    db.prepare("SELECT id, name, preset FROM expert_case_folders WHERE case_id = ? ORDER BY position, rowid").bind(id).all<Folder>(),
    db.prepare("SELECT id, folder_id, filename, size_bytes, version, current, created_at FROM expert_case_docs WHERE case_id = ? ORDER BY filename COLLATE NOCASE, version DESC").bind(id).all<Doc>(),
  ]);
  return { case: c, parties: parties.results, terms: terms.results, summons: summons.results, folders: folders.results, docs: docs.results };
}
export type CaseDetail = NonNullable<Awaited<ReturnType<typeof caseDetail>>>;

// ---------------------------------------------------------------- the case itself

type Body = Record<string, unknown>;
const caseFields = (b: Body) => ({
  number: str(b.number, 60), court: str(b.court, 160), section: str(b.section, 160), panel: str(b.panel, 40), object: str(b.object, 240), specialty: str(b.specialty, 160),
  appointed_on: date(b.appointed_on), property: str(b.property, 500), notes: str(b.notes, 4000),
});
const objectivesIn = (v: unknown): Objective[] => (Array.isArray(v) ? v : String(v ?? "").split("\n"))
  .map((x): Objective => {
    if (typeof x === "string") return { text: x.trim().slice(0, 1500), done: false };
    const o = x as Objective, by = String(o?.by ?? "").trim().slice(0, 80);
    return { text: String(o?.text ?? "").trim().slice(0, 1500), done: !!o?.done, ...(by ? { by } : {}) };
  })
  .filter((x) => x.text).slice(0, 30);

/** A new case, with what the appointment says: parties, the next hearing (and the filing limit before it), the fee, the folders. */
export async function createCase(db: D1Database, ownerId: string, b: Body) {
  const f = caseFields(b);
  if (!f.number) return { ok: false as const, error: "Scrie numărul dosarului." };
  const dup = await db.prepare("SELECT id FROM expert_cases WHERE owner_id = ? AND number = ?").bind(ownerId, f.number).first<{ id: string }>();
  if (dup) return { ok: false as const, error: "Ai deja un dosar cu acest număr.", id: dup.id };
  const id = uuid(), t = now(), before = (await getExpertPrefs(db, ownerId)).file_before;
  const stmts: D1PreparedStatement[] = [
    db.prepare(`INSERT INTO expert_cases (id, owner_id, number, court, section, panel, object, specialty, appointed_on, property, objectives, fee_prov, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(id, ownerId, f.number, f.court, f.section, f.panel, f.object, f.specialty, f.appointed_on, f.property, JSON.stringify(objectivesIn(b.objectives)), money(b.fee_prov), f.notes, t, t),
    ...PRESET_FOLDERS.map((n, i) => db.prepare("INSERT INTO expert_case_folders (id, case_id, name, preset, position) VALUES (?, ?, ?, 1, ?)").bind(uuid(), id, n, i)),
  ];
  const parties = Array.isArray(b.parties) ? (b.parties as Body[]) : [];
  parties.slice(0, 20).forEach((p, i) => {
    const name = str(p.name, 200);
    if (name) stmts.push(db.prepare("INSERT INTO expert_case_parties (id, case_id, role, name, address, phone, email, lawyer, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(uuid(), id, str(p.role, 60) ?? "Altă parte", name, str(p.address), str(p.phone, 40), str(p.email, 160), str(p.lawyer, 200), i));
  });
  if (f.appointed_on) stmts.push(termStmt(db, id, { on_date: f.appointed_on, kind: "eveniment", title: "Încheiere de numire", note: money(b.fee_prov) != null ? `onorariu provizoriu ${money(b.fee_prov)} lei` : null, done: 1 }));
  const hearing = date(b.next_hearing);
  if (hearing) {
    stmts.push(termStmt(db, id, { on_date: hearing, at_time: time(b.next_time), kind: "judecata", title: "Termen de judecată", note: str(b.next_note) }));
    if (b.with_filing !== false) stmts.push(termStmt(db, id, { on_date: minus(hearing, before), kind: "depunere", title: "Limită depunere raport", note: `cu ${before} zile înainte de termenul din ${hearing.split("-").reverse().join(".")}` }));
  }
  await db.batch(stmts);
  // the folder the appointment itself goes into (the form uploads the file read by the assistant)
  const folder = await db.prepare("SELECT id FROM expert_case_folders WHERE case_id = ? ORDER BY position LIMIT 1").bind(id).first<{ id: string }>();
  if (b.monitor) await db.prepare("UPDATE expert_cases SET monitor = 1 WHERE id = ?").bind(id).run();
  return { ok: true as const, id, folder: folder?.id ?? null };
}

const termStmt = (db: D1Database, caseId: string, t: { on_date: string; at_time?: string | null; kind: string; title: string; note?: string | null; done?: number }) =>
  db.prepare("INSERT INTO expert_case_terms (id, case_id, on_date, at_time, kind, title, note, done) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(uuid(), caseId, t.on_date, t.at_time ?? null, t.kind, t.title, t.note ?? null, t.done ?? 0);

/** The case's own fields, its objectives, the visit, the fee, the stage. */
export async function updateCase(db: D1Database, ownerId: string, id: string, b: Body) {
  const c = await getCase(db, ownerId, id);
  if (!c) return { ok: false as const, error: "Dosarul nu există." };
  const set: string[] = [], vals: unknown[] = [];
  const put = (k: string, v: unknown) => { set.push(`${k} = ?`); vals.push(v); };
  if ("number" in b) {
    const f = caseFields(b);
    if (!f.number) return { ok: false as const, error: "Scrie numărul dosarului." };
    Object.entries(f).forEach(([k, v]) => put(k, v));
  }
  if ("objectives" in b) put("objectives", JSON.stringify(objectivesIn(b.objectives)));
  if ("visit_on" in b) { put("visit_on", date(b.visit_on)); put("visit_time", time(b.visit_time)); put("visit_place", str(b.visit_place, 300)); put("visit_done", b.visit_done ? 1 : 0); }
  if ("fee_paid" in b) { put("fee_prov", money(b.fee_prov)); put("fee_paid", b.fee_paid ? 1 : 0); put("fee_extra", money(b.fee_extra)); put("fee_final", money(b.fee_final)); put("fee_cashed", money(b.fee_cashed)); }
  if ("stage" in b) put("stage", Math.min(DONE_STAGE, Math.max(0, Math.round(Number(b.stage)) || 0)));
  if (!set.length) return { ok: true as const };
  await db.prepare(`UPDATE expert_cases SET ${set.join(", ")}, updated_at = ? WHERE id = ? AND owner_id = ?`).bind(...vals, now(), id, ownerId).run();
  // a finished case tells nothing more: its open terms are closed
  if ("stage" in b && Number(b.stage) >= DONE_STAGE) await db.prepare("UPDATE expert_case_terms SET done = 1 WHERE case_id = ? AND done = 0").bind(id).run();
  return { ok: true as const };
}

/** Deletes a case with everything in it, files included. */
export async function deleteCase(db: D1Database, ownerId: string, id: string) {
  const c = await getCase(db, ownerId, id);
  if (!c) return false;
  const { results } = await db.prepare("SELECT r2_key FROM expert_case_docs WHERE case_id = ?").bind(id).all<{ r2_key: string }>();
  const r2 = await bucket();
  if (r2) for (let i = 0; i < results.length; i += 500) await r2.delete(results.slice(i, i + 500).map((d) => d.r2_key)).catch(() => {});
  await db.batch(["expert_case_docs", "expert_case_folders", "expert_case_summons", "expert_case_terms", "expert_case_parties"].map((t) => db.prepare(`DELETE FROM ${t} WHERE case_id = ?`).bind(id))
    .concat(db.prepare("DELETE FROM expert_cases WHERE id = ? AND owner_id = ?").bind(id, ownerId)));
  return true;
}

// ---------------------------------------------------------------- parties, terms, summons, folders (one action each)

/** `{ action, … }` on a case of this expert. Returns `{ ok }` or `{ ok: false, error }`. */
export async function caseAction(db: D1Database, ownerId: string, id: string, b: Body): Promise<{ ok: true; id?: string } | { ok: false; error: string }> {
  const c = await getCase(db, ownerId, id);
  if (!c) return { ok: false, error: "Dosarul nu există." };
  const rid = typeof b.id === "string" ? b.id : "";
  const touch = () => db.prepare("UPDATE expert_cases SET updated_at = ? WHERE id = ?").bind(now(), id).run();
  switch (b.action) {
    case "party.save": {
      const name = str(b.name, 200);
      if (!name) return { ok: false, error: "Scrie numele părții." };
      const v = [str(b.role, 60) ?? "Altă parte", name, str(b.address), str(b.phone, 40), str(b.email, 160), str(b.lawyer, 200), str(b.note, 600)];
      if (rid) await db.prepare("UPDATE expert_case_parties SET role = ?, name = ?, address = ?, phone = ?, email = ?, lawyer = ?, note = ? WHERE id = ? AND case_id = ?").bind(...v, rid, id).run();
      else await db.prepare("INSERT INTO expert_case_parties (id, case_id, role, name, address, phone, email, lawyer, note, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, (SELECT COALESCE(MAX(position), -1) + 1 FROM expert_case_parties WHERE case_id = ?))")
        .bind(uuid(), id, ...v, id).run();
      break;
    }
    case "party.delete": await db.prepare("DELETE FROM expert_case_parties WHERE id = ? AND case_id = ?").bind(rid, id).run(); break;
    case "term.save": {
      const on = date(b.on_date), kind = TERM_KINDS.some(([k]) => k === b.kind) ? (b.kind as string) : "eveniment";
      if (!on) return { ok: false, error: "Alege data termenului." };
      const title = str(b.title, 160) ?? TERM_KINDS.find(([k]) => k === kind)![1];
      if (rid) await db.prepare("UPDATE expert_case_terms SET on_date = ?, at_time = ?, kind = ?, title = ?, note = ?, done = ?, result = ? WHERE id = ? AND case_id = ?")
        .bind(on, time(b.at_time), kind, title, str(b.note, 600), b.done ? 1 : 0, str(b.result, 600), rid, id).run();
      else {
        const stmts = [termStmt(db, id, { on_date: on, at_time: time(b.at_time), kind, title, note: str(b.note, 600), done: b.done ? 1 : 0 })];
        // with a hearing: the day by which the report has to be filed
        const before = (await getExpertPrefs(db, ownerId)).file_before;
        if (kind === "judecata" && b.with_filing) stmts.push(termStmt(db, id, { on_date: minus(on, before), kind: "depunere", title: "Limită depunere raport", note: `cu ${before} zile înainte de termenul din ${on.split("-").reverse().join(".")}` }));
        await db.batch(stmts);
      }
      break;
    }
    case "term.done": await db.prepare("UPDATE expert_case_terms SET done = ?, result = COALESCE(?, result) WHERE id = ? AND case_id = ?").bind(b.done === false ? 0 : 1, str(b.result, 600), rid, id).run(); break;
    case "term.delete": await db.prepare("DELETE FROM expert_case_terms WHERE id = ? AND case_id = ?").bind(rid, id).run(); break;
    case "summon.save": {
      const to = str(b.to_name, 200);
      if (!to) return { ok: false, error: "Scrie cine este convocat." };
      const v = [to, str(b.method, 120) ?? SUMMON_METHODS[0], date(b.sent_on), date(b.confirmed_on), str(b.proof, 400)];
      if (rid) await db.prepare("UPDATE expert_case_summons SET to_name = ?, method = ?, sent_on = ?, confirmed_on = ?, proof = ? WHERE id = ? AND case_id = ?").bind(...v, rid, id).run();
      else await db.prepare("INSERT INTO expert_case_summons (id, case_id, to_name, method, sent_on, confirmed_on, proof, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(uuid(), id, ...v, now()).run();
      break;
    }
    /** one line per party not summoned yet, the same way and day */
    case "summon.all": {
      const { results } = await db.prepare("SELECT name FROM expert_case_parties p WHERE p.case_id = ?1 AND NOT EXISTS (SELECT 1 FROM expert_case_summons s WHERE s.case_id = ?1 AND s.to_name = p.name) ORDER BY p.position").bind(id).all<{ name: string }>();
      if (!results.length) return { ok: false, error: "Toate părțile au deja o convocare." };
      await db.batch(results.map((p) => db.prepare("INSERT INTO expert_case_summons (id, case_id, to_name, method, sent_on, created_at) VALUES (?, ?, ?, ?, ?, ?)").bind(uuid(), id, p.name, str(b.method, 120) ?? SUMMON_METHODS[0], date(b.sent_on), now())));
      break;
    }
    case "summon.delete": await db.prepare("DELETE FROM expert_case_summons WHERE id = ? AND case_id = ?").bind(rid, id).run(); break;
    case "folder.add": {
      const name = str(b.name, 80);
      if (!name) return { ok: false, error: "Scrie numele folderului." };
      if (await db.prepare("SELECT 1 FROM expert_case_folders WHERE case_id = ? AND name = ? COLLATE NOCASE").bind(id, name).first()) return { ok: false, error: "Există deja un folder cu acest nume." };
      const fid = uuid();
      await db.prepare("INSERT INTO expert_case_folders (id, case_id, name, preset, position) VALUES (?, ?, ?, 0, (SELECT COALESCE(MAX(position), -1) + 1 FROM expert_case_folders WHERE case_id = ?))").bind(fid, id, name, id).run();
      await touch();
      return { ok: true, id: fid };
    }
    case "folder.rename": {
      const name = str(b.name, 80);
      if (!name) return { ok: false, error: "Scrie numele folderului." };
      await db.prepare("UPDATE expert_case_folders SET name = ? WHERE id = ? AND case_id = ? AND preset = 0").bind(name, rid, id).run();
      break;
    }
    case "folder.delete": {
      const n = await db.prepare("SELECT COUNT(*) AS n FROM expert_case_docs WHERE case_id = ? AND folder_id = ?").bind(id, rid).first<{ n: number }>();
      if (n?.n) return { ok: false, error: "Folderul are fișiere. Mută-le sau șterge-le întâi." };
      const r = await db.prepare("DELETE FROM expert_case_folders WHERE id = ? AND case_id = ? AND preset = 0").bind(rid, id).run();
      if (!r.meta.changes) return { ok: false, error: "Folderele predefinite nu se șterg." };
      break;
    }
    case "doc.move": {
      const d = await db.prepare("SELECT filename, folder_id FROM expert_case_docs WHERE id = ? AND case_id = ?").bind(rid, id).first<{ filename: string; folder_id: string }>();
      const to = await db.prepare("SELECT id FROM expert_case_folders WHERE id = ? AND case_id = ?").bind(String(b.folder_id ?? ""), id).first<{ id: string }>();
      if (!d || !to) return { ok: false, error: "Fișierul sau folderul nu există." };
      if (await db.prepare("SELECT 1 FROM expert_case_docs WHERE case_id = ? AND folder_id = ? AND filename = ? COLLATE NOCASE").bind(id, to.id, d.filename).first()) return { ok: false, error: "În acel folder există deja un fișier cu același nume." };
      // every version of the file moves with it
      await db.prepare("UPDATE expert_case_docs SET folder_id = ? WHERE case_id = ? AND folder_id = ? AND filename = ? COLLATE NOCASE").bind(to.id, id, d.folder_id, d.filename).run();
      break;
    }
    /** one version, or (all: true) the file with all its versions */
    case "doc.delete": {
      const d = await db.prepare("SELECT filename, folder_id, current FROM expert_case_docs WHERE id = ? AND case_id = ?").bind(rid, id).first<{ filename: string; folder_id: string; current: number }>();
      if (!d) return { ok: false, error: "Fișierul nu există." };
      const { results } = b.all
        ? await db.prepare("SELECT id, r2_key FROM expert_case_docs WHERE case_id = ? AND folder_id = ? AND filename = ? COLLATE NOCASE").bind(id, d.folder_id, d.filename).all<{ id: string; r2_key: string }>()
        : await db.prepare("SELECT id, r2_key FROM expert_case_docs WHERE id = ?").bind(rid).all<{ id: string; r2_key: string }>();
      const r2 = await bucket();
      if (r2) await r2.delete(results.map((x) => x.r2_key)).catch(() => {});
      await db.batch(results.map((x) => db.prepare("DELETE FROM expert_case_docs WHERE id = ?").bind(x.id)));
      // the newest version left becomes the current one
      if (!b.all && d.current) await db.prepare(`UPDATE expert_case_docs SET current = 1 WHERE id = (SELECT id FROM expert_case_docs WHERE case_id = ? AND folder_id = ? AND filename = ? COLLATE NOCASE ORDER BY version DESC LIMIT 1)`).bind(id, d.folder_id, d.filename).run();
      break;
    }
    case "portal.monitor": await db.prepare("UPDATE expert_cases SET monitor = ? WHERE id = ?").bind(b.on ? 1 : 0, id).run(); break;
    /** „Am verificat dosarul electronic”: the news of the portal are no longer told */
    case "portal.ack": await db.prepare("UPDATE expert_cases SET portal_ack_at = ? WHERE id = ?").bind(now(), id).run(); break;
    case "portal.sync": {
      const r = await syncCase(db, c, (await getExpertPrefs(db, ownerId)).file_before);
      if (!r.ok) return { ok: false, error: r.error };
      break;
    }
    default: return { ok: false, error: "Acțiune necunoscută." };
  }
  await touch();
  return { ok: true };
}

// ---------------------------------------------------------------- files

/** A file into a folder; one with the same name there becomes its older version. */
export async function addDoc(db: D1Database, ownerId: string, id: string, folderId: string, file: File) {
  const c = await getCase(db, ownerId, id);
  const folder = c ? await db.prepare("SELECT id FROM expert_case_folders WHERE id = ? AND case_id = ?").bind(folderId, id).first<{ id: string }>() : null;
  const r2 = await bucket();
  if (!c || !folder) return { ok: false as const, error: "Dosarul sau folderul nu există." };
  if (!r2) return { ok: false as const, error: "Stocarea fișierelor nu este disponibilă." };
  if (!file.size) return { ok: false as const, error: "Fișierul este gol." };
  if (file.size > MAX_FILE) return { ok: false as const, error: `„${file.name}” depășește ${MAX_FILE / 1024 / 1024} MB.` };
  const name = file.name.replace(/[\\/\u0000-\u001f]/g, "_").slice(-160) || "document";
  const last = await db.prepare("SELECT MAX(version) AS v FROM expert_case_docs WHERE case_id = ? AND folder_id = ? AND filename = ? COLLATE NOCASE").bind(id, folderId, name).first<{ v: number | null }>();
  const docId = uuid(), key = `expertize/${ownerId}/${id}/${docId}-${name.replace(/[^\w.\-() ]/g, "_")}`;
  await r2.put(key, await file.arrayBuffer(), { customMetadata: { expertCase: id, owner: ownerId } });
  await db.batch([
    db.prepare("UPDATE expert_case_docs SET current = 0 WHERE case_id = ? AND folder_id = ? AND filename = ? COLLATE NOCASE").bind(id, folderId, name),
    db.prepare("INSERT INTO expert_case_docs (id, case_id, folder_id, filename, size_bytes, r2_key, version, current, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)").bind(docId, id, folderId, name, file.size, key, (last?.v ?? 0) + 1, now()),
    db.prepare("UPDATE expert_cases SET updated_at = ? WHERE id = ?").bind(now(), id),
  ]);
  return { ok: true as const, id: docId, version: (last?.v ?? 0) + 1 };
}

/** A file of a case of this expert, to send back. */
export async function docFile(db: D1Database, ownerId: string, id: string, docId: string) {
  const d = await db.prepare("SELECT d.filename, d.r2_key FROM expert_case_docs d JOIN expert_cases c ON c.id = d.case_id WHERE d.id = ? AND d.case_id = ? AND c.owner_id = ?").bind(docId, id, ownerId)
    .first<{ filename: string; r2_key: string }>();
  const obj = d ? await (await bucket())?.get(d.r2_key) : null;
  return d && obj ? { name: d.filename, body: obj.body } : null;
}

// ---------------------------------------------------------------- reminders (the bell, the phone, email)

export type TermNotice = { id: string; at: string; title: string; sub: string; caseId: string; email: boolean };

/** The open terms of this expert that are near: told on the days they chose (by default 7, 3 and 1 day before and on the day; 8:00, Romanian time) and once more when overdue; and the portal's news. */
export async function termNotices(db: D1Database, u: { id: string; judicial_expert?: number | null; kind?: string; impersonator?: unknown }): Promise<TermNotice[]> {
  if (!isExpert(u)) return [];
  const prefs = await getExpertPrefs(db, u.id);
  const REMIND_DAYS = prefs.remind, email = prefs.email;
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Bucharest" });
  const until = minus(today, -Math.max(0, ...REMIND_DAYS));
  const { results } = await db.prepare(`SELECT t.id, t.on_date, t.at_time, t.title, c.id AS case_id, c.number, c.court FROM expert_case_terms t JOIN expert_cases c ON c.id = t.case_id
    WHERE c.owner_id = ? AND t.done = 0 AND c.stage < ${DONE_STAGE} AND t.on_date <= ? AND t.on_date >= ? ORDER BY t.on_date`).bind(u.id, until, minus(today, 30))
    .all<{ id: string; on_date: string; at_time: string | null; title: string; case_id: string; number: string; court: string | null }>();
  const out: TermNotice[] = [];
  const ro = (d: string) => d.split("-").reverse().join(".");
  // 8:00 in Romania on a day (06:00 UTC covers both summer and winter closely enough for a reminder)
  const morning = (d: string) => `${d}T06:00:00.000Z`;
  for (const t of results) {
    const left = Math.round((Date.parse(`${t.on_date}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 864e5);
    const sub = [`dosar ${t.number}`, t.court, `${ro(t.on_date)}${t.at_time ? `, ora ${t.at_time}` : ""}`].filter(Boolean).join(" · ");
    if (left < 0) { if (prefs.overdue) out.push({ id: `xt${t.id}late`, at: morning(minus(t.on_date, -1)), title: `Termen depășit: ${t.title}`, sub, caseId: t.case_id, email }); continue; }
    // the latest reminder already due
    const step = REMIND_DAYS.filter((d) => d >= left).sort((a, b) => a - b)[0];
    if (step == null) continue;
    const when = left === 0 ? "astăzi" : left === 1 ? "mâine" : `în ${left} zile`;
    out.push({ id: `xt${t.id}d${step}`, at: morning(minus(t.on_date, step)), title: `${t.title} ${when}`, sub, caseId: t.case_id, email });
  }
  // news from the portal not looked at yet: the expert checks the electronic file, in case something is theirs to do
  const news = !prefs.portal ? { results: [] as { id: string; number: string; at: string; what: string | null }[] } : await db.prepare(`SELECT id, number, portal_changed_at AS at, portal_change AS what FROM expert_cases
    WHERE owner_id = ? AND portal_changed_at IS NOT NULL AND portal_changed_at > COALESCE(portal_ack_at, '') AND portal_changed_at > ?`).bind(u.id, new Date(Date.now() - 30 * 864e5).toISOString())
    .all<{ id: string; number: string; at: string; what: string | null }>().catch(() => ({ results: [] as { id: string; number: string; at: string; what: string | null }[] }));
  for (const n of news.results) out.push({ id: `xp${n.id}${n.at}`, at: n.at, title: `Dosar ${n.number}: noutăți pe portal · verifică dosarul electronic`, sub: (n.what ?? "").split("\n").join(" · ").slice(0, 200), caseId: n.id, email });
  return out.filter((n) => Date.parse(n.at) <= Date.now());
}
