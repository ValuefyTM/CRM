import type { FetchItem } from "../apify";

/** What a site gives about one listing (card in the results, or the listing's own page). */
export type Card = {
  extId: string; url: string; title?: string | null; price?: number | null; currency?: string | null;
  usable_area?: number | null; built_area?: number | null; land_area?: number | null;
  county?: string | null; city?: string | null; zone?: string | null; address?: string | null;
  lat?: number | null; lng?: number | null; geo_precision?: string | null;
  seller_kind?: string | null; seller_name?: string | null; description?: string | null;
  photos?: string[]; src_created_at?: string | null; src_updated_at?: string | null; transaction?: string | null;
  features?: Record<string, unknown>;
};
export type Detail = Omit<Partial<Card>, "extId" | "url"> & { expired?: boolean };

export type Site = {
  name: string;
  listFormats: string[];
  detailFormats: string[];
  pageUrl: (url: string, n: number) => string;
  parseList: (item: FetchItem) => Card[];
  parseDetail: (item: FetchItem, card: { url: string; extId: string }) => Detail;
};
