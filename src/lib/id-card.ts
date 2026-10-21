// Client-safe: reads a Romanian identity card from the OCR text (no AI). The machine-readable zone (MRZ) gives the
// name, the series and number, the birth date and — on the old CI (2 lines × 36) — the CNP; the new CEI (3 × 30)
// prints the CNP on the front. The address is printed only on the old CI ("Domiciliu"); the CEI has none.

export type IdCard = {
  name: string; cnp: string; series: string; number: string; expires: string; birth: string; sex: "M" | "F" | "";
  county: string; city: string; street: string; addr_number: string; block: string; stair: string; floor: string; apartment: string; address: string;
  /** where it was read from: the MRZ (checked digits) or only the printed text */
  mrz: boolean; card: "ci" | "cei" | "";
};

export const EMPTY_CARD: IdCard = {
  name: "", cnp: "", series: "", number: "", expires: "", birth: "", sex: "", county: "", city: "", street: "", addr_number: "", block: "", stair: "", floor: "",
  apartment: "", address: "", mrz: false, card: "",
};

const W = [2, 7, 9, 1, 4, 6, 3, 5, 8, 2, 7, 9];
/** A CNP with its control digit right (and a real birth date). */
export function validCnp(c: string) {
  if (!/^[1-9]\d{12}$/.test(c)) return false;
  const s = W.reduce((t, w, i) => t + w * Number(c[i]), 0) % 11;
  if ((s === 10 ? 1 : s) !== Number(c[12])) return false;
  const m = Number(c.slice(3, 5)), d = Number(c.slice(5, 7));
  return m >= 1 && m <= 12 && d >= 1 && d <= 31;
}

/** The birth date and sex a CNP holds. */
export function cnpBirth(c: string): { birth: string; sex: "M" | "F" | "" } {
  if (!validCnp(c)) return { birth: "", sex: "" };
  const century = ({ 1: 1900, 2: 1900, 3: 1800, 4: 1800, 5: 2000, 6: 2000, 7: 1900, 8: 1900 } as Record<string, number>)[c[0]] ?? 1900;
  return { birth: `${century + Number(c.slice(1, 3))}-${c.slice(3, 5)}-${c.slice(5, 7)}`, sex: "13579".includes(c[0]) ? "M" : "F" };
}

// MRZ check digit: weights 7 3 1, "<" = 0, letters A = 10…
const val = (ch: string) => (ch === "<" ? 0 : /\d/.test(ch) ? Number(ch) : ch.charCodeAt(0) - 55);
const check = (s: string) => s.split("").reduce((t, ch, i) => t + val(ch) * [7, 3, 1][i % 3], 0) % 10;

// What OCR reads in place of a digit, and of a letter
const toDigit = (s: string) => s.replace(/[OQDU]/g, "0").replace(/[IL|]/g, "1").replace(/Z/g, "2").replace(/S/g, "5").replace(/B/g, "8").replace(/G/g, "6").replace(/T/g, "7");
const toAlpha = (s: string) => s.replace(/0/g, "O").replace(/1/g, "I").replace(/2/g, "Z").replace(/5/g, "S").replace(/8/g, "B");

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
const title = (s: string) => s.replace(/ş/g, "ș").replace(/Ş/g, "Ș").replace(/ţ/g, "ț").replace(/Ţ/g, "Ț").toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase());

/** The MRZ lines of the text: only A–Z, 0–9 and "<", long enough. */
function mrzLines(text: string) {
  return text.split(/\n/).map((l) => l.toUpperCase().replace(/[«‹]/g, "<").replace(/\s+/g, "").replace(/[^A-Z0-9<]/g, ""))
    .filter((l) => l.length >= 26 && (l.includes("<") || /\d{6}/.test(l)));
}

const yymmdd = (s: string, future: boolean) => {
  if (!/^\d{6}$/.test(s)) return "";
  const yy = Number(s.slice(0, 2));
  const now = new Date().getFullYear() % 100;
  const year = future ? 2000 + yy : (yy > now ? 1900 : 2000) + yy;
  return `${year}-${s.slice(2, 4)}-${s.slice(4, 6)}`;
};

/** The name from the MRZ (surname << given names), with the diacritics the printed text has. */
function nameOf(raw: string, text: string) {
  const [sur, given = ""] = raw.replace(/^<+|<+$/g, "").split(/<{2,}/);
  const words = [...toAlpha(sur).split("<"), ...toAlpha(given).split("<")].filter((w) => w.length > 1 || /^[A-Z]$/.test(w)).filter(Boolean);
  // the printed text spells them with diacritics: "POPESCU" ← "POPESCU", "STEFAN" ← "ȘTEFAN"
  const printed = new Map<string, string>();
  for (const t of text.split(/[^\p{L}-]+/u)) if (t.length > 1 && fold(t) !== t.toUpperCase()) printed.set(fold(t), t.toUpperCase());
  return title(words.map((w) => printed.get(w) ?? w).join(" "));
}

// what OCR reads where a digit is printed
const D = "[0-9OQDUILZSBGT]";
const sexOf = (c: string | undefined) => (c === "M" ? "M" : c === "F" ? "F" : "") as IdCard["sex"];

/**
 * The MRZ, found by its patterns anywhere in the text (OCR may join the lines or drop the "<" runs):
 * old CI (TD2) "TM123456<0ROU8503057M3012316 1354014 4"; CEI (TD1) "IDROU" + document, then "8503057M3112310ROU".
 */
function readMrz(text: string): Partial<IdCard> | null {
  const lines = mrzLines(text);
  const flat = lines.join("\n");
  const out: Partial<IdCard> = {};
  // TD2 line 2: series (2 letters) + number (6–7 digits) <, check, ROU, birth, check, sex, expiry, check, CNP digits (7)
  const td2 = flat.match(new RegExp(`([A-Z]{2})(${D}{6,7})<*(${D})R[O0]{1,2}U(${D}{6})(${D})([MF<])(${D}{6})(${D})(${D}{7})`));
  if (td2) {
    const birth = toDigit(td2[4]), opt = toDigit(td2[9]);
    const cnp = `${opt[0]}${birth}${opt.slice(1, 7)}`;
    Object.assign(out, {
      card: "ci", mrz: check(birth) === Number(toDigit(td2[5])), series: td2[1], number: toDigit(td2[2]), birth: yymmdd(birth, false), sex: sexOf(td2[6]),
      expires: yymmdd(toDigit(td2[7]), true), cnp: validCnp(cnp) ? cnp : "",
    });
  } else {
    // TD1: birth, check, sex, expiry, check, ROU (line 2); the document after "IDROU" (line 1)
    const l2 = flat.match(new RegExp(`(${D}{6})(${D})([MF<])(${D}{6})(${D})R[O0]{1,2}U`));
    if (l2) {
      const birth = toDigit(l2[1]);
      Object.assign(out, { card: "cei", mrz: check(birth) === Number(toDigit(l2[2])), birth: yymmdd(birth, false), sex: sexOf(l2[3]), expires: yymmdd(toDigit(l2[4]), true) });
      const doc = flat.match(/[I1][D0]R[O0]{1,2}U([A-Z]{2})([0-9OIS]{6,7})/);
      if (doc) { out.series = doc[1]; out.number = toDigit(doc[2]); }
    }
  }
  // the name: "IDROU" + SURNAME<<GIVEN<NAMES (TD2), or a line SURNAME<<GIVEN<NAMES (TD1)
  const nm = flat.match(/[I1][D0]R[O0]{1,2}U([A-Z]+(?:<[A-Z]+)*<<[A-Z]+(?:<[A-Z]+)*)/) ?? flat.match(/(?:^|\n)([A-Z]+(?:<[A-Z]+)*<<[A-Z]+(?:<[A-Z]+)*)<*(?:\n|$)/);
  if (nm) out.name = nameOf(nm[1], text);
  return Object.keys(out).length ? out : null;
}

/** The name as printed: "Nume/Nom/Last name" and "Prenume/Prénom/First name", each followed by its line. */
function printedName(text: string) {
  const ls = text.split(/\n/).map((l) => l.trim()).filter(Boolean);
  const after = (re: RegExp) => { const i = ls.findIndex((l) => re.test(l)); const v = i >= 0 ? ls[i + 1] ?? "" : ""; return /^[\p{Lu} -]{2,}$/u.test(v) ? v : ""; };
  // the labels come out noisy ("Numo/NomiLast nama"): any of their three languages
  const sur = after(/^N[uv]m[eo]\b|^N[uv]m[eo]\/|\/\s*Nom\b|Last\s*n/i), given = after(/^Pren[uv]m|Pr[ée]nom|First\s*n/i);
  return sur ? title(`${sur} ${given}`.trim()) : "";
}

/** A 13-digit CNP printed on the card ("CNP 1850101354012"), checked. */
function printedCnp(text: string) {
  const near = text.match(/CNP[^\d]{0,12}([\dOIlSB ]{13,17})/i);
  const pool = [...(near ? [near[1]] : []), ...(text.match(/[\dOIlSB]{13}/g) ?? [])];
  for (const raw of pool) {
    const c = toDigit(raw.toUpperCase().replace(/\s/g, "")).slice(0, 13);
    if (validCnp(c)) return c;
  }
  return "";
}

const COUNTIES: Record<string, string> = {
  AB: "Alba", AR: "Arad", AG: "Argeș", BC: "Bacău", BH: "Bihor", BN: "Bistrița-Năsăud", BT: "Botoșani", BR: "Brăila", BV: "Brașov", B: "București", BZ: "Buzău",
  CL: "Călărași", CS: "Caraș-Severin", CJ: "Cluj", CT: "Constanța", CV: "Covasna", DB: "Dâmbovița", DJ: "Dolj", GL: "Galați", GR: "Giurgiu", GJ: "Gorj", HR: "Harghita",
  HD: "Hunedoara", IL: "Ialomița", IS: "Iași", IF: "Ilfov", MM: "Maramureș", MH: "Mehedinți", MS: "Mureș", NT: "Neamț", OT: "Olt", PH: "Prahova", SJ: "Sălaj", SM: "Satu Mare",
  SB: "Sibiu", SV: "Suceava", TR: "Teleorman", TM: "Timiș", TL: "Tulcea", VS: "Vaslui", VL: "Vâlcea", VN: "Vrancea",
};

// The address abbreviations on the old CI: "Jud.TM Mun.Timișoara Str.Gheorghe Lazăr nr.24 bl.A1 sc.B et.2 ap.10"
const MARK = /(?:^|[\s,(])(?:(Jud|Mun|Ora[sșş]|Or|Com|Sat|Sec|Sector|Str|Bd|Bdul|B-dul|Cal|Calea|Al|Aleea|[SȘŞ]os|[SȘŞ]oseaua|Pia[tțţ]a|P-[tțţ]a|Spl|Splaiul|Int|Intr|Nr|Bl|Sc|Et|Ap)\s*[.:]|(Sat|Sector|Jud|Mun|Com|Ora[sșş])\s)\s*/giu;
const STREET: Record<string, string> = { str: "Str.", bd: "Bd.", bdul: "Bd.", "b-dul": "Bd.", cal: "Calea", calea: "Calea", al: "Aleea", aleea: "Aleea", sos: "Șos.", soseaua: "Șos.", piata: "Piața", "p-ta": "Piața", spl: "Splaiul", splaiul: "Splaiul", int: "Intr.", intr: "Intr." };

/** The home address of the old CI: the text after "Domiciliu", up to "Emisă de" / "Valabilitate". */
export function readAddress(text: string): Partial<IdCard> {
  const flat = text.replace(/\r/g, "").replace(/\n+/g, " ").replace(/\s+/g, " ");
  const m = flat.match(/Domicili[uv]\S*\s*(?:\/\s*\S+\s*){0,3}(.+?)(?=Emis|[Il1]ssued|D[ée]livr|Valabil|Validit|SPCLEP|$)/i)
    ?? flat.match(/((?:^|\s)Jud\s*[.:]?\s*\S.+?)(?=Emis|[Il1]ssued|D[ée]livr|Valabil|Validit|SPCLEP|$)/);
  if (!m) return {};
  const body = m[1].replace(/^(?:Adress?e|Address|\/|\s)+/i, "").trim();
  const parts: { k: string; v: string }[] = [];
  const marks = [...body.matchAll(MARK)];
  marks.forEach((x, i) => {
    const end = i + 1 < marks.length ? marks[i + 1].index! : body.length;
    parts.push({ k: fold(x[1] ?? x[2]).toLowerCase(), v: body.slice(x.index! + x[0].length, end).replace(/[,;()]+\s*$/, "").replace(/[()]/g, "").trim() });
  });
  if (!parts.length) return { address: body.slice(0, 200) };
  const out: Partial<IdCard> = {};
  let sector = "", village = "";
  for (const { k, v } of parts) {
    if (!v) continue;
    if (k === "jud") out.county = COUNTIES[v.toUpperCase().replace(/[^A-Z]/g, "")] ?? title(v);
    else if (["mun", "oras", "or", "com"].includes(k)) out.city = title(v);
    else if (k === "sat") village = title(v);
    else if (k === "sec" || k === "sector") { sector = `Sector ${toDigit(v).replace(/\D/g, "").slice(0, 1)}`; out.city ||= "București"; out.county ||= "București"; }
    else if (STREET[k]) out.street = `${STREET[k]} ${v}`;
    else if (k === "nr") out.addr_number = v.replace(/\s/g, "");
    else if (k === "bl") out.block = v;
    else if (k === "sc") out.stair = v;
    else if (k === "et") out.floor = v;
    else if (k === "ap") out.apartment = v;
  }
  // the village belongs to its commune: "Sat Dumbrăvița, Com. Giroc" stays as one city
  if (village) out.city = out.city && out.city !== village ? `${village} (com. ${out.city})` : village;
  out.address = [out.street, out.addr_number && `nr. ${out.addr_number}`, out.block && `bl. ${out.block}`, out.stair && `sc. ${out.stair}`, out.floor && `et. ${out.floor}`,
    out.apartment && `ap. ${out.apartment}`, sector].filter(Boolean).join(", ");
  return out;
}

/** Everything the card says: the MRZ first (checked), else the printed text. */
export function readIdCard(text: string): IdCard {
  const mrz = readMrz(text) ?? {};
  const card: IdCard = { ...EMPTY_CARD, ...readAddress(text), ...Object.fromEntries(Object.entries(mrz).filter(([, v]) => v !== "" && v != null)) };
  if (!card.cnp) card.cnp = printedCnp(text);
  if (!card.name) card.name = printedName(text);
  // "Valabilitate 01.01.20-31.12.30": the end date
  if (!card.expires) {
    const v = text.match(/Valabil\S*[^\d]{0,30}\d{2}\.\d{2}\.\d{2,4}\s*[-–]\s*(\d{2})\.(\d{2})\.(\d{2,4})/i);
    if (v) card.expires = `${v[3].length === 2 ? `20${v[3]}` : v[3]}-${v[2]}-${v[1]}`;
  }
  if (card.cnp && !card.birth) Object.assign(card, cnpBirth(card.cnp));
  // the printed series and number ("SERIA TM NR 123456") when the MRZ had none
  if (!card.series) {
    const s = text.match(/SERIA\s*([A-Z]{2})\s*N[RO]\.?\s*([\dOIS]{6,7})/i);
    if (s) { card.series = s[1].toUpperCase(); card.number = toDigit(s[2].toUpperCase()); }
  }
  if (!card.card && card.street) card.card = "ci";
  return card;
}

/** The parts of a reading that came out: for "Am citit: …". */
export const cardFound = (c: IdCard) => [c.name && "nume", c.cnp && "CNP", (c.street || c.city) && "adresă", c.series && "serie"].filter(Boolean) as string[];
