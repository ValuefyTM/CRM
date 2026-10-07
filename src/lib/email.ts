// Server-only: email through Resend. Returns false (never throws) when it cannot send.
// RESEND_API_KEY + CRM_EMAIL_FROM (e.g. "VALUEFY <cont@valuefy.ro>", the domain must be verified in Resend).
export async function sendEmail(opts: { to: string; subject: string; html: string; text: string }): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.CRM_EMAIL_FROM || process.env.LEAD_EMAIL_FROM;
  if (!apiKey || !from) {
    // Local development without email: show the message in the server log instead.
    console.warn(`[email] not configured — would send to ${opts.to}: ${opts.subject}\n${opts.text}`);
    return false;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [opts.to], subject: opts.subject, html: opts.html, text: opts.text }),
    });
    if (!res.ok) {
      console.error("[email] failed", res.status, await res.text());
      return false;
    }
    return true;
  } catch (error) {
    console.error("[email] failed", error);
    return false;
  }
}

export const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Simple branded layout shared by every email. */
export function layout(opts: { eyebrow: string; title: string; body: string; button?: { label: string; url: string }; foot: string }) {
  const btn = opts.button
    ? `<p style="margin:24px 0"><a href="${esc(opts.button.url)}" style="display:inline-block;background:#F2A93B;color:#111111;font-weight:bold;text-decoration:none;padding:14px 22px;border-radius:12px">${esc(opts.button.label)}</a></p>`
    : "";
  return `<!DOCTYPE html><html lang="ro"><body style="margin:0;padding:0;background:#F2ECE0">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F2ECE0;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#FFFFFF;border-radius:16px;overflow:hidden;font-family:Verdana,Geneva,sans-serif;color:#111111">
<tr><td style="background:#111111;padding:20px 28px;color:#F5BE66;font-size:12px;font-weight:bold;letter-spacing:2px">VALUEFY</td></tr>
<tr><td style="padding:28px">
<p style="margin:0 0 6px;font-size:12px;font-weight:bold;letter-spacing:1px;color:#9A5F00;text-transform:uppercase">${esc(opts.eyebrow)}</p>
<h1 style="margin:0 0 14px;font-size:21px;line-height:1.3">${esc(opts.title)}</h1>
${opts.body}${btn}
</td></tr>
<tr><td style="background:#FBF8F2;padding:16px 28px;font-size:12px;line-height:1.6;color:#6B6B85">${opts.foot}</td></tr>
</table></td></tr></table></body></html>`;
}
