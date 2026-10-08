// What a framework contract's / collaboration's invoice line and mentions say, with placeholders filled from the
// report. No server code: the settings panel previews it live.

export type BillingText = { product?: string; line?: string; mentions?: string };

export const PLACEHOLDERS: [key: string, label: string][] = [
  ["contract", "nr. contract cadru"], ["contract_data", "data contractului"], ["client", "nume client"], ["comanda", "nr. comandă bancă"],
  ["raport", "nr. raport"], ["tip_raport", "tip raport"], ["agentie", "agenție / sucursală"], ["adresa", "adresa bunului"],
  ["data_predare", "data predării"], ["luna", "luna predării"],
];

export const DEFAULT_TEXT: Required<BillingText> = {
  product: "",
  line: "{tip_raport} · raport nr. {raport} · comanda {comanda} · client {client}",
  mentions: "Conform contractului cadru nr. {contract}.",
};

/** Fills {placeholders}; a separator left next to an empty value (e.g. "comanda  · ") is dropped with it. */
export function fillText(tpl: string, v: Record<string, string | null | undefined>) {
  return tpl
    .split(/\s*·\s*/)
    .map((part) => {
      const keys = [...part.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
      if (keys.length && keys.every((k) => !v[k]?.toString().trim())) return "";
      return part.replace(/\{(\w+)\}/g, (_, k: string) => v[k]?.toString().trim() ?? "");
    })
    .filter((p) => p.trim())
    .join(" · ")
    .replace(/\s+/g, " ")
    .trim();
}
