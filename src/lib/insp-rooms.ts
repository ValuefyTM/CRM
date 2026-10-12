// Server-only: the room list of a property read from its floor survey (releveu, RLV) with Claude — position number,
// name, level and usable area of every room, as the banks want the photos and the inspection sheet labelled
// ("Dormitor · rlv 8"). The inspector checks and completes the list on the phone. Needs ANTHROPIC_API_KEY.
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { bucket } from "./orders";
import type { InspDoc } from "./insp-docs";

const Survey = z.object({
  rooms: z.array(z.object({
    pos: z.string().nullable().describe("Numărul / poziția încăperii în releveu (ex. 1, 2, 8, 1.3); null dacă releveul nu numerotează încăperile"),
    name: z.string().describe("Denumirea încăperii ca în releveu, cu majusculă: Living, Dormitor, Bucătărie, Baie, Hol, Debara, Balcon, Terasă, Birou…"),
    level: z.string().nullable().describe("Nivelul: Subsol, Demisol, Parter, Etaj 1, Etaj 2, Mansardă, Pod; null dacă releveul are un singur nivel fără denumire"),
    area: z.number().nullable().describe("Suprafața încăperii în mp, exact ca în releveu"),
  })).describe("Încăperile, în ordinea din releveu (după nivel, apoi după poziție)"),
  usable_total: z.number().nullable().describe("Suprafața utilă totală din releveu, în mp"),
  note: z.string().nullable().describe("Ce nu s-a putut citi sau ce trebuie verificat la fața locului, pe scurt"),
});
export type SurveyRooms = z.infer<typeof Survey>;

const PROMPT = `Acesta este releveul (planul) unei proprietăți imobiliare din România, folosit la o inspecție pentru evaluare.
Extrage lista încăperilor din tabelul de suprafețe și din desen: numărul de poziție, denumirea, nivelul și suprafața utilă.
Include balcoanele, logiile și terasele dacă apar în releveu. Nu inventa încăperi și nu ghici numere: ce nu se poate citi rămâne null.
Dacă sunt mai multe planuri (un plan pe nivel), listează încăperile tuturor nivelurilor.`;

/** Model for reading the survey: Claude Opus 5.5 by default; ROOMS_MODEL can switch it (e.g. claude-sonnet-5-5). */
const model = () => process.env.ROOMS_MODEL?.trim() || "claude-opus-5-5";
export const roomsEnabled = () => !!process.env.ANTHROPIC_API_KEY;

const MAX_BYTES = 20_000_000;
const IMAGE = /^image\/(png|jpe?g|webp|gif)$/;

/** The bytes of one survey document (R2, or the old Glide URL) and its type. */
async function load(doc: InspDoc): Promise<{ data: ArrayBuffer; type: string } | null> {
  const ext = /\.pdf$/i.test(doc.name) ? "application/pdf" : null;
  if (doc.key) {
    const obj = await (await bucket())?.get(doc.key);
    if (!obj) return null;
    return { data: await obj.arrayBuffer(), type: obj.httpMetadata?.contentType ?? doc.content_type ?? ext ?? "application/pdf" };
  }
  if (!doc.url) return null;
  const res = await fetch(doc.url).catch(() => null);
  if (!res?.ok) return null;
  return { data: await res.arrayBuffer(), type: (res.headers.get("content-type") ?? doc.content_type ?? ext ?? "").split(";")[0] };
}

/** Reads the rooms from the floor surveys of an inspection (all of them: one plan per level is common). */
export async function roomsFromSurvey(docs: InspDoc[]) {
  if (!roomsEnabled()) return { ok: false as const, error: "Citirea automată nu este configurată. Adaugă încăperile manual." };
  const surveys = docs.filter((d) => d.type === "rlv").slice(0, 4);
  if (!surveys.length) return { ok: false as const, error: "Inspecția nu are releveu. Cere-l în CRM sau adaugă încăperile manual." };

  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  let size = 0;
  for (const d of surveys) {
    const f = await load(d);
    if (!f || !f.data.byteLength) continue;
    size += f.data.byteLength;
    if (size > MAX_BYTES) break;
    const data = Buffer.from(f.data).toString("base64");
    const type = f.type.toLowerCase().replace("image/jpg", "image/jpeg");
    if (type === "application/pdf") content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data } });
    else if (IMAGE.test(type)) content.push({ type: "image", source: { type: "base64", media_type: type as "image/png" | "image/jpeg" | "image/webp" | "image/gif", data } });
  }
  if (!content.length) return { ok: false as const, error: "Releveul nu a putut fi deschis (doar PDF sau imagini PNG / JPG). Adaugă încăperile manual." };
  content.push({ type: "text", text: PROMPT });

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  try {
    const res = await client.beta.messages.parse({
      model: model(),
      max_tokens: 16000,
      // Reading a table off a plan needs little reasoning: low effort keeps it quick (a few seconds) and cheap.
      output_config: { effort: "low", format: betaZodOutputFormat(Survey) },
      // If a safety classifier declines, the API retries on a fallback model inside the same call.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      messages: [{ role: "user", content }],
    });
    if (res.stop_reason === "refusal" || !res.parsed_output) return { ok: false as const, error: "Releveul nu a putut fi citit. Adaugă încăperile manual." };
    return { ok: true as const, data: res.parsed_output };
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return { ok: false as const, error: "Serviciul de citire e ocupat. Încearcă din nou peste un minut." };
    if (e instanceof Anthropic.BadRequestError) { console.error("rooms", e.message); return { ok: false as const, error: "Releveul nu a putut fi trimis (format sau mărime). Adaugă încăperile manual." }; }
    if (e instanceof Anthropic.APIError) { console.error("rooms", e.status, e.message); return { ok: false as const, error: "Citirea automată nu a mers acum. Încearcă din nou sau adaugă încăperile manual." }; }
    throw e;
  }
}
