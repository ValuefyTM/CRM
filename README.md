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
- Portal: sign-in with Client / Colaborator tabs, invitation, home (orders come in phase 2), "Contul meu".

## Cloudflare setup
1. **Workers & Pages → Create → Import a repository** → this repo.
   - Build command: `npx opennextjs-cloudflare build`
   - Deploy command: `npm run cf:deploy` (applies the CRM migrations, then deploys)
2. In `wrangler.jsonc` set `database_id` to the ID of **valuefy-db** (Storage & Databases → D1 → valuefy-db).
3. **Settings → Variables and Secrets** (runtime):
   - `CRM_OWNER_EMAILS` — e.g. `office@valuefy.ro`; these addresses get an owner account at their first sign-in.
   - `RESEND_API_KEY` (secret) and `CRM_EMAIL_FROM` — e.g. `VALUEFY <cont@valuefy.ro>`; the domain must be verified in Resend, otherwise codes and invitations can't be emailed.
4. **Settings → Domains & Routes → Custom domain**: `crm.valuefy.ro` and `portal.valuefy.ro`.

## Local development
```
cp .dev.vars.example .dev.vars        # CRM_OWNER_EMAILS=…
npm run db:migrate:local
npm run preview                        # http://localhost:8787/crm
```
Without `RESEND_API_KEY`, sign-in codes and invitation links are printed in the terminal.
