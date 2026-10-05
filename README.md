# VALUEFY CRM & Portal colaboratori

One Next.js app on Cloudflare Workers, two addresses:

| Address | Who | Code |
|---|---|---|
| `crm.valuefy.ro` | VALUEFY team | `src/app/crm/**` |
| `portal.valuefy.ro` | partners (brokers, agencies, banks…) | `src/app/portal/**` |

Routing by host is in `next.config.ts` (rewrites). On any other host (workers.dev, localhost) use `/crm` and `/portal`.

It shares the **valuefy-db** D1 database with the website, so website requests (`leads`) are visible here.
CRM migrations are numbered `1xxx` (`migrations/`) so they never clash with the website's `0xxx`.

## Phase 1 (this version)
- Team accounts (`staff_users`): owner / admin / staff. Sign-in with a 6-digit code or a one-time link by email — no passwords.
- Partners (`partners`) and their portal users (`partner_users`): create in the CRM, invite by email, the person activates the account (name, phone, terms) and signs in with an email code.
- Suspend a partner or disable a person (signs them out everywhere), resend invitations, audit history (`audit_log`).
- Portal: sign-in, invitation, home (orders come in phase 2), "Contul meu".

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
