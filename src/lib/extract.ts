// Server-only: reads screenshots of a bank's valuation app (BCR, BRD…) with Claude and returns the client, the bank
// details and the assets to value, to pre-fill the processing form. Needs ANTHROPIC_API_KEY in the worker; the team
// checks every field before saving.
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { ASSET_CATEGORIES } from "./asset-labels";

const CATEGORY_CODES = ASSET_CATEGORIES.map(([c]) => c) as [string, ...string[]];

const Extracted = z.object({
  client: z.object({
    name: z.string().nullable().describe("Numele complet al clientului (persoană) sau denumirea firmei"),
    kind: z.enum(["person", "company"]).nullable(),
    phone: z.string().nullable(),
    email: z.string().nullable(),
    cui: z.string().nullable().describe("CUI-ul firmei, doar pentru persoane juridice"),
  }),
  contact: z.object({
    name: z.string().nullable().describe("Persoana de contact pentru inspecție, dacă e alta decât clientul"),
    phone: z.string().nullable(),
  }),
  bank: z.object({
    branch: z.string().nullable().describe("Agenția / sucursala băncii"),
    consultant: z.string().nullable().describe("Consultantul / ofițerul de credit al băncii (nume, telefon, email)"),
    product: z.string().nullable().describe("Produsul / scopul creditului (ipotecar, imobiliar, nevoi personale cu garanție...)"),
    report_type: z.string().nullable().describe("Tipul evaluării cerute (ex. prima evaluare, reevaluare, evaluare desktop)"),
    deadline: z.string().nullable().describe("Termenul cerut de bancă, format YYYY-MM-DD"),
  }),
  assets: z.array(z.object({
    category: z.enum(CATEGORY_CODES).nullable(),
    type: z.string().nullable().describe("Tipul bunului, cu majuscule, ex. APARTAMENT IN BLOC, CASA CU TEREN, TEREN INTRAVILAN CONSTRUCTII, LOC DE PARCARE ( SUBTERAN )"),
    county: z.string().nullable(),
    city: z.string().nullable(),
    full_address: z.string().nullable().describe("Adresa completă: strada, număr, bloc, scară, etaj, apartament"),
    cf_number: z.string().nullable().describe("Numărul cărții funciare"),
    cad_building: z.string().nullable().describe("Numărul cadastral al construcției / unității"),
    cad_land: z.string().nullable().describe("Numărul cadastral al terenului"),
    usable_area: z.number().nullable().describe("Suprafața utilă în mp"),
    land_area: z.number().nullable().describe("Suprafața terenului în mp"),
    rooms: z.number().nullable(),
    year_built: z.number().nullable(),
  })).describe("Bunurile de evaluat (fiecare proprietate / loc de parcare / teren separat)"),
  notes: z.string().nullable().describe("Alte informații utile pentru evaluare, pe scurt"),
});
export type ExtractedData = z.infer<typeof Extracted>;

export const extractEnabled = () => !!process.env.ANTHROPIC_API_KEY;

const PROMPT = `Acestea sunt capturi de ecran din aplicația unei bănci pentru o cerere de evaluare imobiliară (garanție la credit).
Extrage datele clientului, ale băncii și bunurile de evaluat. Completează doar ce apare clar în capturi; lasă null ce lipsește sau e ilizibil — nu ghici.
Păstrează numerele exact cum apar (CF, cadastral, telefoane). Fiecare bun distinct (apartament, loc de parcare, boxă, teren) e un element separat în "assets".`;

/** Fields read from 1–4 screenshots, or an error to show (no key, unreadable images, refusal). */
export async function extractFromScreens(images: { data: ArrayBuffer; type: string }[], hint: { bank?: string | null; ref?: string | null; client?: string | null }) {
  if (!extractEnabled()) return { ok: false as const, error: "Citirea automată nu este configurată (ANTHROPIC_API_KEY). Completează datele manual." };
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const content: Anthropic.Beta.BetaContentBlockParam[] = images.map((img) => ({
    type: "image" as const,
    source: { type: "base64" as const, media_type: img.type as "image/png" | "image/jpeg" | "image/webp" | "image/gif", data: Buffer.from(img.data).toString("base64") },
  }));
  content.push({ type: "text", text: `${PROMPT}${hint.bank ? `\nBanca: ${hint.bank}.` : ""}${hint.ref ? ` Nr. cerere: ${hint.ref}.` : ""}${hint.client ? ` Client (din email): ${hint.client}.` : ""}` });
  try {
    const res = await client.beta.messages.parse({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      // Reading values off screenshots: enough thinking to be careful with numbers, without the wait of the higher levels.
      output_config: { effort: "medium", format: betaZodOutputFormat(Extracted) },
      // If a safety classifier declines, the API retries on a fallback model inside the same call.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      messages: [{ role: "user", content }],
    });
    if (res.stop_reason === "refusal") return { ok: false as const, error: "Capturile nu au putut fi citite. Completează datele manual." };
    if (!res.parsed_output) return { ok: false as const, error: "Nu am putut citi datele din capturi. Completează-le manual." };
    return { ok: true as const, data: res.parsed_output };
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return { ok: false as const, error: "Serviciul de citire e ocupat. Încearcă din nou peste un minut." };
    if (e instanceof Anthropic.BadRequestError) return { ok: false as const, error: "Imaginile nu au putut fi trimise (format sau mărime). Încearcă o captură PNG sau JPG." };
    if (e instanceof Anthropic.APIError) { console.error("extract", e.status, e.message); return { ok: false as const, error: "Citirea automată nu a mers acum. Completează datele manual." }; }
    throw e;
  }
}
