// Server-only: translate a listing's Romanian texts to English with Claude.
import Anthropic from "@anthropic-ai/sdk";
import type { ListingInput } from "./listings";

// LISTING_MODEL can switch the model; a small, fast one is enough for a faithful translation.
const model = () => process.env.LISTING_MODEL?.trim() || "claude-haiku-5-5";
const TIMEOUT_MS = 20_000;

export type ListingTexts = { title: string; description: string[]; features: string[] };

/** True when an API key is configured, i.e. translation can be attempted. */
export function translationAvailable(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

const SYSTEM = `You translate Romanian real-estate listings into English for the website of VALUEFY, an ANEVAR-authorised property valuation firm in Romania.
Rules:
- British English, natural and professional real-estate tone (clear, warm, not exaggerated).
- Translate faithfully. Do not add, remove or invent information; do not add marketing claims.
- Keep proper nouns as they are: street names, neighbourhood and city names (e.g. "Complex Studențesc", "Timișoara", "Calea Aradului"), building and company names, keeping Romanian diacritics.
- Use "m²" for square metres, keep numbers and prices unchanged.
- Keep the same number and order of description paragraphs and of features.
- Reply with strict JSON only, no markdown and no commentary, exactly of the form:
{"title": string, "description": string[], "features": string[]}`;

const strings = (v: unknown) => (Array.isArray(v) ? v.map((x) => String(x ?? "").trim()).filter(Boolean) : []);

/** English title/description/features, or null when translation is unavailable or fails. */
export async function translateListing(input: ListingTexts): Promise<ListingTexts | null> {
  if (!translationAvailable()) return null;
  const source: ListingTexts = {
    title: input.title.trim(),
    description: strings(input.description),
    features: strings(input.features),
  };
  if (!source.title && !source.description.length && !source.features.length) return null;

  try {
    const client = new Anthropic({ timeout: TIMEOUT_MS, maxRetries: 0 });
    const response = await client.messages.create(
      {
        model: model(),
        max_tokens: 4000,
        system: SYSTEM,
        messages: [{ role: "user", content: `Translate this listing (JSON, Romanian):\n${JSON.stringify(source)}` }],
      },
      { signal: AbortSignal.timeout(TIMEOUT_MS) },
    );
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    const start = text.indexOf("{"), end = text.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    const out = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
    const result: ListingTexts = {
      title: typeof out.title === "string" ? out.title.trim().slice(0, 160) : "",
      description: strings(out.description).map((p) => p.slice(0, 4000)),
      features: strings(out.features).map((x) => x.slice(0, 80)).slice(0, 30),
    };
    if ((source.title && !result.title) || (source.description.length && !result.description.length)) return null;
    return result;
  } catch (error) {
    if (error instanceof Anthropic.APIError) console.error(`[translate-listing] API error ${error.status}:`, error.message);
    else console.error("[translate-listing]", error);
    return null;
  }
}

/**
 * Before saving: when the English title AND description are both empty, fill the English fields by translating
 * the Romanian ones. Never throws; returns the input unchanged when translation is unavailable or fails.
 */
export async function withAutoEnglish(v: ListingInput): Promise<ListingInput> {
  if (v.title_en || v.description_en || !translationAvailable()) return v;
  const en = await translateListing({
    title: v.title,
    description: (v.description ?? "").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean),
    features: v.features ?? [],
  });
  if (!en) return v;
  return {
    ...v,
    title_en: en.title,
    description_en: en.description.join("\n\n").slice(0, 8000),
    features_en: v.features_en?.length ? v.features_en : en.features,
  };
}
