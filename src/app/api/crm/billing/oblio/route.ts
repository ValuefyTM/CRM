import { staffApi } from "@/lib/api";
import { getBilling } from "@/lib/billing";
import { oblioCompanies, oblioCredentials, OblioError, oblioSeries, oblioVatRates } from "@/lib/oblio";

/** Connection check for the billing settings: credentials found, the companies of the account, their series and VAT rates. */
export async function GET(req: Request) {
  const a = await staffApi("admin");
  if ("res" in a) return a.res;
  const c = oblioCredentials();
  const creds = { email: c.email?.name ?? null, secret: c.secret?.name ?? null };
  if (!c.ok) return Response.json({ ok: false, creds, error: "Nu găsesc datele de acces Oblio în setările Cloudflare (variabilele pentru email și secretul API)." });
  try {
    const cif = new URL(req.url).searchParams.get("cif") || (await getBilling(a.db)).cif;
    const companies = await oblioCompanies(a.db);
    const known = companies.some((x) => x.cif.replace(/^RO/i, "") === cif.replace(/^RO/i, ""));
    const use = known ? companies.find((x) => x.cif.replace(/^RO/i, "") === cif.replace(/^RO/i, ""))!.cif : companies[0]?.cif ?? "";
    const [series, vat] = use ? await Promise.all([oblioSeries(a.db, use), oblioVatRates(a.db, use)]) : [[], []];
    return Response.json({ ok: true, creds, companies, cif: use, series, vat });
  } catch (e) {
    return Response.json({ ok: false, creds, error: e instanceof OblioError ? e.message : "Nu am putut contacta Oblio." });
  }
}
