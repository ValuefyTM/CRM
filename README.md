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

## Emailuri primite (bank orders by email, rules)
The worker entry is `worker.ts`: the Next.js app plus an **email handler**. Every email sent or redirected to the intake
address is kept (with its attachments, in R2) in **Emailuri primite** (Setări → Emailuri primite, `/crm/setari/emailuri`, the owner only), from any sender. The **rules**
(Setări → Emailuri primite → Reguli, the owner) decide, in order, what an email becomes: a **processing task for
a bank order** (opens „Comandă nouă” on the bank's framework contract with the order number and the client filled in;
closed when the order is saved), a plain task, or nothing (ignored). A rule is a pattern (sender / subject / text
contains) and what it reads (the code after a text, the client's name after a text). Two rules come ready: BRD
(„selectata pentru realizarea cererii EVA…, client …”) and BCR („ID de cerere: EV…”, „Numele clientului: …”). The
people a rule names get the task on the dashboard and the bell (push, email), with a reminder every 2 hours while it is
open. Emails can also be pasted in the CRM („Adaugă din email”). Code: `src/lib/mail-rules.ts`.

1. **Cloudflare → Email → Email Routing** on a domain whose mail is on Cloudflare (`uvalo.ro`): custom address
   `comenzi-valuefy@uvalo.ro` → **Send to a Worker** → `crm`. (Never onboard `valuefy.ro` itself: its mail is on
   Microsoft 365.)
2. **Outlook** (the mailbox that receives the notices): rule for the banks' notices → **Redirect to** that address.
3. Variables (optional): `BANK_MAIL_FORWARD` (a copy of each email to a mailbox, a verified destination in Email
   Routing), `CRM_URL` (links in emails, default `https://crm.valuefy.ro`).

**Processing** (Comenzi → order → „Procesează”): screenshot of the bank's app → client → assets → contract and team →
the report file opens with every asset (and the inspections, if chosen). With `ANTHROPIC_API_KEY` (secret) the screenshots
are read by Claude (`claude-sonnet-5-5` by default, `EXTRACT_MODEL` to change it, e.g. `claude-haiku-4-5`; structured output) to pre-fill the form; without it they are only kept with the order.

## Local development
```
cp .dev.vars.example .dev.vars        # CRM_OWNER_EMAILS=…
npm run db:migrate:local
npm run preview                        # http://localhost:8787/crm
```
Without `RESEND_API_KEY`, sign-in codes and invitation links are printed in the terminal.

## Localizare din cadastru (proprietăți pe hartă)

Proprietățile fără coordonate primesc centrul parcelei din planurile cadastrale ale localizatorului din VALUEFY Tools
(`/api/localizare/centroid`, Timiș). Se caută după numărul cadastral al construcției, apoi al terenului, apoi CF; la
unități individuale („259154-C1-U20”) se folosește rădăcina (primele 6 cifre), iar localitatea alege planul UAT.

- automat, la salvarea unui bun în raport (dacă proprietatea nu are coordonate);
- în masă, din pagina Proprietăți (administratori): „Localizează”, apoi „Reîncearcă negăsitele”;
- pe fișa proprietății: „Localizează din cadastru”.

Variabile: `LOCATOR_API_TOKEN` (secret, aceeași valoare și în workerul Tools) și opțional `LOCATOR_API_URL`
(implicit `https://tools.valuefy.ro`). Coordonatele găsite se marchează cu `geo_source = 'cadastru'`.

## Anunțuri de piață (Piață → `/crm/piata`)

Comparabile de pe **imobiliare.ro, storia.ro, olx.ro, publi24.ro și homezz.ro**, aduse în fiecare noapte prin Apify
(actorul `apify/web-fetch`), salvate în D1 (`market_*`, migrația `1092`) și în bucketul R2 separat **`valuefy-market`**
(binding `MARKET`): sursa completă a fiecărei pagini (`surse/<site>/<id>/<data>.json.gz`) și imaginile (`imagini/<site>/<id>/…`).

- **Căutări** (`market_searches`, editabile în pagină): o pagină de rezultate de pe un site, copiată din browser cu filtrele
  dorite, plus categoria din CRM (REZIDENTIAL, COMERCIAL, INDUSTRIAL, TEREN…) și tranzacția. Paginarea e automată.
- **Rulare**: cronul `*/5 * * * *` pornește rularea la orele și în zilele din Setări (ora României, implicit 01:07 zilnic; fiecare căutare are frecvența ei) și avansează coada (`market_jobs`):
  fiecare pas ~4 minute pornește rulări Apify (maximum cât e setat în panou, implicit 2) și le colectează pe cele terminate.
  „Rulează acum” pornește una imediat.
- **Fără descărcări inutile**: fiecare anunț are o amprentă din pagina de rezultate (preț, suprafață, titlu); dacă nu s-a
  schimbat, pagina lui nu se mai descarcă. Modificările reale (preț, descriere, imagini…) intră în `market_listing_history`.
- **Identificare**: `source` + `ext_id` (ID-ul de pe site) e unic. Duplicatele între site-uri (`dup_group`): aceeași imagine
  (sha1) sau la < 250 m cu suprafață ±3% și preț ±5% (fără coordonate: aceeași localitate). OLX: anunțurile preluate de
  pe Storia se ignoră.
- **Dispărute**: un anunț care lipsește 3 rulări la rând dintr-o căutare citită complet devine `inactiv`; pagina 404 /
  redirecționată → `expirat`.
- **Istoric pe rulare** (migrația `1095`): fiecare eveniment din `market_listing_history` ține `run_id` și, la „modificat”, `changes`
  (vechi → nou). Setări › Analize de piață arată starea pe surse, istoricul rulărilor și, pe fiecare rulare, anunțurile adăugate,
  modificate, expirate, dispărute, reapărute, erorile și rezumatul pe căutări (`market_runs.detail`, păstrat la închidere).
  Limitele unei rulări (rulări Apify, ore), încercările, pragul de „dispărut” și rezumatul pe e-mail sunt setări.
- **Duplicate comasate** (fără AI, `dedupe` în `crawler.ts`): o singură regulă, aceeași descriere + același preț + aceeași
  suprafață (anunțurile publicate din CRM-ul agenției pe mai multe portaluri). Grupul poartă id-ul celui mai complet anunț
  (`dup_group`), singurul afișat în liste și numărat în statistici.
- **Localizare pentru filtre** (migrația `1098`, `place.ts`): `loc_county`, `loc_city`, `loc_zone` sunt cheile fără diacritice și
  fără „Județul”, „Mun.”, „zona”…; filtrele Județ › Localitate › Cartier / zonă și Camere din Analize de piață lucrează pe ele.
- **Harta din Analize de piață** arată toate anunțurile filtrate: puncte pe canvas când sunt multe, etichete cu preț la apropiere.
  Anunțurile fără punct sunt puse în centrul zonei lor (sau al localității), iar cele cu punct aproximativ sunt răsfirate ușor;
  ambele au contur galben și etichetă distinctă în listă. Cifrele din filtre numără ca lista (starea aleasă, fără duplicate).
- **Contact** (migrația `1096`, `contact.ts`): persoana sau agenția, telefoanele și e-mailul, cum apar în pagina descărcată
  (datele site-ului, JSON-LD, linkuri `tel:` / `mailto:`). Telefonul afișat de un site abia după click nu este în pagină.
  Anunțurile descărcate anterior se completează între rulări, din paginile arhivate în R2.
- **Căutare text**: FTS5 (`market_listings_fts`, fără diacritice) pe titlu, descriere și toată pagina (markdown).
- **Comparabile**: pe pagina Comparabile a unei proprietăți apar și anunțurile de piață din zonă (aceeași categorie, rază,
  suprafață), cu mediana € / m². Claude: instrumentul MCP `anunturi_piata`.
- Permisiunea **Anunțuri de piață** (Setări → Permisiuni): vede; „Schimbă căutările și pornește rularea”.
- **Panoul de comandă** (Setări → Anunțuri de piață, `/crm/setari/piata`): pornire la cerere (toate căutările sau doar cele
  bifate), progres în timp real pe căutări (pagini, anunțuri descărcate / în coadă / eșuate, timp estimat), ultimele
  anunțuri procesate, oprirea rulării, rularea de noapte pornită / oprită și câte rulări Apify în paralel (setarea `market`
  din `settings`). Cât panoul e deschis, pagina avansează singură coada la câteva secunde (`POST /api/crm/market/progress`),
  fără să aștepte cronul.

Configurare: secretul **`APIFY_TOKEN`** (Settings → Variables and Secrets; https://console.apify.com/settings/integrations)
și, opțional, `MARKET_CONCURRENCY`. Bucketul `valuefy-market` îl creează comanda de deploy. Codul: `src/lib/market/`
(un parser per site în `sites/`; dacă un site își schimbă paginile și o căutare aduce brusc 0 anunțuri, acolo se repară).
Prețurile sunt cele cerute în anunțuri; termenii portalurilor restricționează de obicei extragerea automată: date pentru uz
intern (documentarea evaluărilor), fără republicare și fără datele de contact ale persoanelor.

## Expertize judiciare

Evidența dosarelor în care un evaluator este numit expert tehnic judiciar (migrația `1102`, `src/lib/expert-cases.ts`,
paginile `/expertize`). Modulul îl primește cine are bifa **Expert judiciar** pe utilizator.

- **Dosarele sunt personale**: fiecare rând ține de `owner_id` și toate citirile și scrierile trec prin el. Nu există vedere
  de administrator, iar „Vezi ca alt utilizator” nu deschide dosarele acelei persoane. Dosarele nu intră în căutarea
  globală și nici în conectorul Claude.
- Un dosar are date, obiective, părți, termene, convocări, acte (foldere predefinite + foldere proprii, versiuni la același
  nume de fișier; fișierele stau în R2 sub `expertize/<expert>/<dosar>/`) și onorariu.
- **Alerte**: pentru fiecare termen deschis, expertul este anunțat (clopoțel, telefon, e-mail) cu 7, 3 și 1 zi înainte, în
  ziua termenului și o dată după ce a fost depășit (`termNotices`).
- **Portal.just.ro** (`expert-portal.ts`, migrația `1103`): serviciul public de interogare (`portalquery.just.ro`, fără autentificare).
  „Monitorizează dosarul” îl verifică la câteva ore (cronul de 15 minute, cel mult 8 dosare pe trecere): fiecare ședință devine
  termen al dosarului, cu completul, tipul soluției, soluția pe scurt și documentul ședinței; termenul viitor apare ca termen
  deschis, cu limita de depunere. Ce e nou rămâne alertă pentru expert până apasă „Am verificat dosarul electronic”.
- **Citirea încheierii de numire** (`expert-read.ts`, Claude Haiku 5.5, cheia `ANTHROPIC_API_KEY`; modelul se poate schimba cu
  `EXPERT_READ_MODEL`): PDF-ul încărcat în „Dosar nou” completează dosarul, părțile, obiectivele (ale instanței și ale părților),
  onorariul și termenul următor; expertul verifică formularul înainte de salvare, iar fișierul intră în „Încheiere de numire”.
