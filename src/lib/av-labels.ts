// The Appraisal & Valuation order form (Formular_facturare_externi.xlsx): its fields, their lists and what is required
// (what their validated sample fills in). Shared by the server (av-form.ts) and the page; no server code here.

/** The collaboration with Appraisal & Valuation (the client's email is required on its orders). */
export const isAvFirm = (name: string | null | undefined) => /appraisal\s*(&|and|si|și)?\s*valuation/i.test(name ?? "");

export const AV_FIRMS = ["APP", "NAI", "SGET"] as const;
export const AV_PURPOSES = ["Altele", "Constituirii de aport la capitalul social", "Dare in plata", "Esalonare datorii ANAF", "Executare", "Garantare si impozitare",
  "Garantarea unui imprumut bancar", "Impozitare", "Informativ", "Informativ in vederea achizitiei", "Informativ in vederea stabilirii eligibilitatii"];
export const AV_COUNTIES = ["AB", "AR", "AG", "BC", "BH", "BN", "BT", "BR", "BV", "B", "BZ", "CL", "CS", "CJ", "CT", "CV", "DB", "DJ", "GL", "GR", "GJ", "HR", "HD", "IL", "IS", "IF",
  "MM", "MH", "MS", "NT", "OT", "PH", "SJ", "SM", "SB", "SV", "TR", "TM", "TL", "VS", "VL", "VN"];
export const AV_BANKS = ["ALPHA BANK", "ANAF", "BANCA COMERCIALA INTESA SA", "BANCA COMERCIALA ROMANA", "BANCA DE IMPORT EXPORT A ROMANIEI", "BANCA ROMANA DE CREDITE SI INVESTITII",
  "BANCA ROMANEASCA", "BANCA TRANSILVANIA", "BEJ", "BRD SOGELEASE", "CEC BANK", "CREDIT AGRICOLE", "CREDIT EUROPE BANK", "DEUTSCHE BANK", "EXIM BANK", "GARANTI BANK",
  "GARANTI LEASING", "OTP BANK", "OTP FACTORING SRL", "PATRIA BANK", "RAIFEISSEN BANK", "TECHVENTURESBANK", "UNICREDIT BANK", "VERIDA CREDIT IFN"];
export const AV_STATES = ["Existenta", "In constructie "] as const; // the trailing space is in their list
export const AV_TYPES = ["Active necorporale", "Agricola", "Alte tipuri proprietati", "Comercial", "Evaluare de patrimoniu", "Industrial", "Mixt", "Participatii", "Rezidential", "Societati comerciale", "Teren "];
export const AV_SUBTYPES = ["Abator", "Altele", "Ansamblu rezidential", "Apartament", "Baza sportiva", "Bloc de apartamente", "Casa cu teren", "Centrala de biomasa/biogaz",
  "Centrala electrica eoliana", "Centrala electrica fotovoltaica", "Centrala hidroelectrica", "Centrala termoelectrica", "Cladire de birouri", "Clinica "];
export const AV_MOBILE = ["Altele", "Autoturisme", "Echipamente", "Instalatii", "Masini", "Stocuri"];

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const COUNTY_NAMES: Record<string, string> = {
  alba: "AB", arad: "AR", arges: "AG", bacau: "BC", bihor: "BH", "bistrita nasaud": "BN", botosani: "BT", braila: "BR", brasov: "BV", bucuresti: "B", buzau: "BZ",
  calarasi: "CL", "caras severin": "CS", cluj: "CJ", constanta: "CT", covasna: "CV", dambovita: "DB", dolj: "DJ", galati: "GL", giurgiu: "GR", gorj: "GJ", harghita: "HR",
  hunedoara: "HD", ialomita: "IL", iasi: "IS", ilfov: "IF", maramures: "MM", mehedinti: "MH", mures: "MS", neamt: "NT", olt: "OT", prahova: "PH", salaj: "SJ", "satu mare": "SM",
  sibiu: "SB", suceava: "SV", teleorman: "TR", timis: "TM", tulcea: "TL", vaslui: "VS", valcea: "VL", vrancea: "VN",
};
/** "Timiș" → "TM" (a code stays a code). */
export const countyCode = (v: string | null | undefined) => {
  if (!v) return "";
  const up = v.trim().toUpperCase();
  if (AV_COUNTIES.includes(up)) return up;
  const f = fold(v).replace(/^(judetul|jud) /, "").replace(/ sector \d$/, "");
  return COUNTY_NAMES[f] ?? (f.startsWith("bucuresti") ? "B" : "");
};

/** Our purpose → theirs. */
export const avPurpose = (p: string | null | undefined) => {
  const f = fold(p ?? "");
  if (/garant|credit/.test(f)) return "Garantarea unui imprumut bancar";
  if (/impozit/.test(f)) return "Impozitare";
  if (/esalon/.test(f)) return "Esalonare datorii ANAF";
  if (/vanzare|cumparare|achizit/.test(f)) return "Informativ in vederea achizitiei";
  if (/informa/.test(f)) return "Informativ";
  if (/executare/.test(f)) return "Executare";
  return "Altele";
};

/** The designated user (a bank) → their list's spelling; another name stays as it is. */
export const avBank = (name: string | null | undefined) => {
  if (!name) return "";
  const f = fold(name);
  const hit = AV_BANKS.find((b) => { const g = fold(b); return f === g || f.startsWith(g) || g.startsWith(f); })
    ?? (/unicredit/.test(f) ? "UNICREDIT BANK" : /transilvania/.test(f) ? "BANCA TRANSILVANIA" : /comerciala romana|^bcr\b/.test(f) ? "BANCA COMERCIALA ROMANA"
      : /raiff?eisen/.test(f) ? "RAIFEISSEN BANK" : /otp/.test(f) ? "OTP BANK" : /cec/.test(f) ? "CEC BANK" : /alpha/.test(f) ? "ALPHA BANK" : /garanti/.test(f) ? "GARANTI BANK"
      : /techventures/.test(f) ? "TECHVENTURESBANK" : /exim|import export/.test(f) ? "EXIM BANK" : /patria/.test(f) ? "PATRIA BANK" : /romaneasca/.test(f) ? "BANCA ROMANEASCA" : null);
  return hit ?? name.trim();
};
/** NAI only for Banca Transilvania and TechVentures Bank, else APP (the form's own rule). */
export const avFirmFor = (bank: string) => (/TRANSILVANIA|TECHVENTURES/.test(bank.toUpperCase()) ? "NAI" : "APP");

/** Our category / type → their type and subtype ("Altele" when there is no match). */
export const avType = (category: string | null) => ({
  REZIDENTIAL: "Rezidential", COMERCIAL: "Comercial", INDUSTRIAL: "Industrial", TEREN: "Teren ", "PROPRIETATE AGRICOLA": "Agricola", MIXT: "Mixt",
} as Record<string, string>)[category ?? ""] ?? "Alte tipuri proprietati";
export const avSubtype = (type: string | null) => {
  const t = (type ?? "").toUpperCase();
  if (t.startsWith("APARTAMENT")) return "Apartament";
  if (t === "CASA CU TEREN") return "Casa cu teren";
  if (t === "ANSAMBLU REZIDENTIAL") return "Ansamblu rezidential";
  if (t === "SPATIU DE BIROURI - CLADIRE INDEPENDENTA") return "Cladire de birouri";
  if (t.startsWith("BLOC APARTAMENTE")) return "Bloc de apartamente";
  return "Altele";
};
export const avMobile = (type: string | null) => {
  const t = (type ?? "").toUpperCase();
  return /AUTOTURISM|AUTOUTILITARA|MOTOSCUTER/.test(t) ? "Autoturisme" : t === "UTILAJ" ? "Masini" : "Altele";
};

export type AvAddress = { county: string; city: string; street: string; number: string; block: string; stair: string; floor: string; apartment: string };
export type AvForm = {
  firm: string; client_id: string; name: string; pj: boolean; legal_rep: string; cnp: string; cui: string; reg_no: string;
  addr: AvAddress; email: string; recipient: string; branch: string; officer_email: string; phone: string; purpose: string;
  same: boolean; fee_vat: boolean; due_days: string;
};
export type AvAsset = {
  id: string; property_id: string; mobile: boolean; label: string;
  state: string; type: string; subtype: string; details: string; cf: string; parking: string; area: string; fee: string;
  addr: AvAddress; postal: string; district: string; days_min: string; days_max: string;
  // movable goods
  make: string; model: string; year: string;
};

const blank = (v: string | null | undefined) => !(v ?? "").toString().trim();
const okEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());

/** What is still missing for the form (the fields their validated sample fills in). */
export function avMissing(f: AvForm, assets: AvAsset[], hasRecipient: boolean): string[] {
  const m: string[] = [];
  if (blank(f.firm)) m.push("Firma facturată (APP / NAI)");
  if (blank(f.name)) m.push("Denumire client");
  if (f.pj ? blank(f.cui) : blank(f.cnp)) m.push(f.pj ? "CUI client" : "CNP client");
  if (!f.pj && !blank(f.cnp) && !/^\d{13}$/.test(f.cnp.trim())) m.push("CNP client (13 cifre)");
  if (blank(f.addr.county) || !AV_COUNTIES.includes(f.addr.county)) m.push("Județ client");
  if (blank(f.addr.city)) m.push("Localitate client");
  if (blank(f.addr.street)) m.push("Stradă client");
  if (blank(f.addr.number)) m.push("Nr. client");
  if (!okEmail(f.email)) m.push("Email client (obligatoriu)");
  if (hasRecipient && blank(f.recipient)) m.push("Destinatar raport");
  if (f.phone.replace(/\D/g, "").length < 9) m.push("Telefon client");
  if (blank(f.purpose)) m.push("Scop evaluare");
  if (!/^\d+$/.test(f.due_days.trim())) m.push("Nr. zile scadență factură");
  if (!assets.length) m.push("Cel puțin un bun");
  assets.forEach((a, i) => {
    const w = `Bunul ${i + 1}`;
    if (a.mobile) {
      if (blank(a.type)) m.push(`${w}: tip bun mobil`);
      if (blank(a.fee)) m.push(`${w}: onorariu`);
      return;
    }
    if (blank(a.state)) m.push(`${w}: existentă / în construcție`);
    if (blank(a.type)) m.push(`${w}: tip proprietate`);
    if (blank(a.subtype)) m.push(`${w}: subtip`);
    if (blank(a.details)) m.push(`${w}: detalii`);
    if (blank(a.cf)) m.push(`${w}: nr. CF`);
    if (blank(a.fee)) m.push(`${w}: onorariu`);
    if (blank(a.addr.county) || !AV_COUNTIES.includes(a.addr.county)) m.push(`${w}: județ`);
    if (blank(a.addr.city)) m.push(`${w}: localitate`);
    if (blank(a.addr.street)) m.push(`${w}: stradă`);
    if (blank(a.addr.number)) m.push(`${w}: nr.`);
    if (blank(a.postal)) m.push(`${w}: cod poștal`);
    if (blank(a.days_min) || blank(a.days_max)) m.push(`${w}: nr. zile min / max`);
  });
  return m;
}
