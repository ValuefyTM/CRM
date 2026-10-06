// Server-only: emails sent when an order comes in from the portal.
import { appUrl } from "./site";
import { esc, layout, sendEmail } from "./email";
import { orderRef, propertyLabel, type OrderInput } from "./orders";
import type { User } from "./users";

/** Team inbox for new orders: ORDERS_NOTIFY_EMAIL, else the CRM owners. */
export const teamInbox = () => (process.env.ORDERS_NOTIFY_EMAIL || process.env.CRM_OWNER_EMAILS || "").split(",").map((s) => s.trim()).filter(Boolean);

export async function sendOrderEmails(user: User, id: string, seq: number, v: OrderInput) {
  const ref = orderRef(seq);
  const what = `${propertyLabel(v.property_type)}, ${v.address}, ${v.city}`;
  const portalLink = await appUrl("portal", `/comenzi/${id}`);
  const crmLink = await appUrl("crm", `/comenzi/${id}`);
  const hello = user.name ? `Bună, ${user.name.split(" ")[0]}!` : "Bună!";
  const rows = [
    ["Proprietate", what],
    ["Scop", v.purpose + (v.bank ? ` · ${v.bank}` : "")],
    ["Termen", v.urgent ? "Urgent" : "Standard"],
    ["Client", `${v.client_name} · ${v.client_phone}`],
  ];
  const table = `<table role="presentation" style="width:100%;border-collapse:collapse;font-size:14px;margin:8px 0">${rows
    .map(([k, val]) => `<tr><td style="padding:6px 0;color:#6B6B85;width:110px;vertical-align:top">${k}</td><td style="padding:6px 0;font-weight:bold">${esc(val)}</td></tr>`)
    .join("")}</table>`;

  const jobs: Promise<boolean>[] = [
    sendEmail({
      to: user.email,
      subject: `Am primit comanda ${ref}`,
      text: `${hello}\nAm primit comanda ${ref} (${what}). Pregătim oferta și revenim în cel mai scurt timp.\nUrmărește comanda: ${portalLink}`,
      html: layout({
        eyebrow: `Comanda ${ref}`,
        title: `${hello} Am primit comanda.`,
        body: `<p style="margin:0 0 8px;font-size:15px;line-height:1.6;color:#4A4A66">Pregătim oferta (onorariu și termen) și revenim în cel mai scurt timp.</p>${table}`,
        button: { label: "Vezi comanda →", url: portalLink },
        foot: "Poți adăuga oricând documentele lipsă din pagina comenzii.",
      }),
    }),
  ];
  const by = user.kind === "partner" ? `${user.name || user.email} · ${user.partner_name}` : `client: ${user.name || user.email}`;
  for (const to of teamInbox())
    jobs.push(
      sendEmail({
        to,
        subject: `Comandă nouă ${ref}${v.urgent ? " · URGENT" : ""} — ${what}`,
        text: `Comandă nouă ${ref} de la ${by}.\n${what}\nScop: ${v.purpose}\nClient: ${v.client_name}, ${v.client_phone}\n${crmLink}`,
        html: layout({
          eyebrow: "VALUEFY CRM",
          title: `Comandă nouă ${ref}${v.urgent ? " · URGENT" : ""}`,
          body: `<p style="margin:0 0 8px;font-size:15px;line-height:1.6;color:#4A4A66">Trimisă de <strong style="color:#17173A">${esc(by)}</strong>.</p>${table}`,
          button: { label: "Deschide în CRM →", url: crmLink },
          foot: "Documentele încărcate cu comanda se văd în pagina comenzii.",
        }),
      }),
    );
  await Promise.all(jobs);
}
