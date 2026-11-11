// Server-only: the signed final reports read by a cheap model (Claude Haiku 5.5) into Markdown, easy to search and to
// hand to an agent, with their key facts as JSON (values, approach, assets, comparables, special assumptions). Run as a
// Message Batch (half the price; the result comes in minutes to hours): `submitReading` sends the batch, `syncReadings`
// brings in what is ready. Personal data are left out of the text (CNP, ID card, phone, e-mail; people by initials).
import Anthropic from "@anthropic-ai/sdk";
import { now } from "./db";
import { bucket } from "./orders";

export const mdEnabled = () => !!process.env.ANTHROPIC_API_KEY;
/** The model: Claude Haiku 5.5 (the cheapest); MD_MODEL can switch it. */
const model = () => process.env.MD_MODEL?.trim() || "claude-haiku-5-5";
// base64 grows a file by a third: 15 MB stays well under the 32 MB of a request (and the worker's memory)
const MAX_BYTES = 15_000_000;

/** USD per million tokens (Claude Haiku 5.5: up to 100K input tokens, and beyond), before the batch discount (half). */
const PRICE = { small: { in: 0.1, out: 0.5 }, large: { in: 0.5, out: 2.5 } };
export const costOf = (input: number, output: number) => {
  const p = input <= 100_000 ? PRICE.small : PRICE.large;
  return ((input * p.in + output * p.out) / 1e6) * 0.5;
};

const str = { type: ["string", "null"] } as const;
const num = { type: ["number", "null"] } as const;
const obj = (properties: Record<string, unknown>) => ({ type: "object", properties, required: Object.keys(properties), additionalProperties: false });
/** What comes back: the Markdown and the facts (null where the report does not say). */
const SCHEMA = obj({
  markdown: { type: "string" },
  facts: obj({
    numar_raport: str, data_raport: str, data_evaluarii: str, scop: str, tip_valoare: str, banca: str, client_tip: str,
    moneda: str, curs_eur: num, valoare_finala: num, valoare_finala_eur: num, abordare_principala: str, evaluator: str,
    bunuri: { type: "array", items: obj({ tip: str, adresa: str, localitate: str, judet: str, cf: str, nr_cadastral: str, suprafata_utila: num, suprafata_teren: num, an_constructie: num, valoare: num, abordare: str }) },
    comparabile: { type: "array", items: obj({ tip: str, adresa: str, suprafata: num, pret: num, moneda: str, pret_mp: num, sursa: str, data: str }) },
    ipoteze_speciale: { type: "array", items: { type: "string" } },
  }),
});

const PROMPT = `Documentul atașat este un raport de evaluare imobiliară (ANEVAR), PDF-ul final semnat.

1. „markdown”: tot raportul ca Markdown curat, ușor de citit și de căutat:
   - titluri (#, ##, ###) după capitolele și subcapitolele raportului;
   - tabelele ca tabele Markdown, cu cifrele exact ca în raport (fără rotunjiri, fără calcule noi);
   - fără antetele și subsolurile repetate pe fiecare pagină, fără numerotarea paginilor;
   - fotografiile și anexele foto doar pomenite: „[Anexă foto: N pagini]”; schițele, hărțile, extrasele CF scanate: un rând cu ce sunt;
   - date personale scoase: CNP, seria și numărul actului de identitate, telefon, e-mail → „[anonimizat]”; numele persoanelor fizice → inițiale (ex. „P. A.”); firmele, băncile, evaluatorii și adresele proprietăților rămân.
2. „facts”: datele cheie, doar cum scrie în raport (null unde nu scrie): data raportului și a evaluării ca AAAA-LL-ZZ, moneda (RON sau EUR), valoarea finală și echivalentul în euro, abordarea principală, fiecare bun evaluat cu suprafețele și valoarea lui, comparabilele folosite (cu preț, preț/m² și sursa), ipotezele speciale. client_tip: „persoană fizică” sau „persoană juridică”.`;

async function pdfOf(key: string) {
  const obj = await (await bucket())?.get(key);
  if (!obj) return null;
  const bytes = new Uint8Array(await obj.arrayBuffer());
  // the pages, roughly (the page objects of the PDF)
  const pages = (new TextDecoder("latin1").decode(bytes).match(/\/Type\s*\/Page(?!s)/g) ?? []).length || null;
  return { data: Buffer.from(bytes).toString("base64"), size: bytes.byteLength, pages };
}

/** The finished reports with a signed final PDF not read yet, newest first. */
export async function readable(db: D1Database, limit: number) {
  const { results } = await db.prepare(`SELECT r.id, r.number, d.id AS doc_id, d.r2_key, d.size_bytes, d.filename FROM reports r
      JOIN report_documents d ON d.id = (SELECT x.id FROM report_documents x WHERE x.report_id = r.id AND x.kind = 'final' AND x.status = 'uploaded' AND x.r2_key IS NOT NULL ORDER BY x.created_at DESC LIMIT 1)
      WHERE r.status = 'done' AND NOT EXISTS (SELECT 1 FROM report_markdown m WHERE m.report_id = r.id AND m.status IN ('queued', 'done'))
        AND COALESCE(d.size_bytes, 0) <= ? ORDER BY COALESCE(r.delivered_at, r.updated_at) DESC LIMIT ?`).bind(MAX_BYTES, limit)
    .all<{ id: string; number: string | null; doc_id: string; r2_key: string; size_bytes: number | null; filename: string }>();
  return results;
}

/**
 * Sends the reading of `limit` finished reports (or of the ones given): one small batch per report, one after the other
 * (a worker has little memory: one PDF at a time), each at the batch price.
 */
export async function submitReading(db: D1Database, actor: string, opts: { limit?: number; reports?: string[] } = {}) {
  const all = await readable(db, opts.reports?.length ? 500 : opts.limit ?? 10);
  const list = opts.reports?.length ? all.filter((r) => opts.reports!.includes(r.id)) : all;
  if (!list.length) return { ok: false as const, error: "Niciun raport finalizat cu PDF semnat de citit." };
  const client = new Anthropic();
  const m = model();
  let sent = 0;
  const skipped: string[] = [];
  for (const r of list) {
    const pdf = await pdfOf(r.r2_key);
    if (!pdf || pdf.size > MAX_BYTES) { skipped.push(r.number ?? r.id); continue; }
    const batch = await client.messages.batches.create({ requests: [{
      custom_id: r.id,
      params: {
        model: m,
        max_tokens: 64000,
        output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
        messages: [{ role: "user", content: [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdf.data } },
          { type: "text", text: PROMPT },
        ] }],
      },
    }] });
    const t = now();
    await db.prepare(`INSERT INTO report_markdown (report_id, doc_id, model, status, batch_id, pages, created_by, created_at, updated_at) VALUES (?, ?, ?, 'queued', ?, ?, ?, ?, ?)
        ON CONFLICT(report_id) DO UPDATE SET doc_id = excluded.doc_id, model = excluded.model, status = 'queued', batch_id = excluded.batch_id, pages = excluded.pages,
          markdown = NULL, facts = NULL, error = NULL, input_tokens = NULL, output_tokens = NULL, cost_usd = NULL, created_by = excluded.created_by, updated_at = excluded.updated_at`)
      .bind(r.id, r.doc_id, m, batch.id, pdf.pages, actor, t, t).run();
    sent++;
  }
  if (!sent) return { ok: false as const, error: "PDF-urile nu au putut fi citite din stocare." };
  return { ok: true as const, sent, skipped };
}

/** Brings in the readings of the batches that have ended. Returns how many are still waiting. */
export async function syncReadings(db: D1Database) {
  const { results } = await db.prepare("SELECT DISTINCT batch_id FROM report_markdown WHERE status = 'queued' AND batch_id IS NOT NULL").all<{ batch_id: string }>();
  if (!results.length) return { waiting: 0, done: 0 };
  const client = new Anthropic();
  let done = 0, waiting = 0;
  for (const { batch_id } of results) {
    const b = await client.messages.batches.retrieve(batch_id);
    if (b.processing_status !== "ended") { waiting += b.request_counts.processing; continue; }
    for await (const res of await client.messages.batches.results(batch_id)) {
      const t = now();
      if (res.result.type !== "succeeded") {
        const why = res.result.type === "errored" ? `${res.result.error.error?.type ?? "eroare"}: ${res.result.error.error?.message ?? ""}`.slice(0, 300) : res.result.type === "expired" ? "a expirat (lotul nu s-a terminat în 24 h)" : "anulat";
        await db.prepare("UPDATE report_markdown SET status = 'error', error = ?, updated_at = ? WHERE report_id = ? AND batch_id = ?").bind(why, t, res.custom_id, batch_id).run();
        continue;
      }
      const msg = res.result.message;
      const input = msg.usage.input_tokens + (msg.usage.cache_read_input_tokens ?? 0) + (msg.usage.cache_creation_input_tokens ?? 0), output = msg.usage.output_tokens;
      const text = msg.content.flatMap((c) => (c.type === "text" ? [c.text] : [])).join("");
      let parsed: { markdown?: string; facts?: unknown } | null = null;
      try { parsed = JSON.parse(text) as { markdown?: string; facts?: unknown }; } catch { /* below */ }
      const error = msg.stop_reason === "refusal" ? "Modelul a refuzat citirea." : msg.stop_reason === "max_tokens" ? "Raportul e prea lung pentru o singură citire (limita de răspuns)." : !parsed?.markdown ? "Răspunsul nu a putut fi citit." : null;
      await db.prepare(`UPDATE report_markdown SET status = ?, markdown = ?, facts = ?, input_tokens = ?, output_tokens = ?, cost_usd = ?, error = ?, updated_at = ? WHERE report_id = ? AND batch_id = ?`)
        .bind(error ? "error" : "done", parsed?.markdown ?? null, parsed?.facts ? JSON.stringify(parsed.facts) : null, input, output, Math.round(costOf(input, output) * 10000) / 10000, error, t, res.custom_id, batch_id).run();
      done++;
    }
  }
  return { waiting, done };
}

export type MdRow = { report_id: string; number: string | null; label: string | null; status: string; model: string; pages: number | null; input_tokens: number | null; output_tokens: number | null;
  cost_usd: number | null; error: string | null; created_at: string; updated_at: string; chars: number | null };

export async function readings(db: D1Database) {
  const { results } = await db.prepare(`SELECT m.report_id, r.number, r.label, m.status, m.model, m.pages, m.input_tokens, m.output_tokens, m.cost_usd, m.error, m.created_at, m.updated_at,
      LENGTH(m.markdown) AS chars FROM report_markdown m JOIN reports r ON r.id = m.report_id ORDER BY m.created_at DESC, r.number DESC LIMIT 200`).all<MdRow>().catch(() => ({ results: [] as MdRow[] }));
  return results;
}
