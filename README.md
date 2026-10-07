# VALUEFY CRM & Portal (clienți și colaboratori)

One Next.js app on Cloudflare Workers, two addresses:

| Address | Who | Code |
|---|---|---|
| `crm.valuefy.ro` | VALUEFY team | `src/app/crm/**` |
| `portal.valuefy.ro` | clients and partners (brokers, agencies, banks…), tabs on the sign-in page | `src/app/portal/**` |

Routing by host is in `next.config.ts` (rewrites). On any other host (workers.dev, localhost) use `/crm` and `/portal`.

It shares the **valuefy-db** D1 database with the website, so website requests (`leads`) are visible here.
CRM migrations are numbered `1xxx` (`migrations/`) so they never clash with the website's `0xxx`.

## Phase 1 (this version)
- One `users` table for every account (migration `1001_users.sql`), shown in the CRM under **Utilizatori** with three tabs:
  - **Interni** — the team: owner / administrator / operator / evaluator, employee or external contractor; evaluators have ANEVAR number, specialisations (EPI, EBM, EI, EIF) and covered area. Sign in to the CRM.
  - **Colaboratori** — people of partner firms (`partners`), switchable to the list of firms. Sign in to the portal.
  - **Clienți** — person or company clients. Sign in to the portal.
- Sign-in with a 6-digit code or a one-time link by email — no passwords. Partners and clients first activate the invitation (name, phone, terms); team members just sign in.
- Administrators manage team accounts; everyone in the team can add partners and clients. Disable an account or suspend a firm (signs them out everywhere), resend invitations, audit history (`audit_log`).
- Portal: sign-in with Client / Colaborator tabs, invitation, home, "Contul meu".

## Orders (phase 2a)
- Portal **Comandă nouă** (`/comenzi/noua`): the 4-step wizard from the design — property, purpose and deadline, client and inspection, documents. Partners order for their clients (everyone in the firm sees the firm's orders); clients order for themselves.
- Documents are stored in R2 (bucket `valuefy-documents`, binding `FILES`), max 20 MB each (PDF, images, Word). Orders without all required documents get the status "Documente lipsă"; the missing ones can be uploaded later from the order page.
- CRM **Comenzi**: every order with all its data and documents, filters (new, missing documents, urgent, partners / clients), badge for orders nobody has opened yet. Read-only for now: offers, evaluator assignment and invoicing come next.
- Emails: confirmation to whoever placed the order, and a notice to `ORDERS_NOTIFY_EMAIL` (comma-separated; defaults to `CRM_OWNER_EMAILS`).

## Cloudflare setup
1. **Workers & Pages → Create → Import a repository** → this repo.
   - Build command: `npx opennextjs-cloudflare build`
   - Deploy command: `npm run cf:deploy` (applies the CRM migrations, then deploys)
2. **R2 → Create bucket** `valuefy-documents` (the deploy command also tries to create it).
3. In `wrangler.jsonc` set `database_id` to the ID of **valuefy-db** (Storage & Databases → D1 → valuefy-db).
4. **Settings → Variables and Secrets** (runtime):
   - `CRM_OWNER_EMAILS` — e.g. `office@valuefy.ro`; these addresses get an owner account at their first sign-in.
   - `ORDERS_NOTIFY_EMAIL` (optional) — who gets an email for each new order; defaults to `CRM_OWNER_EMAILS`.
   - `RESEND_API_KEY` (secret) and `CRM_EMAIL_FROM` — e.g. `VALUEFY <cont@valuefy.ro>`; the domain must be verified in Resend, otherwise codes and invitations can't be emailed.
5. **Settings → Domains & Routes → Custom domain**: `crm.valuefy.ro` and `portal.valuefy.ro`.

## Bank orders by email (BCR, BRD)
The worker entry is `worker.ts`: the Next.js app plus an **email handler**. Bank notices (BCR "Cerere nouă primită în aplicatia
de Valuator: EV…", BRD "Ati fost selectat … REV…, client …") received on the intake address become bank orders (status
"Comandă primită", linked to the bank and its framework contract). The same request twice is recorded once. Notices can also
be pasted in the CRM (Comenzi → Bănci → „Adaugă din email”).

1. **Cloudflare → valuefy.ro → Email → Email Routing.** valuefy.ro mail stays where it is (Microsoft 365), so use a
   subdomain: enable Email Routing for `in.valuefy.ro` (Cloudflare adds its MX/TXT records for the subdomain only).
2. **Routing rules → Custom address** `comenzi@in.valuefy.ro` → action **Send to a Worker** → `crm`.
3. **Outlook (the mailbox that receives the bank notices)**: rule "from `valuators.prod@bcr.ro` or `valuator@brd.ro`" →
   **Redirect to** `comenzi@in.valuefy.ro` (redirect keeps the bank as sender; forward works too).
4. Variables (optional): `BANK_MAIL_SENDERS` (accepted sender domains, default `bcr.ro,brd.ro,valuefy.ro`),
   `BANK_MAIL_FORWARD` (a copy of each notice to a mailbox, must be a verified destination in Email Routing),
   `CRM_URL` (link in the team email, default `https://crm.valuefy.ro`).

**Processing** (Comenzi → order → „Procesează”): screenshot of the bank's app → client → assets → contract and team →
the report file opens with every asset (and the inspections, if chosen). With `ANTHROPIC_API_KEY` (secret) the screenshots
are read by Claude (`claude-opus-5-5`, structured output) to pre-fill the form; without it they are only kept with the order.

## Local development
```
cp .dev.vars.example .dev.vars        # CRM_OWNER_EMAILS=…
npm run db:migrate:local
npm run preview                        # http://localhost:8787/crm
```
Without `RESEND_API_KEY`, sign-in codes and invitation links are printed in the terminal.
