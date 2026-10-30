// Server-only: public procurement notices from SEAP / SICAP (e-licitatie.ro) for valuations (town halls and other
// institutions in Timiș, Cluj and the counties around). Read every morning (worker.ts → scheduled) and on demand,
// filtered by the firm's criteria (Licitații → Criterii), kept in `tenders`, followed in the CRM.
//
// SICAP has no documented API: the public site calls JSON endpoints, used here the same way. Their answers are read
// defensively (several possible field names) and the last run keeps a sample, so a change shows on the page.
import { now, uuid } from "./db";
import { esc, layout, sendEmail } from "./email";

export type TenderRules = {
  enabled: boolean;
  cpv: string[];        // CPV code prefixes, e.g. 79419 (consultanță în evaluare)
  keywords: string[];   // in the title (lower case, without diacritics when compared)
  counties: string[];   // county of the contracting authority
  minValue: number | null;
  direct: boolean;      // also direct acquisitions (contracts awarded without a call for bids)
  emails: string[];     // the morning digest
};

export const DEFAULT_RULES: TenderRules = {
  enabled: true,
  cpv: ["79419", "71319"],
  keywords: ["evaluare", "evaluator", "anevar", "raport de evaluare", "expertiza tehnica"],
  counties: ["Timiș", "Cluj", "Arad", "Bihor", "Caraș-Severin", "Hunedoara", "Alba", "Sălaj", "Mureș", "Bistrița-Năsăud"],
  minValue: null,
  direct: false,
  emails: [],
};

export const TENDER_STATUS: Record<string, [string, string]> = {
  new: ["Nouă", "pillInfo"], analyze: ["De analizat", "pillWarn"], bid: ["Participăm", "pillOk"], skip: ["Nu ne interesează", ""],
};

const plain = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ş/g, "s").replace(/ţ/g, "t");

export async function getRules(db: D1Database): Promise<TenderRules> {
  const row = await db.prepare("SELECT value FROM settings WHERE key = 'tenders'").first<{ value: string }>().catch(() => null);
  try { return { ...DEFAULT_RULES, ...(row ? (JSON.parse(row.value) as Partial<TenderRules>) : {}) }; } catch { return DEFAULT_RULES; }
}

export async function saveRules(db: D1Database, r: TenderRules, userId: string) {
  await db.prepare("INSERT INTO settings (key, value, updated_at, updated_by) VALUES ('tenders', ?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by")
    .bind(JSON.stringify(r), now(), userId).run();
}

/** `found`: matched the CPV / words before the county filter; `elsewhere`: of those, from counties outside the list. */
export type RunInfo = { at: string; ok: boolean; error: string | null; fetched: number; matched: number; added: number; sample: string | null; found?: number; elsewhere?: number };

const ALL_COUNTIES = ["Alba", "Arad", "Argeș", "Bacău", "Bihor", "Bistrița-Năsăud", "Botoșani", "Brașov", "Brăila", "București", "Buzău", "Caraș-Severin", "Călărași",
  "Cluj", "Constanța", "Covasna", "Dâmbovița", "Dolj", "Galați", "Giurgiu", "Gorj", "Harghita", "Hunedoara", "Ialomița", "Iași", "Ilfov", "Maramureș", "Mehedinți",
  "Mureș", "Neamț", "Olt", "Prahova", "Satu Mare", "Sălaj", "Sibiu", "Suceava", "Teleorman", "Timiș", "Tulcea", "Vaslui", "Vâlcea", "Vrancea"];
export async function lastRun(db: D1Database): Promise<RunInfo | null> {
  const row = await db.prepare("SELECT value FROM settings WHERE key = 'tenders_run'").first<{ value: string }>().catch(() => null);
  try { return row ? (JSON.parse(row.value) as RunInfo) : null; } catch { return null; }
}

// ---------- SICAP ----------

const BASE = "https://www.e-licitatie.ro";
type Raw = Record<string, unknown>;
type Item = { kind: "notice" | "direct"; ext: string; no: string | null; title: string; authority: string | null; cpv: string | null; value: number | null;
  published: string | null; deadline: string | null; procedure: string | null; url: string; raw: Raw };

const pick = (o: Raw, ...keys: string[]) => { for (const k of keys) { const v = o[k]; if (v !== undefined && v !== null && v !== "") return v; } return null; };
const str = (v: unknown) => (v == null ? null : typeof v === "object" ? (((v as Raw).text ?? (v as Raw).name) as string | undefined) ?? null : String(v).trim() || null);
const numv = (v: unknown) => { const n = typeof v === "number" ? v : Number(String(v ?? "").replace(/[^\d.,-]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", ".")); return Number.isFinite(n) && n > 0 ? n : null; };

async function post(path: string, body: unknown): Promise<Raw> {
  const r = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json;charset=UTF-8", Accept: "application/json, text/plain, */*", Referer: `${BASE}/pub`, "User-Agent": "Mozilla/5.0 (VALUEFY CRM; licitatii)" },
    body: JSON.stringify(body),
  }).catch((e) => { throw new Error(`Nu am putut ajunge la SEAP (e-licitatie.ro): ${e instanceof Error ? e.message : e}.`); });
  if (!r.ok) throw new Error(`SEAP a răspuns ${r.status} la ${path}`);
  const text = await r.text();
  try { return JSON.parse(text) as Raw; } catch { throw new Error(`SEAP nu a răspuns cu date (${path}): ${text.slice(0, 120)}`); }
}

const list = (d: Raw) => (Array.isArray(d.items) ? d.items : Array.isArray(d.Items) ? d.Items : Array.isArray(d) ? d : []) as Raw[];

/** Calls for bids (anunțuri de participare, incl. procedura simplificată) published in [from, to]. */
async function notices(from: string, to: string): Promise<Item[]> {
  const out: Item[] = [];
  for (let page = 0; page < 20; page++) {
    const d = await post("/api-pub/NoticeCommon/GetCNoticeList/", {
      sysNoticeTypeIds: [], sortProperties: [], pageSize: 100, hasUnansweredQuestions: false,
      startPublicationDate: from, endPublicationDate: to, sysProcedureStateId: null, cPVCategoryId: null, cPVId: null, pageIndex: page,
    });
    const items = list(d);
    for (const x of items) {
      const id = str(pick(x, "caNoticeId", "cNoticeId", "noticeId", "id"));
      if (!id) continue;
      out.push({
        kind: "notice", ext: id, no: str(pick(x, "noticeNo", "noticeNumber")), title: str(pick(x, "contractTitle", "title", "contractName")) ?? "(fără titlu)",
        authority: str(pick(x, "contractingAuthorityNameAndFN", "contractingAuthorityName", "contractingAuthority")),
        cpv: str(pick(x, "cpvCodeAndName", "cpvCode", "mainCpvCode")), value: numv(pick(x, "estimatedValueRon", "estimatedValue", "ronContractValue")),
        published: str(pick(x, "noticeStateDate", "publicationDate", "noticePublicationDate")), deadline: str(pick(x, "tenderReceiptDeadline", "tenderReceiptDeadlineExport", "deadline")),
        procedure: [str(pick(x, "sysProcedureType")), str(pick(x, "sysProcedureState"))].filter(Boolean).join(" · ") || null,
        url: `${BASE}/pub/notices/c-notice/v2/view/${id}`, raw: x,
      });
    }
    const total = Number(pick(d, "total", "Total") ?? 0);
    if (items.length < 100 || (total && out.length >= total)) break;
  }
  return out;
}

/** Direct acquisitions published in [from, to] (already awarded: who buys valuations, for how much). */
async function directs(from: string, to: string): Promise<Item[]> {
  const out: Item[] = [];
  for (let page = 0; page < 20; page++) {
    const d = await post("/api-pub/DirectAcquisitionCommon/GetDirectAcquisitionList/", {
      pageSize: 100, pageIndex: page, showOngoingDa: false, cookieContext: null, sysDirectAcquisitionStateId: null,
      publicationDateStart: from, publicationDateEnd: to, finalizationDateStart: null, finalizationDateEnd: null, cpvCodeId: null,
    });
    const items = list(d);
    for (const x of items) {
      const id = str(pick(x, "directAcquisitionId", "id"));
      if (!id) continue;
      out.push({
        kind: "direct", ext: id, no: str(pick(x, "uniqueIdentificationCode", "noticeNo")), title: str(pick(x, "directAcquisitionName", "name", "title")) ?? "(fără titlu)",
        authority: str(pick(x, "contractingAuthority", "contractingAuthorityName")), cpv: str(pick(x, "cpvCode", "cpvCodeAndName")),
        value: numv(pick(x, "estimatedValueRon", "closingValue", "estimatedValue")), published: str(pick(x, "publicationDate")), deadline: null,
        procedure: str(pick(x, "sysDirectAcquisitionState")), url: `${BASE}/pub/direct-acquisition/view/${id}`, raw: x,
      });
    }
    if (items.length < 100) break;
  }
  return out;
}

/**
 * The county of the authority: from its name or the title, else from the notice details (address). `null` when it
 * cannot be told (a commune's name rarely says it): such a notice is kept, not lost.
 */
async function countyOf(it: Item): Promise<string | null> {
  const find = (text: string) => {
    const t = ` ${plain(text).replace(/[^a-z0-9]+/g, " ")} `;
    return ALL_COUNTIES.find((c) => t.includes(` ${plain(c).replace(/[^a-z0-9]+/g, " ")} `) || (plain(c) === "timis" && t.includes(" timisoara "))) ?? null;
  };
  const inName = find(`${it.authority ?? ""} ${it.title}`);
  if (inName || it.kind !== "notice") return inName;
  for (const path of [`/api-pub/C_PUBLIC_CNotice/get/${it.ext}`, `/api-pub/C_PUBLIC_CANotice/get/${it.ext}`]) {
    try {
      const r = await fetch(`${BASE}${path}`, { headers: { Accept: "application/json", Referer: `${BASE}/pub`, "User-Agent": "Mozilla/5.0 (VALUEFY CRM; licitatii)" } });
      if (r.ok) { const c = find(await r.text()); if (c) return c; }
    } catch { /* the list is enough */ }
  }
  return null;
}

function matches(it: Item, r: TenderRules): string | null {
  const t = plain(`${it.title} ${it.cpv ?? ""}`);
  const cpv = (it.cpv ?? "").replace(/\D/g, "");
  const byCpv = r.cpv.find((c) => c && cpv.startsWith(c.replace(/\D/g, "")));
  const byWord = r.keywords.find((k) => k && t.includes(plain(k)));
  if (!byCpv && !byWord) return null;
  if (r.minValue && it.value != null && it.value < r.minValue) return null;
  return [byCpv && `CPV ${byCpv}`, byWord && `„${byWord}”`].filter(Boolean).join(" · ");
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/** Reads SICAP for the last `days` days, keeps what matches the criteria. Returns the new notices. */
export async function runTenders(db: D1Database, days = 2, force = false) {
  const r = await getRules(db);
  const to = new Date(), from = new Date(Date.now() - days * 864e5);
  const info: RunInfo = { at: now(), ok: false, error: null, fetched: 0, matched: 0, added: 0, sample: null };
  const added: { title: string; authority: string | null; county: string | null; deadline: string | null; value: number | null; url: string }[] = [];
  if (!r.enabled && !force) return { info: { ...info, ok: true, error: "Alertele SEAP sunt oprite." }, added, rules: r };
  try {
    const items = [...(await notices(`${isoDay(from)}T00:00:00.000Z`, `${isoDay(to)}T23:59:59.000Z`)),
      ...(r.direct ? await directs(`${isoDay(from)}T00:00:00.000Z`, `${isoDay(to)}T23:59:59.000Z`) : [])];
    info.fetched = items.length;
    info.sample = items[0] ? JSON.stringify(items[0].raw).slice(0, 1500) : null;
    for (const it of items) {
      const reason = matches(it, r);
      if (!reason) continue;
      info.found = (info.found ?? 0) + 1;
      // out only when it is surely from another county; when the county cannot be told, kept for a look
      const county = await countyOf(it);
      if (r.counties.length && county && !r.counties.some((c) => plain(c) === plain(county))) { info.elsewhere = (info.elsewhere ?? 0) + 1; continue; }
      info.matched++;
      const res = await db.prepare(
        `INSERT INTO tenders (id, kind, ext_id, notice_no, title, authority, county, cpv, value_ron, published_at, deadline_at, procedure, url, match_reason, raw)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(source, kind, ext_id) DO UPDATE SET deadline_at = excluded.deadline_at, procedure = excluded.procedure, value_ron = COALESCE(excluded.value_ron, value_ron), updated_at = excluded.updated_at`,
      ).bind(uuid(), it.kind, it.ext, it.no, it.title, it.authority, county, it.cpv, it.value, it.published, it.deadline, it.procedure, it.url, reason, JSON.stringify(it.raw).slice(0, 20000)).run();
      // A new row: created_at = updated_at (an update changes only updated_at).
      const row = await db.prepare("SELECT created_at = updated_at AS fresh FROM tenders WHERE source = 'sicap' AND kind = ? AND ext_id = ?").bind(it.kind, it.ext).first<{ fresh: number }>();
      if (res.meta.changes && row?.fresh) { info.added++; added.push({ title: it.title, authority: it.authority, county, deadline: it.deadline, value: it.value, url: it.url }); }
    }
    info.ok = true;
  } catch (e) {
    info.error = e instanceof Error ? e.message : String(e);
  }
  await db.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('tenders_run', ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
    .bind(JSON.stringify(info), now()).run();
  return { info, added, rules: r };
}

export type TenderRow = { id: string; kind: string; notice_no: string | null; title: string; authority: string | null; county: string | null; cpv: string | null;
  value_ron: number | null; published_at: string | null; deadline_at: string | null; procedure: string | null; url: string | null; match_reason: string | null;
  status: string; notes: string | null; created_at: string };

export async function listTenders(db: D1Database, status: string) {
  const where = status === "all" ? "1 = 1" : status === "open" ? "status IN ('new', 'analyze', 'bid')" : "status = ?";
  const q = db.prepare(`SELECT id, kind, notice_no, title, authority, county, cpv, value_ron, published_at, deadline_at, procedure, url, match_reason, status, notes, created_at
    FROM tenders WHERE ${where} ORDER BY COALESCE(published_at, created_at) DESC LIMIT 300`);
  const { results } = await (where.includes("?") ? q.bind(status) : q).all<TenderRow>();
  const counts = await db.prepare("SELECT status, COUNT(*) AS n FROM tenders GROUP BY status").all<{ status: string; n: number }>();
  return { rows: results, counts: Object.fromEntries(counts.results.map((c) => [c.status, c.n])) as Record<string, number> };
}

/** The morning email: the new notices that match. */
export async function sendTenderDigest(added: Awaited<ReturnType<typeof runTenders>>["added"], rules: TenderRules, crmUrl: string) {
  if (!added.length || !rules.emails.length) return;
  const lei = (n: number | null) => (n == null ? "" : `${Math.round(n).toLocaleString("ro-RO")} lei`);
  const day = (s: string | null) => (s ? s.slice(0, 10).split("-").reverse().join(".") : "");
  const rows = added.map((a) => `<tr><td style="padding:10px 0;border-top:1px solid #eee"><a href="${esc(a.url)}" style="color:#111;font-weight:700">${esc(a.title)}</a><br>
    <span style="color:#666;font-size:13px">${esc([a.authority, a.county].filter(Boolean).join(" · "))}${a.value ? ` · ${esc(lei(a.value))}` : ""}${a.deadline ? ` · termen ${esc(day(a.deadline))}` : ""}</span></td></tr>`).join("");
  const text = added.map((a) => `- ${a.title} (${[a.authority, a.county, lei(a.value), a.deadline && `termen ${day(a.deadline)}`].filter(Boolean).join(", ")})\n  ${a.url}`).join("\n");
  for (const to of rules.emails) {
    await sendEmail({
      to, subject: `SEAP: ${added.length === 1 ? "o licitație nouă" : `${added.length} licitații noi`} de evaluare`,
      text: `Licitații noi pe SEAP care se potrivesc criteriilor:\n\n${text}\n\nToate în CRM: ${crmUrl}/licitatii`,
      html: layout({
        eyebrow: "CRM VALUEFY · LICITAȚII SEAP", title: added.length === 1 ? "O licitație nouă" : `${added.length} licitații noi`,
        body: `<table style="width:100%;border-collapse:collapse;font-size:14px">${rows}</table>`,
        button: { label: "Deschide în CRM →", url: `${crmUrl}/licitatii` }, foot: "Primești acest email pentru că ești în lista de alerte SEAP din CRM (Licitații → Criterii).",
      }),
    }).catch(() => false);
  }
}
