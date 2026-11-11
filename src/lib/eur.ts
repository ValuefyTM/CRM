// The values of the valuations in euro, everywhere they are compared (registry of properties, comparables, similar
// reports, the asset's history, the map of prices): the value in euro given at delivery; the values of the reports in
// euro — those imported from the old CRM (Glide) are all in euro; else the value in lei at the report's BNR rate.

/** The euro rate used when a report in lei has none recorded (BNR, roughly). */
export const EUR_FALLBACK = 4.97;

/** SQL: the asset's value in euro (`a` the asset, `r` its report). */
export const eurSql = (a = "a", r = "r") =>
  `COALESCE(NULLIF(${a}.value_eur, 0), CASE WHEN ${r}.glide_id IS NOT NULL OR ${r}.currency = 'EUR' THEN ${a}.value ELSE ${a}.value / COALESCE(NULLIF(${r}.eur_rate, 0), ${EUR_FALLBACK}) END)`;

/** SQL: the report's result in euro (when its only asset has no value of its own). */
export const resultEurSql = (r = "r") =>
  `COALESCE(NULLIF(${r}.result_eur, 0), CASE WHEN ${r}.glide_id IS NOT NULL OR ${r}.currency = 'EUR' THEN ${r}.result_value ELSE ${r}.result_value / COALESCE(NULLIF(${r}.eur_rate, 0), ${EUR_FALLBACK}) END)`;

/** The same in code. */
export const toEur = (v: number | null | undefined, x: { value_eur?: number | null; glide_id?: string | null; currency?: string | null; eur_rate?: number | null }) =>
  x.value_eur && x.value_eur > 0 ? x.value_eur : v == null ? null : x.glide_id || x.currency === "EUR" ? v : v / (x.eur_rate && x.eur_rate > 0 ? x.eur_rate : EUR_FALLBACK);

/** „123.456 €” */
export const eur = (v: number | null | undefined) => (v ? `${Math.round(v).toLocaleString("ro-RO")} €` : "—");
