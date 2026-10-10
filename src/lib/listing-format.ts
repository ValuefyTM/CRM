// Real-estate listings of valuefy.ro (/imobiliare), managed from the CRM: types and formatting, safe in client components.
// The tables (listings, listing_photos, listing_social, listing_inquiries) live in the shared database; the website shows them.

export const LISTING_TYPES = ["Apartament", "Casă", "Teren", "Spațiu comercial", "Hală / industrial"] as const;
export const LISTING_STATUSES = ["Nou", "Rezervat", "Preț redus"] as const;
const TYPE_EN: Record<string, string> = {
  Apartament: "Apartment", "Casă": "House", Teren: "Land", "Spațiu comercial": "Commercial space", "Hală / industrial": "Warehouse / industrial",
};

/** The public website the listings are shown on. */
export const SITE_URL = "https://valuefy.ro";

export type Lang = "ro" | "en";

export type Listing = {
  id: string; slug: string; title: string; type: string; city: string; zone: string;
  price: number; // EUR
  surface?: number; land?: number; rooms?: number; baths?: number; floor?: string; year?: number; status?: string;
  features: string[];
  description: string[]; // paragraphs
  report?: { date: string }; // YYYY-MM
  published: boolean;
  photos: string[]; // URLs (served by the CRM)
  photoIds: string[];
  updatedAt?: string;
  hasSocial: boolean; // link-preview image already generated (both languages)
  /** English version of the text fields, when available (empty fields fall back to Romanian on the site). */
  en?: { title?: string; description?: string[]; features?: string[] };
};

export const photoUrl = (id: string) => `/api/crm/listings/photos/${id}`;
export const siteUrl = (slug: string) => `${SITE_URL}/imobiliare/${slug}`;

/** The listing with its text fields in English (falls back to Romanian). */
export function inLang(l: Listing, lang: Lang): Listing {
  if (lang !== "en" || !l.en) return l;
  return {
    ...l,
    title: l.en.title?.trim() || l.title,
    description: l.en.description?.length ? l.en.description : l.description,
    features: l.en.features?.length ? l.en.features : l.features,
  };
}

export const typeLabel = (type: string, lang: Lang) => (lang === "en" ? TYPE_EN[type] ?? type : type);

/** "0% commission" note: every property is sold with no commission for the buyer. */
export const commissionNote = (lang: Lang = "ro") => (lang === "en" ? "0% commission" : "Comision 0%");

/** Floor as entered (Romanian, e.g. "2 din 4", "parter"), in the given language. */
function floorText(floor: string, lang: Lang) {
  if (lang !== "en") return floor;
  return floor
    .replace(/\bdin\b/gi, "of")
    .replace(/\bparter\b/gi, "ground floor")
    .replace(/\bdemisol\b/gi, "semi-basement")
    .replace(/\bsubsol\b/gi, "basement")
    .replace(/\bmansard[aă]/gi, "attic");
}

/** Short spec line, e.g. "3 camere · 74 m² · etaj 2 din 4" / "3 rooms · 74 m² · floor 2 of 4". */
export function specLine(l: Pick<Listing, "rooms" | "surface" | "land" | "floor">, lang: Lang = "ro") {
  if (lang === "en") {
    const floor = l.floor ? floorText(l.floor, "en") : "";
    return [
      l.rooms ? `${l.rooms} ${l.rooms === 1 ? "room" : "rooms"}` : "",
      l.surface ? `${l.surface.toLocaleString("en-GB")} m²` : "",
      l.land ? `land ${l.land.toLocaleString("en-GB")} m²` : "",
      floor ? (/floor|basement|attic/i.test(floor) ? floor : `floor ${floor}`) : "",
    ].filter(Boolean).join(" · ");
  }
  return [
    l.rooms ? `${l.rooms} ${l.rooms === 1 ? "cameră" : "camere"}` : "",
    l.surface ? `${l.surface.toLocaleString("ro-RO")} m²` : "",
    l.land ? `teren ${l.land.toLocaleString("ro-RO")} m²` : "",
    l.floor ? `etaj ${l.floor}` : "",
  ].filter(Boolean).join(" · ");
}

/** "142.000 €" (ro) / "€142,000" (en). */
export const formatEur = (n: number, lang: Lang = "ro") =>
  lang === "en"
    ? "€" + new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 }).format(n)
    : new Intl.NumberFormat("ro-RO", { maximumFractionDigits: 0 }).format(n) + " €";

/** URL-safe slug from a Romanian title. */
export const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

export const INQUIRY_STATUS: Record<string, [string, string]> = {
  NEW: ["Nouă", "pillInfo"],
  SENT: ["Raport trimis", "pillOk"],
  DONE: ["Rezolvată", ""],
};
