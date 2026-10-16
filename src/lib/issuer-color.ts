// The colour of an issuing firm: set by hand (Setări → Date firmă), else VALUEFY gold for our own firm and a steady
// colour from the name for the others. No server code here.
const PALETTE = ["#3b6fd1", "#7b4fb8", "#1f8a5b", "#c2410c", "#0e7490", "#b91c5c", "#6b7280"];
export const OWN_COLOR = "#f2a93b";
export function issuerColor(name: string | null | undefined, color?: string | null) {
  if (color && /^#[0-9a-f]{6}$/i.test(color)) return color;
  if (!name) return "#d6d0c4";
  if (/valuefy/i.test(name)) return OWN_COLOR;
  let h = 0;
  for (const c of name.toUpperCase()) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}
