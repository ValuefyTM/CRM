import { getDb } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { basePath } from "@/lib/site";
import { clientRedirects, getClient, issueCode, mcpAllowed, audit } from "@/lib/mcp-auth";
import { mcpUrls } from "@/lib/mcp-http";

// Authorization page: the team member (signed in to the CRM in this browser) approves Claude's access.
// GET shows the page (or sends to the CRM sign-in first); POST is the "Permite" / "Refuză" answer.

type Params = { clientId: string; redirectUri: string; challenge: string; method: string; state: string };

const read = (p: URLSearchParams): Params => ({
  clientId: p.get("client_id") ?? "", redirectUri: p.get("redirect_uri") ?? "", challenge: p.get("code_challenge") ?? "",
  method: p.get("code_challenge_method") ?? "", state: p.get("state") ?? "",
});

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function page(title: string, body: string, status = 200) {
  return new Response(
    `<!doctype html><html lang="ro"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>${esc(title)} · CRM VALUEFY</title><style>
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px;background:#f2ece0;color:#141414;font-family:system-ui,-apple-system,"Segoe UI",sans-serif}
.box{width:min(440px,100%);background:#fff;border:1px solid #e2d8c4;border-radius:22px;padding:28px 24px;display:flex;flex-direction:column;gap:14px;box-shadow:0 12px 28px -22px rgba(17,17,17,.35)}
img{height:24px;width:auto;align-self:flex-start}h1{margin:4px 0 0;font-size:21px;letter-spacing:-.02em}p{margin:0;font-size:14px;line-height:1.6;color:#4a4a4a}
ul{margin:0;padding-left:18px;font-size:13.5px;line-height:1.7;color:#4a4a4a}.who{padding:10px 14px;border-radius:12px;background:#fbf8f2;border:1px solid #efe9dc;font-size:13px}
.row{display:flex;gap:10px;margin-top:4px}button{flex:1;height:46px;border-radius:999px;font-size:15px;font-weight:700;cursor:pointer;border:1px solid #e2d8c4;background:#fff;color:#141414}
button.ok{background:#f2a93b;border-color:#f2a93b}button.ok:hover{background:#e0931a}small{color:#6b6b6b;font-size:12px;line-height:1.5}
</style></head><body><div class="box"><img src="/valuefy-logo.png" alt="VALUEFY">${body}</div></body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Frame-Options": "DENY", "Referrer-Policy": "no-referrer" } },
  );
}

const fail = (text: string) => page("Conectare nereușită", `<h1>Conectarea nu a putut fi făcută</h1><p>${esc(text)}</p>`, 400);

/** Checks the request; on success returns the client. Errors that cannot go back to the app are shown here. */
async function validate(db: D1Database, p: Params) {
  const client = p.clientId ? await getClient(db, p.clientId) : null;
  if (!client) return { error: fail("Aplicația nu este înregistrată. Reîncearcă adăugarea conectorului din Claude.") };
  if (!clientRedirects(client).includes(p.redirectUri)) return { error: fail("Adresa de întoarcere nu corespunde aplicației.") };
  if (!p.challenge || p.method !== "S256") return { error: fail("Cererea nu folosește PKCE (S256).") };
  return { client };
}

function back(redirectUri: string, q: Record<string, string>) {
  const u = new URL(redirectUri);
  for (const [k, v] of Object.entries(q)) if (v) u.searchParams.set(k, v);
  return new Response(null, { status: 302, headers: { Location: u.toString(), "Cache-Control": "no-store" } });
}

export async function GET(req: Request) {
  const db = await getDb();
  if (!db) return fail("Baza de date nu este disponibilă momentan.");
  const url = new URL(req.url);
  const p = read(url.searchParams);
  const v = await validate(db, p);
  if ("error" in v) return v.error;
  if (url.searchParams.get("response_type") !== "code") return back(p.redirectUri, { error: "unsupported_response_type", state: p.state });

  const user = await currentUser(db, "crm");
  if (!user) {
    const base = await basePath("crm");
    return new Response(null, { status: 302, headers: { Location: `${base}/login?next=${encodeURIComponent(url.pathname + url.search)}` } });
  }
  if (!mcpAllowed(user)) {
    return page("Acces restricționat", `<h1>Acces restricționat</h1><p>Conectarea Claude la CRM este disponibilă deocamdată doar proprietarului și administratorilor.</p>`, 403);
  }
  const hidden = Object.entries({ client_id: p.clientId, redirect_uri: p.redirectUri, code_challenge: p.challenge, code_challenge_method: p.method, state: p.state })
    .map(([k, val]) => `<input type="hidden" name="${k}" value="${esc(val)}">`).join("");
  return page("Permite accesul", `
<h1>Conectezi ${esc(v.client.name)} la CRM?</h1>
<div class="who">Cont: <b>${esc(user.name || user.email)}</b> · ${esc(user.email)}</div>
<p>${esc(v.client.name)} va putea <b>citi</b> din CRM, în numele tău:</p>
<ul><li>comenzi, rapoarte, clienți și inspecții</li><li>proprietăți evaluate și comparabile</li><li>facturi și statistici</li></ul>
<p>Nu poate modifica, șterge sau trimite nimic. Fiecare întrebare este înregistrată în istoricul CRM.</p>
<form method="post">${hidden}<div class="row"><button type="submit" name="decision" value="deny">Refuză</button><button class="ok" type="submit" name="decision" value="allow">Permite</button></div></form>
<small>Poți opri accesul oricând din CRM → Setări → Conexiuni Claude. Te întorci la: ${esc(new URL(p.redirectUri).host)}</small>`);
}

export async function POST(req: Request) {
  const db = await getDb();
  if (!db) return fail("Baza de date nu este disponibilă momentan.");
  const f = new URLSearchParams(await req.text());
  const p = read(f);
  const v = await validate(db, p);
  if ("error" in v) return v.error;
  const iss = (await mcpUrls()).issuer;
  if (f.get("decision") !== "allow") return back(p.redirectUri, { error: "access_denied", state: p.state, iss });
  // The session cookie is SameSite=Lax, so it is not sent with a form posted from another site.
  const user = await currentUser(db, "crm");
  if (!mcpAllowed(user)) return fail("Sesiunea CRM a expirat sau contul nu are acces. Reîncearcă din Claude.");
  const code = await issueCode(db, { clientId: v.client.id, userId: user.id, redirectUri: p.redirectUri, challenge: p.challenge });
  await audit(db, user.id, "mcp.authorize", v.client.name);
  return back(p.redirectUri, { code, state: p.state, iss });
}
