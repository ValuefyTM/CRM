// The fee grid of a framework contract: the bank's fee for the main kinds of assets. No server code: also used in forms.
// The grid's amounts may be with or without VAT (the bank's list); the fee kept on orders and reports is always net.

export type FeeKind = "apartament" | "casa" | "teren";
export const FEE_KINDS: [FeeKind, string, string][] = [
  ["apartament", "Apartament", "în bloc sau în casă"],
  ["casa", "Casă cu teren", ""],
  ["teren", "Teren liber", "intravilan sau extravilan"],
];
export type FeeGrid = { vat: boolean; rates: Partial<Record<FeeKind, number>> };

/** The grid's kind of an asset, from its category and type; null for the kinds without a fee in the grid (parking, commercial…). */
export function feeKindOf(category: string | null | undefined, type: string | null | undefined): FeeKind | null {
  const t = (type ?? "").toUpperCase().trim(), c = (category ?? "").toUpperCase();
  if (!t) return null;
  if (t.startsWith("APARTAMENT")) return "apartament";
  if (t === "CASA CU TEREN") return "casa";
  if (c === "TEREN" || t.startsWith("TEREN")) return "teren";
  return null;
}

export const feeKindLabel = (k: FeeKind | null) => FEE_KINDS.find(([v]) => v === k)?.[1] ?? "";

/** The grid stored on the contract (JSON), or null when the contract has none. */
export function parseFeeGrid(raw: string | null | undefined): FeeGrid | null {
  if (!raw) return null;
  try {
    const j = JSON.parse(raw) as { vat?: unknown; rates?: Record<string, unknown> };
    const rates: FeeGrid["rates"] = {};
    for (const [k] of FEE_KINDS) {
      const n = Number(j.rates?.[k]);
      if (Number.isFinite(n) && n > 0) rates[k] = Math.round(n * 100) / 100;
    }
    return Object.keys(rates).length ? { vat: j.vat === true, rates } : null;
  } catch { return null; }
}

/** The grid's amount for a kind, as listed (with or without VAT). */
export const gridRate = (grid: FeeGrid | null, kind: FeeKind | null) => (grid && kind && grid.rates[kind]) || null;

/** Fees keep 4 decimals: a fee taken out of VAT gives back the exact amount with VAT. */
export const round4 = (n: number) => Math.round(n * 10000) / 10000;

/** The net fee (without VAT) for a kind: the grid's amount, taken out of VAT when the grid is "cu TVA". */
export function netFromGrid(grid: FeeGrid | null, kind: FeeKind | null, vatPercent: number) {
  const r = gridRate(grid, kind);
  if (r == null) return null;
  return grid!.vat ? round4(r / (1 + vatPercent / 100)) : r;
}

/** The fee with VAT when the grid gives it so ("cu TVA"), for the given net fee (only when that net is the grid's own). */
export function grossFromGrid(grid: FeeGrid | null, kind: FeeKind | null, vatPercent: number, net: number | null) {
  if (!grid?.vat || net == null) return null;
  const n = netFromGrid(grid, kind, vatPercent);
  return n != null && Math.abs(n - net) < 0.00005 ? gridRate(grid, kind) : null;
}

/** Validates a grid sent from the form; `null` = no grid. */
export function cleanFeeGrid(raw: unknown): FeeGrid | null {
  if (!raw || typeof raw !== "object") return null;
  const j = raw as { vat?: unknown; rates?: Record<string, unknown> };
  const rates: FeeGrid["rates"] = {};
  for (const [k] of FEE_KINDS) {
    const v = j.rates?.[k];
    const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/\s/g, "").replace(",", "."));
    if (Number.isFinite(n) && n > 0 && n < 1e6) rates[k] = Math.round(n * 100) / 100;
  }
  return Object.keys(rates).length ? { vat: j.vat === true, rates } : null;
}
