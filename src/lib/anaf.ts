// Server-only: company details by CUI from ANAF's public VAT registry web service (free, no key or account).
// ANAF sometimes rejects requests from foreign data centres; callers fall back to manual entry.

export type CompanyInfo = {
  cui: string; name: string; reg_no: string | null; address: string | null; city: string | null; county: string | null;
  phone: string | null; vat_payer: boolean; caen: string | null; status: string | null; inactive: boolean;
};

const clean = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().replace(/\s+/g, " ") : null);
const title = (v: string | null) => (v ? v.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase()) : v);

export async function lookupCui(raw: string): Promise<{ ok: true; company: CompanyInfo } | { ok: false; error: string }> {
  const cui = raw.replace(/^RO/i, "").replace(/\D/g, "");
  if (cui.length < 2 || cui.length > 10) return { ok: false, error: "CUI-ul nu pare valid." };
  const today = new Date().toISOString().slice(0, 10);
  let data: { found?: Record<string, Record<string, unknown>>[]; notFound?: unknown[] } | null = null;
  try {
    const res = await fetch("https://webservicesp.anaf.ro/api/PlatitorTvaRest/v9/tva", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([{ cui: Number(cui), data: today }]),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return { ok: false, error: `ANAF nu răspunde momentan (${res.status}). Completează datele manual.` };
    data = await res.json();
  } catch {
    return { ok: false, error: "ANAF nu răspunde momentan. Completează datele manual." };
  }
  const f = data?.found?.[0];
  if (!f) return { ok: false, error: "CUI-ul nu a fost găsit la ANAF." };
  const g = f.date_generale ?? {};
  const s = f.adresa_sediu_social ?? {};
  const street = [clean(s.sdenumire_Strada), clean(s.snumar_Strada) && `nr. ${clean(s.snumar_Strada)}`, clean(s.sdetalii_Adresa)].filter(Boolean).join(", ");
  const city = clean(s.sdenumire_Localitate);
  const county = clean(s.sdenumire_Judet);
  return {
    ok: true,
    company: {
      cui,
      name: clean(g.denumire) ?? "",
      reg_no: clean(g.nrRegCom),
      address: street || clean(g.adresa),
      city: city ? title(city.replace(/^(Mun\.|Oraș|Oras|Com\.|Sat)\s*/i, "")) : null,
      county: county ? title(county.replace(/^Jud(\.|etul)\s*/i, "")) : null,
      phone: clean(g.telefon),
      vat_payer: (f.inregistrare_scop_Tva as { scpTVA?: boolean } | undefined)?.scpTVA === true,
      caen: clean(g.cod_CAEN),
      status: clean(g.stare_inregistrare),
      inactive: (f.stare_inactiv as { statusInactivi?: boolean } | undefined)?.statusInactivi === true,
    },
  };
}
