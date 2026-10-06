// Server-only: emails about offers (sent to the client, accepted, declined).
import { appUrl } from "./site";
import { esc, layout, sendEmail } from "./email";
import { teamInbox } from "./order-emails";
import { greetName, money, offerTotals, type Offer } from "./offers";
import { orderCode, orderPlace, orderWhat, type Order } from "./orders";

const fmtDay = (d: string) => new Date(d).toLocaleDateString("ro-RO", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Bucharest" });
export const offerLink = (o: Pick<Offer, "token">) => appUrl("portal", `/oferta/${o.token}`);

function summary(o: Offer, order: Order, urgent = false) {
  const t = offerTotals(o, urgent);
  const rows = [
    ["Ce evaluăm", `${orderWhat(order)}, ${orderPlace(order)}`],
    ["Scop", order.purpose ?? "—"],
    ["Onorariu", `${money(t.total)} cu TVA (${money(t.net)} + TVA ${o.vat_rate}%)`],
    ["Termen", `${urgent && o.urgent_days ? o.urgent_days : o.term_days} zile lucrătoare de la inspecție`],
  ];
  return `<table role="presentation" style="width:100%;border-collapse:collapse;font-size:14px;margin:8px 0">${rows
    .map(([k, v]) => `<tr><td style="padding:6px 0;color:#6B6B85;width:110px;vertical-align:top">${k}</td><td style="padding:6px 0;font-weight:bold">${esc(v)}</td></tr>`)
    .join("")}</table>`;
}

export async function sendOfferEmail(o: Offer, order: Order, to: string) {
  const link = await offerLink(o);
  const first = greetName(o.client_name);
  const hello = first ? `Bună, ${first}!` : "Bună ziua!";
  return sendEmail({
    to,
    subject: `Oferta de evaluare ${o.number} — VALUEFY`,
    text: `${hello}\nOferta pentru evaluarea solicitată (${orderWhat(order)}, ${orderPlace(order)}) este pregătită.\nTotal: ${money(offerTotals(o).total)} cu TVA, termen ${o.term_days} zile lucrătoare.\nVezi oferta, termenii de referință și acceptă online: ${link}\nOferta este valabilă până la ${fmtDay(o.valid_until)}.`,
    html: layout({
      eyebrow: `Oferta ${o.number}`,
      title: `${hello} Oferta ta de evaluare este pregătită.`,
      body: `<p style="margin:0 0 8px;font-size:15px;line-height:1.6;color:#4A4A66">${o.message ? esc(o.message) : "Am analizat solicitarea ta. Găsești mai jos un rezumat; oferta completă, cu termenii de referință ai evaluării, o poți citi și accepta online."}</p>${summary(o, order)}`,
      button: { label: "Vezi și acceptă oferta →", url: link },
      foot: `Oferta este valabilă până la ${fmtDay(o.valid_until)}. Pentru întrebări, răspunde la acest email.`,
    }),
  });
}

export async function sendAcceptedEmails(o: Offer, order: Order) {
  const link = await offerLink(o);
  const crm = await appUrl("crm", `/comenzi/${order.id}`);
  const urgent = !!o.accepted_urgent;
  const jobs: Promise<boolean>[] = [];
  if (o.sent_to)
    jobs.push(sendEmail({
      to: o.sent_to,
      subject: `Ai acceptat oferta ${o.number} — VALUEFY`,
      text: `Mulțumim! Ai acceptat și semnat oferta ${o.number}. Te contactăm pentru programarea inspecției.\nCopia semnată: ${link}`,
      html: layout({
        eyebrow: `Oferta ${o.number} · acceptată`,
        title: "Mulțumim! Oferta a fost acceptată.",
        body: `<p style="margin:0 0 8px;font-size:15px;line-height:1.6;color:#4A4A66">Ai semnat oferta și termenii de referință ai evaluării pe ${esc(new Date(o.accepted_at!).toLocaleString("ro-RO", { timeZone: "Europe/Bucharest" }))}. Te contactăm în curând pentru programarea inspecției.</p>${summary(o, order, urgent)}`,
        button: { label: "Vezi oferta semnată →", url: link },
        foot: "Păstrează acest email: linkul duce la copia semnată a ofertei.",
      }),
    }));
  for (const to of teamInbox())
    jobs.push(sendEmail({
      to,
      subject: `Ofertă acceptată ${o.number} · ${orderCode(order)}${urgent ? " · URGENT" : ""}`,
      text: `${o.accepted_name} a acceptat oferta ${o.number} (${money(offerTotals(o, urgent).total)}).\n${crm}`,
      html: layout({
        eyebrow: "VALUEFY CRM",
        title: `Ofertă acceptată ${o.number}`,
        body: `<p style="margin:0 0 8px;font-size:15px;line-height:1.6;color:#4A4A66">Semnată de <strong style="color:#17173A">${esc(o.accepted_name)}</strong>${urgent ? ", cu regim urgent" : ""}.</p>${summary(o, order, urgent)}`,
        button: { label: "Deschide comanda →", url: crm },
        foot: "Următorul pas: programarea inspecției și factura de avans.",
      }),
    }));
  await Promise.all(jobs);
}

export async function sendDeclinedEmail(o: Offer, order: Order) {
  const crm = await appUrl("crm", `/comenzi/${order.id}`);
  await Promise.all(teamInbox().map((to) => sendEmail({
    to,
    subject: `Ofertă refuzată ${o.number} · ${orderCode(order)}`,
    text: `Clientul a refuzat oferta ${o.number}.${o.decline_reason ? `\nMotiv: ${o.decline_reason}` : ""}\n${crm}`,
    html: layout({
      eyebrow: "VALUEFY CRM",
      title: `Ofertă refuzată ${o.number}`,
      body: `<p style="margin:0 0 8px;font-size:15px;line-height:1.6;color:#4A4A66">${o.decline_reason ? `Motiv: <strong style="color:#17173A">${esc(o.decline_reason)}</strong>` : "Clientul nu a lăsat un motiv."}</p>`,
      button: { label: "Deschide comanda →", url: crm },
      foot: "Poți pregăti o ofertă nouă din pagina comenzii.",
    }),
  })));
}
