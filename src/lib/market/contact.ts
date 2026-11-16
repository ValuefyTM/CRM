// The contact of a listing (person or agency, phones, e-mail), as the downloaded page has it: the site's own data
// (Storia, OLX), the structured data (JSON-LD), and the tel: / mailto: links. A phone a site only shows after a click
// (fetched separately by its page) is not in the download, so it is not here either.
import type { FetchItem } from "./apify";
import { arr, between, ldJson, nextData, obj, olxState, s, unescapeHtml, uniq, walk } from "./util";

export type Contact = { name: string | null; phone: string | null; email: string | null };

/** A Romanian phone as 0XXXXXXXXX (mobile, landline), or null. */
export function phone(v: unknown): string | null {
  let d = String(v ?? "").replace(/[^\d+]/g, "");
  if (d.startsWith("+40")) d = `0${d.slice(3)}`; else if (d.startsWith("0040")) d = `0${d.slice(4)}`; else if (/^40[237]\d{8}$/.test(d)) d = `0${d.slice(2)}`;
  return /^0[237]\d{8}$/.test(d) ? d : null;
}
const clean = (v: unknown) => { const t = unescapeHtml(s(v) ?? "").replace(/\s+/g, " ").trim(); return t && t.length <= 120 ? t : null; };

export function contactOf(source: string, item: FetchItem): Contact {
  const raw = item.raw ?? item.html ?? "", md = item.markdown ?? "";
  const phones: (string | null)[] = [], emails: string[] = [];
  let name: string | null = null;
  if (source === "storia.ro") {
    const ad = obj(obj(obj(obj(nextData(raw)).props).pageProps).ad);
    for (const o of [obj(ad.owner), obj(ad.agency), obj(ad.contactDetails)]) {
      name ??= clean(o.name);
      for (const p of [...arr(o.phones), o.phone]) phones.push(phone(p));
    }
  } else if (source === "olx.ro") {
    for (const o of walk(olxState(raw))) {
      if (o.contact && typeof o.contact === "object" && o.user && typeof o.user === "object") {
        name = clean(obj(o.contact).name) ?? clean(obj(o.user).name);
        for (const p of [...arr(obj(o.user).phones), obj(o.contact).phone]) phones.push(phone(p));
        break;
      }
    }
  }
  // structured data: whoever carries a telephone
  for (const b of ldJson(raw)) for (const d of walk(b)) {
    if (d.telephone == null && d.email == null) continue;
    for (const p of [...arr(d.telephone), d.telephone]) phones.push(phone(p));
    if (typeof d.email === "string") emails.push(d.email);
    name ??= clean(d.name);
  }
  // links: the contact section when the page has one (imobiliare.ro), otherwise the whole page
  const part = between(md, "## Detalii de contact", ["\n## "]);
  for (const text of part ? [part] : [md, raw]) {
    for (const m of text.matchAll(/tel:([+\d][\d\s().-]{7,18})/g)) phones.push(phone(m[1]));
    for (const m of text.matchAll(/mailto:([^\s"'<>()?&]+@[^\s"'<>()?&]+\.[a-z]{2,})/gi)) emails.push(m[1]);
  }
  const site = source.replace(/^www\./, "");
  const mail = uniq(emails.map((e) => e.trim().toLowerCase())).filter((e) => !e.endsWith(`@${site}`) && !e.endsWith(`.${site}`)).slice(0, 2);
  const ph = uniq(phones.filter((p): p is string => !!p)).slice(0, 4);
  return { name, phone: ph.join(", ") || null, email: mail.join(", ") || null };
}
