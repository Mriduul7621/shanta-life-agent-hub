# Shanta Life Agent Hub

One login for the six tools the Shanta Life field force already uses —
LeadFlow, Learning Hub, PremiumPulse, SDPP Projection, Income Calculator
and the Sales Command Center — plus a link to the official agent portal
for proposals.

**Plan A: nothing is rebuilt or moved.** The Hub is a thin shell: one login,
one home screen, one navigation. Every tool keeps running where it runs today
and opens from the Hub. See the full plan in
`~/workspace/agent-hub-plans/plan-a.html` and the verified tool inventory in
[`INVENTORY.md`](INVENTORY.md).

> **Status: Milestone 3** — Dashboard page (live Sales Command Center
> summary) + due-premium widget on Home, on top of Milestone 2's RS256 SSO
> + module handoff for the three joined calculators, with same-tab
> navigation for all module tiles (Mahadi's decision 2026-11-20).
> Local build only. Nothing here is deployed, and nothing touches any live
> system (the Dashboard only *reads* the SCC's public sheet — see below).

## Run it

```bash
cp .env.example .env   # demo auth OFF by default; dev-only RS256 key (see below)
npm install
npm run dev            # http://localhost:5173
npm run build          # build into dist/ (target from HUB_BUILD_TARGET, default production)
npm run preview        # serve the production build
npm run qa             # performs its own demo-enabled build, then headless-Chrome checks + screenshots
npm run qa:scc-live    # live SCC data check (Node; fetches the real gviz CSVs)
npm run keygen         # print a fresh RSA-2048 keypair (never writes .env)
```

Requirements: Node 20+ (built with Node 24). No other services needed —
the demo provider runs entirely in the browser. Milestone 3's Dashboard
fetches the Sales Command Center's public sheet at runtime (see "Dashboard
data" below); without network it shows an error state, never fake numbers.

For local demo sign-in, set in your `.env` (gitignored):

```bash
HUB_BUILD_TARGET=dev     # dev builds allow demo auth + local signing
VITE_DEMO_AUTH=true      # enables the 4 fictional demo users
VITE_JWT_PRIVATE_KEY_B64=<dev key>   # from `npm run keygen`, or the shared dev key
```

The private key must be the pair of the public key committed in
`src/auth/keys.ts`, or token verification fails. `npm run qa` works without
any of this — it forces its own build env and generates an ephemeral keypair
when no `.env` key exists, so it passes from a fresh clone.

## Demo sign-in (dev only)

Demo auth is env-gated (`VITE_DEMO_AUTH=true`) and **must never be enabled in
a production build**. All four users are fictional — `999xxxx` IDs that match
no real employee — and no real credential exists anywhere in this repo.

| Employee ID | Role | PIN | Notes |
|---|---|---|---|
| 9990001 | Employee | 123456 | First login forces a PIN change (tests the must-change flow) |
| 9990002 | Team Lead | 123456 | Own widgets + team section |
| 9990003 | Manager | 123456 | Downline totals + team section |
| 9990004 | Admin / T&D | 123456 | Zero-state widgets + console placeholder on Profile |

Login behaviour (matches the Learning Hub contract from Plan A):

- 5 wrong attempts locks the account for **15 minutes** (persisted in
  localStorage, so reloading does not reset it).
- First login with a temporary PIN forces a new 6-digit PIN before the home
  screen appears.
- Sessions expire after **1 hour**; the app checks expiry every 30 seconds
  and signs out with a notice.
- Sign-out clears the session token from sessionStorage.

## Architecture

```
src/
  main.tsx                 entry + service-worker registration (prod only)
  App.tsx                  shell: login → forced-change → layout + views
  auth/
    types.ts               AuthProvider interface, HubUser, errors
    AuthContext.tsx        session restore, JWT issue/verify, sign-out
    jwt.ts                 RS256 sign/verify (WebCrypto, no deps)
    keys.ts                bundled Hub SSO PUBLIC key + kid (public — safe to commit)
    demoProvider.ts        dev-only demo users, lockout, forced change
    supabaseProvider.ts    STUB — Milestone 2 design documented, not wired
  sso/
    handoff.ts             Hub → module fragment-URL handoff (same-tab)
  i18n/
    dictionary.ts          every UI string, Bangla + English
    I18nContext.tsx        EN default, EN|BN pill, localStorage persistence
  data/
    demoData.ts            per-role demo widget data (clearly fictional)
    modules.ts             module tiles — URLs from INVENTORY.md only, ssoJoined flags
    sccParse.ts            SCC CSV parser + KPI aggregation (pure, no browser APIs)
    sccData.ts             SCC live gviz fetch + session cache
  components/              Layout (sidebar/bottom nav), WidgetCard,
                           ModuleTile, DuePremiumsWidget, LanguagePill, icons
  pages/                   Login, ForceChange, Home, Module, Dashboard, Profile
public/
  manifest.webmanifest     PWA manifest (installable)
  sw.js                    offline-tolerant app-shell service worker
  icons/                   geometric hub icon (NOT the Shanta logo)
supabase/schema.sql        prepared Hub auth schema — LOCAL ONLY, never run
docs/SSO_TOKEN.md          the SSO token: RS256 format, claims, verification, rotation
docs/SSO_PRODUCTION.md     production design: server issuer, secrets, rotation runbook, checklist
scripts/gen-dev-keys.mjs   print a fresh RSA-2048 keypair (never writes .env)
scripts/fixtures/stub-module.html  QA stub module (module side of the handoff protocol)
scripts/qa-screenshots.mjs headless-Chrome QA (86 checks + screenshots)
scripts/qa-scc-live.mjs   live SCC data check (Node; real gviz CSVs)
qa/                        QA screenshots (375 / 768 / 1440 px)
```

### Build targets

`HUB_BUILD_TARGET` is `dev` | `qa` | `production`, **default production**.
Set it in the shell or in `.env`. The guard in `vite.config.ts` makes a
production-target build FAIL FAST with a clear message if
`VITE_DEMO_AUTH=true` or any `VITE_JWT_*` signing variable is set — demo
users and signing keys must never ship in a production bundle. Dev and QA
builds set the target explicitly; `npm run qa` forces `HUB_BUILD_TARGET=qa`
itself.

### Auth providers

`AuthContext` picks a provider by env: `VITE_DEMO_AUTH=true` → the demo
provider; anything else → the Supabase provider stub, which fails closed
(`not_configured`) until it is wired. Adding a provider means implementing
the `AuthProvider` interface in `src/auth/types.ts` — sign-in and
credential change, nothing else. A provider may return a server-issued
token in `SignInResult.token`; when it does, `AuthContext` uses that token
instead of signing locally (the production path — the demo provider returns
none). The Supabase design (Edge Function verify + issue) is documented in
`src/auth/supabaseProvider.ts` and `docs/SSO_PRODUCTION.md`.

### SSO token

On successful sign-in the Hub holds a signed JWT (RS256, 1-hour expiry)
with claims `sub` (Employee ID), `name`, `role`, `iat`, `exp`, `iss`. The
token lives in `sessionStorage` and is verified (signature + claims) on
session restore and every 30 seconds. **Dev/QA builds sign tokens in the
browser with a dev-only private key from `.env`** so the format and the
handoff are verifiable end to end. Production tokens are issued server-side
— the browser never holds a signing key. Full spec, verification steps,
key distribution and rotation: [`docs/SSO_TOKEN.md`](docs/SSO_TOKEN.md);
production design: [`docs/SSO_PRODUCTION.md`](docs/SSO_PRODUCTION.md).

### Module handoff (Milestone 2, same-tab)

Every enabled module tile is a plain same-tab link (Mahadi's decision
2026-11-20 — same tab over new tab and over iframe). Modules flagged
`ssoJoined: true` in `src/data/modules.ts` — PremiumPulse, SDPP
Projection and Income Calculator — link to the module URL with the SSO
token in the URL fragment (`<module-url>#hub-token=<JWT>`, built by
`src/sso/handoff.ts`). A fragment is never sent to the server, and the
module strips it immediately on load. A module without join code ignores
the fragment and runs standalone — that is the graceful path, not an
error. **Sign-out limitation (expected):** same-tab navigation has no
second window to notify, so Hub sign-out does not reach a module the
agent already navigated to — module sessions end at token expiry (≤ 1 h).
LeadFlow, Learning Hub and the Sales Command Center are NOT joined yet —
their tiles stay plain links until their join milestone.

### Roles

| Role | Home view |
|---|---|
| Employee | Own widgets only |
| Team Lead | Own widgets + team section (team totals) |
| Manager | Own widgets (mostly zero) + downline team section |
| Admin / T&D | Zero-state widgets + disabled console placeholder on Profile |

Visibility follows the reporting tree (Plan A §05). The demo data differs
visibly per role so each view is verifiable — see `src/data/demoData.ts`.

### i18n

Every UI string lives in `src/i18n/dictionary.ts` (Bangla + English). Bangla
is the default; the BN|EN pill in the header and on Profile switches language
and persists the choice in localStorage. Bangla renders from the system font
stack (Noto Sans Bengali / Nirmala UI / Kohinoor Bangla) — no font downloads.

### Dashboard data

The Dashboard page (`src/pages/DashboardPage.tsx`) loads the Sales Command
Center's own Google Sheet live, as public gviz CSV — the same tabs
(`Producer info`, `Training Data`), the same header-alias mapping and the
same KPI formulas the SCC app itself uses. No secret is involved: the sheet
is link-shared and the fetch runs in the browser. The parser and the
aggregation are pure functions in `src/data/sccParse.ts` (no browser APIs),
so the Node check `npm run qa:scc-live` runs the exact production code
against the real CSVs. Details, including the verified mapping and the two
documented deviations from the SCC (quote-aware CSV parsing; GM leaderboard
with the orphan rule, because the live sheet has no BE columns), live in
`~/workspace/agent-hub-m2/M3_DESIGN.md`.

The Dashboard is organisation-wide for every role and labelled as such —
per-team scoping needs a verified Employee-ID ↔ producer-code join, which
does not exist yet. If the fetch fails, the page shows an error state with
Retry and the link to the full SCC; it never substitutes demo numbers.

### PWA / Capacitor

The app ships a web manifest, a service worker (app-shell caching, registered
in production builds only) and a geometric app icon. It uses a relative Vite
base (`base: './'`) so the same build runs from `file://` and, later, from a
Capacitor webview. Capacitor is **not** initialised yet — that is a later
milestone.

## What is demo vs real

| Real | Demo / placeholder |
|---|---|
| React 19 + Vite 7 + Tailwind 4 + TS scaffold | Demo auth provider (4 fictional users) |
| Login, lockout, forced-change, session expiry flows | Home widget numbers (per-role demo data) |
| Dashboard KPIs — live SCC sheet (public gviz CSV) | Due-premium widget rows (demo — the Due & Lapse sheet needs a service-account secret; see M3_DESIGN.md §2.6) |
| RS256 JWT format + verification (dev keypair) | Supabase provider (stub — no backend) |
| SSO handoff to the 3 joined calculators | LeadFlow / Learning Hub not joined yet (plain links) |
| Build-target guard (production build fails on demo auth / signing keys) | Proposals tile disabled (production portal URL unconfirmed) |
| BN/EN i18n for every UI string | Admin console (placeholder, later milestone) |
| Module tiles linking to the 6 verified production URLs | Real LeadFlow / Learning Hub widget data (later milestones) |
| PWA manifest + service worker + icon | |
| All-device layouts (phone / tablet / laptop) | |

## Follow-ups (not Milestone 3)

1. **Real Shanta logo** — the Hub currently uses a text wordmark ("Shanta
   Life" + "Agent Hub") and a geometric icon. Do not recreate the logo: integrate
   the approved vector asset from the brand guidelines when IT/brand approves.
2. **Supabase wiring** — implement `supabaseProvider.ts` against the schema in
   `supabase/schema.sql` (Edge Function for verify + server-side RS256 issue,
   per `docs/SSO_PRODUCTION.md`). The schema file is prepared locally only;
   it has never been run anywhere.
3. **Proposals portal URL** — only the UAT URL exists in the exploration
   report; the production URL needs IT confirmation. Never link UAT from the Hub.
4. **Capacitor wrap** for a Play Store / installable build.
5. **LeadFlow and Learning Hub SSO join** — in-Hub framing + token sign-in;
   real widget data from LeadFlow / Learning Hub.
6. **Due-premium real data** — needs a Hub-side server endpoint holding the
   Google service-account key, or a scoped CORS-enabled due feed from the
   Retail Dashboard. Neither exists yet; the widget stays demo-marked until
   one does.

## QA

`npm run qa` runs `scripts/qa-screenshots.mjs` — 86 checks. It performs its
own demo-enabled build first (`HUB_BUILD_TARGET=qa` + `VITE_DEMO_AUTH=true`,
script-forced, with an ephemeral keypair when no `.env` key exists), so it
passes from a fresh clone. Coverage: the Milestone 1 suite (login for all 4
roles, JWT claim checks, lockout after 5 wrong PINs, the forced-change flow,
sign-out clearing the session, BN/EN switching, role-view differences,
screenshots at 375 / 768 / 1440 px with horizontal-overflow checks), plus
Milestone 2: RS256 signature verification of issued tokens (Node `crypto` +
the app's own `verifySsoToken`), 8 negative cases (tampered payload,
expired token, wrong `iss`, `alg` none, `alg` HS256, unknown `kid`, empty
`sub`, bad role), the SSO handoff end-to-end against a local stub module
fixture (`scripts/fixtures/stub-module.html` — no live URLs): the joined
tile's href carries a valid token in `#hub-token=`, the stub verifies it
and reports a valid hub session, the fragment is stripped, Back to Hub
returns to the still-signed-in Hub, and an expired token clears the module
session (same-tab has no cross-window sign-out broadcast — expiry is the
mechanism, by design), tile wiring (all enabled tiles are same-tab links),
and the production-target guard (bad builds fail; a clean production build
has no demo users and sign-in fails closed), plus Milestone 3: the Dashboard
page (terminal state + SCC link + refresh, and the ready state against a
synthetic session cache with exact figures) and the due-premium widget (DEMO
badge + note, demo rows, empty state), with dashboard screenshots at
375 / 768 / 1440 px and horizontal-overflow checks. Screenshots live in `qa/`.

`npm run qa:scc-live` runs `scripts/qa-scc-live.mjs`: it fetches the SCC's
real gviz CSVs and runs the Hub's own parser + aggregation against them —
the live-data proof for the Dashboard, since this VM's headless Chrome has
no external network and the in-browser fetch cannot succeed here.

Note: the VM's Chrome build hard-blocks loopback navigation
(`ERR_BLOCKED_BY_LOCAL_NETWORK_ACCESS_CHECKS`, not lifted by the standard
flag), so QA runs against `dist/` via `file://` — which is why the app uses a
relative base. Point `HUB_QA_URL` at a live server to QA over HTTP instead
(Milestone 1 checks only in that mode). The handoff test navigates same-tab
to a temp `file://` stub fixture, so it needs no loopback server.
