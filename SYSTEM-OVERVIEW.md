# System Overview — Purchase Groups Management (קבוצות רכישה — דודי וייס)

Handoff document for any agent picking up this project. It covers what the system is, how it is built, how its external connections work, how to deploy, and the pitfalls already hit. **No secrets are stored here.** Env var *names* are listed; values live in Vercel and in the gitignored `.env.local`.

**Read `TASKS.md` too** — it tracks what was done, what is open, and what to ask the user. Update it at the end of every session.

The UI language is **Hebrew (RTL)**. The user communicates in Hebrew (sometimes English). Code comments are mostly Hebrew.

---

## 1. What the system is

A back-office app for **Dudi Weiss**, who coordinates "purchase groups": a group of residents in one area or street buys many products and services (air conditioners, bars, nets, curtains, kitchens, marble, pest control, and so on) from suppliers. The app tracks each resident, their orders per product category, order status, payments, suppliers, and sends automatic voice-call notifications and reminders.

The first commits were a demo. **The real requirements come from the client's Excel file** `שמות והזמנות הלקוחות.xlsx` (private, gitignored). Cross-check against it, not against the demo commits.

## 2. Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js **14.0.4**, App Router, TypeScript |
| UI | Tailwind CSS 3, Radix UI primitives, `lucide-react`, shadcn-style components in `components/ui` |
| Backend / DB / Auth | **Supabase** (Postgres, Auth, RLS) via `@supabase/supabase-js` and `@supabase/ssr` |
| Hosting | **Vercel** (project `kvutzat-rechisha`), with a Vercel Cron |
| Telephony | **Technoline PBX** (`api.tlivr.com`): click-to-call and TTS voice messages |
| Excel | `xlsx` library (import/export) |
| `agents/` | Separate standalone Node CLI (Anthropic SDK), **not part of the web app** (see §10) |

Scripts: `npm run dev | build | start | lint`. There is no test suite.

## 3. Repository layout

```
app/
  (auth)/login/            login page
  dashboard/               home after login
  cities/ projects/[id]/   city → project (purchase group) management
  residents/[id]/          residents list + detail
  orders/[id]/             orders list + order edit page
  overview/                "סקירת פרויקט": project overview with filters
  suppliers/[id]/          suppliers (+ per-project ledger)
  categories/              product categories
  reports/                 reports
  notifications/           notifications
  voice-messages/          editor for voice-message wording (templates)
  admin/users/             user management (admin only; uses service-role)
  api/pbx/click-to-call    POST: PBX click-to-call
  api/pbx/order-voice      POST: voice message on new order ("interested")
  api/pbx/order-reminder   POST: immediate reminder after saving an event
  api/cron/reminders       GET: daily Vercel Cron for reminders (CRON_SECRET)
components/                shared UI (Sidebar, AddOrderDialog, MultiSelect, NotesSection,
                           ReminderPopup, ClickToCallButton, RoleProvider, ui/…)
lib/
  supabase/client.ts       browser client (anon key, session)
  supabase/server.ts       server client bound to the user's cookies (session)
  supabase/admin.ts        server-only client with service-role key
  supabase/schema.sql      clean-install schema (NOT fully up to date, see §5)
  supabase/migration_*.sql incremental migrations (gitignored, run manually)
  integration/pbx.ts       Technoline API wrapper
  integration/reminders.ts reminder logic (dates, Shabbat/holiday rules, sending)
  voiceTemplates.ts        voice message wording, variables, rendering
  holidays.ts              holiday dates to skip (currently empty)
  sendOrderReminder.ts, utils.ts   (utils holds STATUS_ORDER / Hebrew labels)
middleware.ts              auth gate for protected routes
vercel.json                cron schedule
agents/                    standalone multi-agent CLI (separate package.json)
סודי/                      private client data, gitignored, never commit
```

## 4. Authentication, roles, security

- **Supabase Auth**, email + password. Config set 2026-07-16: `disable_signup: true` (only manually created users can log in) and email confirmation required. A new user must be confirmed with:
  ```sql
  UPDATE auth.users SET email_confirmed_at = NOW() WHERE email = 'user@example.com';
  ```
  (`confirmed_at` is a generated column, don't set it.) `site_url` was still `http://localhost:3000` when last recorded; update it to the production Vercel URL if auth redirects misbehave.
- **`middleware.ts`** reads the session from cookies. Protected prefixes: `/dashboard /cities /projects /residents /orders /suppliers /categories /voice-messages /reports /notifications /admin` redirect to `/login` when there is no session. A logged-in user visiting `/login` goes to `/dashboard`. **`/overview` is not in that list**, so it relies on RLS and page-level handling. Check this before assuming it is protected at the route level.
- **Roles:** `admin` and `user`, exposed through `RoleProvider` (`useRole`, `useIsAdmin`). The sidebar shows "ניהול משתמשים" (`/admin/users`) only for admins.
- **RLS** is enabled on every table with `TO authenticated USING (true)`: any logged-in user can read and write. The anon key is public by design; protection = RLS + login wall.
- **Service-role key** (`SUPABASE_SERVICE_ROLE_KEY`) is used **only** in server code via `lib/supabase/admin.ts`: creating/deleting auth users (`admin/users/actions.ts`) and the cron route (no logged-in user there). Never import `admin.ts` from a `'use client'` component.

## 5. Data model (Supabase / Postgres)

Hierarchy: `cities → projects → residents → orders` (+ `order_items`, `order_payments`), plus `categories`, `suppliers`, `supplier_project_ledger`, `notifications`.

- **residents**: name, `phone`, `phone2`, `email`, `key_location`, `last_updated_at` (maintained by triggers).
- **orders**: `status`, `payment_status`, `measurements`, `measured_at`, `total_price`, `is_global_price`, `global_supplier_price`, `details` (JSONB, product-specific fields such as height / opening / shape / model), `notes`, `satisfaction_rating` (1-5) and `satisfaction_note`, `order_number`.
- **Status pipeline** (Hebrew labels in `lib/utils.ts`):
  `lead → no_answer / will_email → interested / considering → measurement_scheduled → measured → quoted → ordered → delivery_scheduled → done`, and `cancelled`.
- **Payment status:** `not_paid / advance / partial / paid_full`.
- **Voice/reminder columns** on `orders` (added by migrations, **not in `schema.sql`**): `voice_notified_at`, `status_updated_at`, `measurement_planned_time`, `measurement_planned_time_to`, `installation_planned_date`, `installation_planned_time`, `installation_planned_time_to`, `measurement_reminder_sent_at`, `installation_reminder_sent_at`. A voice-templates table backs `lib/voiceTemplates.ts` (see `migration_voice_templates.sql`).
- Categories seeded: מזגנים, סורגים, רשתות, ווילונות, מטבחים / השלמת מטבח, שיש, בדק בית, הדברה, ניקיון, ריהוט, מוצרי חשמל. Live DB (2026-11-24) has **14**, incl. מעצבת and מתכנת של התוכנה (the latter may be a test entry — ask).
- **Row counts:** `list_tables` in the Supabase MCP shows *estimated* counts that can be far off (it showed 1 category when there were 14). Always use `select count(*)` before quoting numbers to the user.

> **Schema drift warning:** `schema.sql` is a clean-install script and is behind the live DB. The incremental `migration_*.sql` files hold later changes. Treat the **live Supabase DB** as the source of truth.

### SQL migrations — important workflow
- `*.sql` is in `.gitignore`, so migrations are **never committed or deployed**. (Some older `.sql` files may still be tracked in git history; check `git ls-files '*.sql'`.)
- The **user runs migrations manually** in the Supabase SQL Editor. Write the SQL, hand it over, and say clearly that it must be run before the code that needs it goes live.
- Already run: `migration_resident_last_updated.sql`. Check the others with the user before assuming.

## 6. External connections

### 6.1 Supabase
- Project ID `njlyykkswyzhkbnmhwgt`, URL `https://njlyykkswyzhkbnmhwgt.supabase.co`.
- Env: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (public), `SUPABASE_SERVICE_ROLE_KEY` (server only, secret).
- Three clients: browser (`client.ts`), cookie-bound server (`server.ts`), service-role (`admin.ts`). Pick by context: route handlers acting for a logged-in user use `server.ts`; cron and user management use `admin.ts`.

### 6.2 Technoline PBX (phone system) — `lib/integration/pbx.ts`
- Base `https://api.tlivr.com` (`PBX_API_BASE_URL` to override). Two endpoints: `ivrFilesApi.php` (click-to-call) and `campaignApi.php` (voice campaigns).
- **Every response is HTTP 200, even on error.** The real result is the `status` field in the JSON body (`ok` expected); failures carry `note` and `errorCode`. The wrapper throws on anything that is not `ok`.
- Auth: the API key is sent both as the `X-Api-Key` header and as `apiKey` in the body (support recommends the header; their docs list the body field as required).
- `clickToCall(target, name?, extension?)` rings the agent's extension first (`PBX_AGENT_EXTENSION`), then connects to the customer. Optional `PBX_CALLER_ID`.
- `sendVoiceMessage(phone, text, ref)` runs a one-recipient TTS campaign: `dialRetries: 2`, `betweenRetries: 20`, `reasonableHours: 'yes'` (the PBX will not dial 23:00–08:00).
- `campaignRun` needs an approved caller IP; support approved the system number broadly, so no fixed IP is required.
- `normalizePhone()` accepts Israeli numbers only (strips non-digits, converts `972…` to `0…`, validates `0` + 8–9 digits).
- **Unknown:** whether the PBX itself blocks Shabbat and holidays. Our code blocks them.
- Env: `PBX_API_KEY`, `PBX_API_BASE_URL` (optional), `PBX_AGENT_EXTENSION`, `PBX_CALLER_ID` (optional).

### 6.3 Voice message flows
1. **New order notification** — `POST /api/pbx/order-voice` `{ orderId }`: only for status `interested`. Duplicate protection: **claim before send** by setting `voice_notified_at` with `.is('voice_notified_at', null)`; release the claim if the send fails. Reuse this exact pattern for any new "send once" feature.
2. **Reminder the day before a measurement / installation** — `app/api/cron/reminders` (daily) and `api/pbx/order-reminder` (immediate when the event is saved for tomorrow). Logic in `lib/integration/reminders.ts`:
   - Measurement: status `measurement_scheduled`, date in `measured_at`. Installation: status `delivery_scheduled`, date in `installation_planned_date`. Each has start/end time columns and a `*_reminder_sent_at` flag (one reminder per event, claim-before-send).
   - All date math is in **Asia/Jerusalem** time. Never on Saturday; an event on Sunday gets its reminder **Friday morning**; holidays come from `lib/holidays.ts` (empty by decision, add `YYYY-MM-DD` strings to enable).
   - An event entered for tomorrow after that day's cron already ran is sent immediately on save (within dialing hours). An event for today, or entered after 23:00 the day before, gets no reminder.
3. **Wording** is editable by the client on `/voice-messages` and stored in the DB. `lib/voiceTemplates.ts` holds defaults and variables such as `{שם}`, `{קטגוריה}`, `{מספר_הזמנה}`, `{מתי}`, `{שעה}`; if nothing is saved, the default in code is used.

### 6.4 Vercel Cron
`vercel.json` has two entries calling `/api/cron/reminders`: `0 12 * * 0-4` (Sun–Thu, 12:00 UTC) and `0 7 * * 5` (Friday, 07:00 UTC). `CRON_AFTERNOON_UTC_HOUR` / `CRON_FRIDAY_UTC_HOUR` in `reminders.ts` **must match** these. On the Hobby plan a cron has only hour-level precision (it may fire anywhere in the hour), which is why the route decides the target day and Shabbat/holiday rules itself. The route requires `Authorization: Bearer $CRON_SECRET` and returns 401 otherwise. When the target date is a no-send day it returns `{ skipped: 'no-send-day' }`.

### 6.5 Anthropic API
Only used by the standalone `agents/` CLI (`ANTHROPIC_API_KEY` in `agents/.env`, gitignored). Not used by the web app.

## 7. Environment variables

| Variable | Where | Secret? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Vercel + `.env.local` | no |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Vercel + `.env.local` | public by design |
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel (server) | **yes** |
| `PBX_API_KEY` | Vercel | **yes** |
| `PBX_API_BASE_URL`, `PBX_CALLER_ID` | Vercel (not set → defaults) | config |
| `PBX_AGENT_EXTENSION` | Vercel production = `104` (set 2026-11-24; was missing, click-to-call failed) | config |
| `CRON_SECRET` | Vercel | **yes** |
| `ANTHROPIC_API_KEY` | `agents/.env` only | **yes** |

`.env*` is gitignored. Production env vars come from the Vercel project, not from local files. Never print, log, or commit secret values.

## 8. Git and GitHub

- Remote: `https://github.com/hakoloffice7-prog/kvutzat-rechisha` (moved from `YehudaGivtovski/kvutzat-rechisha`; history rewritten to drop a leaked `agents/.env`), branch `main`. Commit messages in this repo are written in Hebrew.
- `.gitignore` excludes: `node_modules`, `.next`, `.vercel`, `.env*`, `*.sql`, `*.xlsx`, `*.py`, `*.tsbuildinfo`, `next-env.d.ts`, `.claude/`, `.idea/`, `/סודי`, `/שמות והזמנות הלקוחות/`. Never commit client data or secrets.
- The repo is currently **public** (so never commit secrets, client data or security details; GitHub push protection blocks known secret formats). Making it private is an open decision (see §9.1).
- **A `git push` does NOT deploy** (see §9.0 / §9.1). The Vercel project has no git link.

## 9. Deployment (read carefully — non-obvious)

- Vercel project `kvutzat-rechisha` (project id `prj_WH3T5x6T9X8OjJvNTZO2awUSWLC1`, org `team_D3elgtCFCrw2ar1YPGAgYAPB`), production URL `https://kvutzat-rechisha-theta.vercel.app`. Account `hakoloffice7-6187`, scope `yehudahakol`.
- **Local machine only:** the Vercel CLI is installed globally and logged in on the user's machine. Prefer the CLI over the Vercel MCP connector (unauthenticated). The user has several Vercel accounts, and logging into one can invalidate another's session. Run `vercel whoami` first. If you get `Not authorized`, ask the user to run `vercel login`.

### 9.0 Cloud session (claude.ai/code) — current method
Used for the 2026-11-24 deploys. No Vercel CLI, no `.git` tricks needed.
1. `npm ci`, `npx tsc --noEmit`, `npm run build` (needs `.env.local`; if missing ask the user to upload it — never commit it).
2. Back up the DB first (§13).
3. `python3 -I deploy.py <repo_dir> preview` — uploads only the source files listed in §9.3 step 1 via the Vercel REST API (`/v2/files` + `/v13/deployments`), so no git metadata is attached. The script is in the Drive folder (§13); `*.py` is gitignored.
4. Send the user the preview URL. Warn: preview uses the **same live Supabase DB**, and PBX/admin/cron don't work there (those env vars are production-only).
5. After the user approves: `python3 -I deploy.py <repo_dir> production`, poll `readyState` until `READY`, confirm the project's production target points at the new deployment and `crons` are present, then check `get_runtime_errors`.
- Deploying via `create_deployment` with a GitHub `gitSource` fails with a GitHub rate-limit 429 (Vercel's GitHub app is not connected to the new repo). Inline-file deploys via MCP are too large (~700KB). Use `deploy.py`.

### 9.1 Why normal deploys are blocked
The project is on the **Hobby plan with a private repo**. Vercel blocks any deploy whose git commit author (`YehudaGivtovski` on GitHub) is not a team member, and Hobby allows one member. So both `git push` auto-deploy and a plain `vercel --prod` fail with commit-author / email errors, and the build never starts (0 ms build). `vercel git disconnect` does **not** fix it. The CLI attaches git metadata whenever a `.git` folder exists. The real fix is to hide git metadata while deploying (or upgrade to Pro / make the repo public).

### 9.2 Method A — hide `.git` temporarily (try first)
```bash
mv .git .git_disabled_tmp && vercel --prod --yes; mv .git_disabled_tmp .git
```
Use `;` before the restore so `.git` always comes back. Do this proactively, not after a failure.

### 9.3 Method B — clean copy (when `.git` is locked)
If the rename fails with "Permission denied" (an IDE or app holds `.git`):
1. Copy to `$TEMP/kr-deploy` only: `app components lib middleware.ts next.config.js package.json package-lock.json postcss.config.js tailwind.config.js tsconfig.json next-env.d.ts` **and `vercel.json`** (without it the crons are lost).
2. Delete any `*.sql` from the copy. Don't copy `.git`, `node_modules`, `.next`, `.idea`, `.claude`, `agents`, `.vercel`, `*.xlsx`, `*.py`, `.env*`, or the two client-data folders.
3. Create `.vercel/project.json` in the copy with `{"projectId": "prj_WH3T5x6T9X8OjJvNTZO2awUSWLC1", "orgId": "team_D3elgtCFCrw2ar1YPGAgYAPB"}`.
4. From the copy, run `vercel --prod --yes` **in the background**.

### 9.4 Deployment etiquette
- Run deploys with `run_in_background`. The user watches the Vercel dashboard and often interrupts a quiet CLI. That is not a rejection of the deploy.
- Clean up old deployments with `vercel rm <url> --yes`, **one explicit command per deployment** (loops with variables get blocked).
- Run any required SQL migration in Supabase **before** the code that depends on it goes live.

## 13. Connections, credentials and backups (cloud sessions)

- **Cloud environment `kvutzat-rechisha`** (personal): allowed hosts `api.vercel.com`, `api.supabase.com`, `njlyykkswyzhkbnmhwgt.supabase.co`. Network secrets saved on it (injected by the proxy; never in code or env vars):
  - `api.supabase.com` — Supabase access token, **read-only**, project-scoped, 90 days (from 2026-11-24). Used for backups via `POST /v1/projects/<ref>/database/query`.
  - `api.vercel.com` — Vercel token, scope `yehudahakol`, 90 days (from 2026-11-24). Used by `deploy.py`.
  - When they expire (~2026-02-22) the user must create new ones; walk them through it step by step (they are not technical).
- **MCP connectors** on the user's claude.ai account: GitHub, Supabase (read/write, incl. `execute_sql`, `apply_migration`), Vercel (needs team access approval for `yehudahakol` via `authorize_team_access` the first time), Google Drive.
- **Google Drive folder "מערכת קבוצת רכישה"** (`19Ieuv4ES-1NHJJBgaVgkcblmb-0tcWcH`, private): Excel backups (one sheet per table + a summary sheet `_גיבוי`), plus `backup.py` and `deploy.py`. Backups contain client PII — never share or commit them.
- **Backup routine:** `python3 -I backup.py <out.xlsx>`, verify row counts against `select count(*)`, upload to the Drive folder. Do it before any DB change and before every production deploy.
- **NetFree:** the user's network uses NetFree filtering. Local Claude Code / Claude Desktop fails with a certificate error until the NetFree CA is trusted via `NODE_EXTRA_CA_CERTS` (user contacted NetFree support).
- **No machine attached** to cloud sessions yet (Remote Control folders exist on `DESKTOP-VV31CA0` but were not offered to cloud sessions).

## 10. The `agents/` folder
A separate, standalone Node CLI (`agents/package.json`, Anthropic SDK) that runs a small multi-agent workflow (archi / devi / esti: spec, build, review) in Hebrew. It has no connection to the web app or the deployment and is excluded from deploys. Ignore it unless asked.

## 11. User working preferences (important)
- **Batch workflow:** the user sends changes one at a time. For each, **just implement it**: no build, no typecheck, no dev server, no deploy. Only when the user says the batch is finished: test everything together, then deploy once (with confirmation).
- **No login credentials:** the agent can't log into the app, so it cannot visually verify screens. Say so plainly and report what was actually checked (typecheck, build, code review). Never imply the UI was seen working.
- Reply in **Hebrew** unless the user writes in English.
- Don't commit secrets, client data, `.sql`, `.xlsx`. In cloud sessions the user wants each change committed **and pushed** to GitHub right away (the container is temporary), with a Hebrew commit message; deploy only at the end of a batch, after a preview the user approves.
- The user is not technical: give click-by-click instructions, links, and ask for screenshots when stuck. Their keyboard sometimes sends Hebrew typed in English layout (e.g. `NV` = "מה").

## 12. Open items and gotchas
- Holiday list is intentionally empty (`lib/holidays.ts`). The client had not decided.
- Open question: installation spanning several days / several orders per customer: one reminder per order, or one message per customer.
- `/overview` is missing from the middleware `protectedPaths` list; verify intent.
- Click-to-call rings extension 104 first, then the customer. The user wants it to dial the customer directly. Technoline replied (2026-11-26): 104 is a SIP extension, not managed by their IVR; click2call just rings it as a normal call, and they can't add auto-answer. Fix is outside our code: enable Auto Answer on the device/softphone of 104, or ask the SIP provider holding the extensions to send `Call-Info: answer-after=0`. Pending: which device 104 is.
- `schema.sql` does not reflect the live DB (see §5).
- Untracked handoff file `HANDOFF-תזכורות-שיחות.md` describes the reminders task in more detail (written before it was implemented; part of that scope is now built).
