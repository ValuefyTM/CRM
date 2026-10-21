// Client-safe: a Romanian address written in one line, split into its parts — for forms that ask them one by one
// (Appraisal & Valuation). "jud. Timiș, Timișoara, Str. Gheorghe Lazăr nr. 24, bl. A1, sc. B, et. 2, ap. 10",
// "Str. Florilor 5, Dumbrăvița", "Bd. Revoluției 12 ap 3, Sector 2, București".

export type AddressParts = { county: string; city: string; street: string; number: string; block: string; stair: string; floor: string; apartment: string };

const EMPTY: AddressParts = { county: "", city: "", street: "", number: "", block: "", stair: "", floor: "", apartment: "" };

// the street's kind: "Str." is left out (their form writes the name only), the others stay ("Bd. Eroilor")
const STREET = /^(str(?:ada)?|bd|b-dul|bdul|bulevardul|cal(?:ea)?|al(?:eea)?|[sș]os(?:eaua)?|pia[tț]a|p-[tț]a|spl(?:aiul)?|intr(?:area)?|drumul|fundătura|fdt|pasajul|prelungirea|prel)\b\.?\s*/i;
const KIND: Record<string, string> = { bd: "Bd.", "b-dul": "Bd.", bdul: "Bd.", bulevardul: "Bd.", cal: "Calea", calea: "Calea", al: "Aleea", aleea: "Aleea", sos: "Șos.", șos: "Șos.",
  soseaua: "Șos.", șoseaua: "Șos.", piata: "Piața", piața: "Piața", "p-ta": "Piața", "p-ța": "Piața", spl: "Splaiul", splaiul: "Splaiul", intr: "Intrarea", intrarea: "Intrarea",
  drumul: "Drumul", fundătura: "Fundătura", fdt: "Fundătura", pasajul: "Pasajul", prelungirea: "Prelungirea", prel: "Prelungirea" };
const PLACE = /^(jud(?:e[tț]ul)?|mun(?:icipiul)?|ora[sșş]ul|ora[sșş]|or|com(?:una)?|sat(?:ul)?|loc(?:alitatea)?|sector(?:ul)?|sec)\b\.?\s*/i;
const PART = (k: string) => new RegExp(`(?:^|[\\s,])${k}\\.?\\s*([\\w/-]+)`, "i");

const clean = (s: string) => s.replace(/\s+/g, " ").replace(/^[\s,.;-]+|[\s,.;-]+$/g, "");

export function splitAddress(text: string | null | undefined): AddressParts {
  const out = { ...EMPTY };
  if (!text?.trim()) return out;
  let rest = ` ${text.replace(/\r?\n/g, ", ")} `;
  // bl. / sc. / et. / ap. anywhere
  for (const [k, re] of [["block", PART("bl(?:oc(?:ul)?)?")], ["stair", PART("sc(?:ara)?")], ["floor", PART("et(?:aj(?:ul)?)?")], ["apartment", PART("ap(?:artament(?:ul)?)?")]] as const) {
    const m = rest.match(re);
    if (m) { out[k] = m[1]; rest = rest.replace(m[0], " "); }
  }
  const cityless: string[] = [];
  for (const raw of rest.split(/[,;]/)) {
    let seg = clean(raw);
    if (!seg) continue;
    const place = seg.match(PLACE);
    if (place) {
      const k = place[1].toLowerCase(), v = clean(seg.slice(place[0].length));
      if (k.startsWith("jud")) out.county = v;
      else if (k.startsWith("sec")) { out.city ||= "București"; out.county ||= "București"; out.street ||= ""; }
      else if (k.startsWith("sat")) out.city = out.city ? `${v}, ${out.city}` : v;
      else out.city = out.city && /,/.test(out.city) ? out.city : out.city ? `${out.city}, ${v}` : v;
      continue;
    }
    // the number: "nr. 24", "nr 24A", or the last token with a digit after the street's name ("Florilor 5")
    const nr = seg.match(/\b(?:nr|num[aă]r(?:ul)?)\b\.?\s*([\w/-]+)/i);
    if (nr) { out.number ||= nr[1]; seg = clean(seg.replace(nr[0], " ")); }
    const kind = seg.match(STREET);
    // no "Str." written: a name followed by its number ("Gheorghe Lazăr 24") is the street too
    if (kind || (nr && !out.street) || (!out.street && /^\D{3,}\s\d+[\w/-]*$/.test(seg))) {
      let name = kind ? clean(seg.slice(kind[0].length)) : seg;
      const tail = !nr && name.match(/\s(\d+[\w/-]*)$/);
      if (tail) { out.number ||= tail[1]; name = clean(name.slice(0, tail.index)); }
      const k = kind?.[1].toLowerCase() ?? "";
      out.street = [KIND[k] ?? "", name].filter(Boolean).join(" ");
      continue;
    }
    if (/^\d{6}$/.test(seg)) continue; // a postal code
    if (!/\d/.test(seg)) cityless.push(seg);
  }
  // a plain word left (no number): the city, then the county ("Timișoara, Timiș")
  if (!out.city && cityless.length) out.city = cityless.shift()!;
  if (!out.county && cityless.length) out.county = cityless.shift()!;
  // "Dumbrăvița (com. Giroc)": the village alone
  out.city = clean(out.city.replace(/\(.*?\)/g, ""));
  return out;
}
