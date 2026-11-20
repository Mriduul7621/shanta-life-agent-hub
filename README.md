# Shanta Life Agent Hub

One login for the six tools the Shanta Life field force already uses —
LeadFlow, Learning Hub, PremiumPulse, SDPP Projection, Income Calculator
and the Retail Sales Dashboard — plus a link to the official agent portal
for proposals.

**Plan A: nothing is rebuilt or moved.** The Hub is a thin shell: one login,
one home screen, one navigation. Every tool keeps running where it runs today
and opens from the Hub. See the full plan in
`~/workspace/agent-hub-plans/plan-a.html` and the verified tool inventory in
[`INVENTORY.md`](INVENTORY.md).

> **Status: Retail Dashboard + quick actions** — Dashboard page rebuilt
> on Retail Sales data (role-scoped, via the Hub-side proxy
> `api/retail-data.js`), Home "Your tools" as one flat quick-action grid,
> and Leads/Learning pages with a DEMO summary strip + Go button — on top
> of Milestone 2's RS256 SSO + module handoff for the three joined
> calculators, with same-tab navigation for all module tiles (Mahadi's
> decision 2026-11-20) and intent-based prefetch (instant-open).
> Local build only. Nothing here is deployed, and nothing touches any live
> system (the Dashboard only *reads* the Retail Dashboard's live endpoint
> through the proxy — see below).

## Run it

```bash
cp .env.example .env   # real-auth only; dev RS256 key for the QA harness (see below)
npm install
npm run dev            # http://localhost:5173
npm run build          # build into dist/ (target from HUB_BUILD_TARGET, default production)
npm run preview        # serve the production build
npm run qa             # performs its own QA build, then headless-Chrome checks + screenshots
npm run qa:retail-live # live retail check (Node; real retail payload + proxy + fixture)
npm run keygen         # print a fresh RSA-2048 keypair (never writes .env)
```

Requirements: Node 20+ (built with Node 24). Sign-in is real Learning Hub
credentials only (Employee ID + PIN, or staff email + password) via the
Hub-side `/api/hub-auth` function — there are no demo accounts (removed
Mahadi 2026-11-20). The Dashboard calls the
Hub-side proxy `/api/retail-data` at runtime (see "Dashboard data" below);
without network (or without the proxy, e.g. a `file://` QA run) it shows
an error state, never fake numbers.

For local development, set in your `.env` (gitignored):

```bash
HUB_BUILD_TARGET=dev     # dev builds allow the QA harness key
VITE_JWT_PRIVATE_KEY_B64=<dev key>   # from `npm run keygen`, or the shared dev key
```

The private key must be the pair of the public key committed in
`src/auth/keys.ts`, or token verification fails. It is used by the QA
harness (Node-side test-token signing) and by the preview server's
`/api/hub-auth` fallback — never by the browser. `npm run qa` works
without any of this — it forces its own build env and generates an
ephemeral keypair when no `.env` key exists, so it passes from a fresh
clone.

## Sign-in (real accounts only)

Sign-in verifies against the Learning Hub credential store server-side
(`/api/hub-auth`, Phase 2). The demo accounts are gone entirely (Mahadi
2026-11-20) — there is no demo sign-in path in the app, no demo provider,
and no browser-side token signing. The `999xxxx` fixture slices behind the
proxy gates (`HUB_DEMO_FIXTURE` + 999 sub) remain as QA-only scaffolding:
the QA harness signs test tokens in Node and calls the proxies directly.

Login behaviour (matches the Learning Hub contract from Plan A):

- 5 wrong attempts locks the account for **15 minutes** (Learning Hub's
  own lockout, enforced server-side and surfaced as-is).
- A temporary PIN/password forces a change in the Learning Hub first —
  the Hub shows a link out and creates no session.
- Sessions expire after **1 hour**; the app checks expiry every 30 seconds
  and signs out with a notice.
- Sign-out clears the session token from sessionStorage and every cached
  feed summary.

## Architecture

```
src/
  main.tsx                 entry + service-worker registration (prod only)
  App.tsx                  shell: splash → login → layout + views
  auth/
    types.ts               AuthProvider interface, HubUser, errors
    AuthContext.tsx        session restore, JWT verify, sign-out
    jwt.ts                 RS256 verify (WebCrypto, no deps); sign used by the QA harness only (Node)
    keys.ts                bundled Hub SSO PUBLIC key + kid (public — safe to commit)
  sso/
    handoff.ts             Hub → module fragment-URL handoff (same-tab)
  i18n/
    dictionary.ts          every UI string, Bangla + English
    I18nContext.tsx        EN default, EN|BN pill, localStorage persistence
  data/
    demoData.ts            per-role demo widget data (clearly fictional)
    modules.ts             module tiles — URLs from INVENTORY.md only, ssoJoined flags
    retailData.ts          Dashboard proxy fetch + session cache (Employee-ID bound)
  performance/
    prefetch.ts            intent-based prefetch (instant-open, no prerender)
  components/              Layout (sidebar/bottom nav), WidgetCard,
                           ModuleTile, QuickActionTile, ModuleIcon,
                           DuePremiumsWidget, LanguagePill, icons
  pages/                   Splash, Login, Home, Module, Dashboard, Profile
api/
  retail-data.js           Vercel proxy: verifies the Hub JWT, fetches the
                           retail endpoint server-side, returns ONLY the
                           scoped summary (never raw rows)
  _lib/
    retailSummary.js       shared pure summarizer (tree, buckets, due,
                           persistency, scoping) — used by the proxy AND Node QA
    verifyJwt.js           Node RS256 verification (same strict checks as jwt.ts)
    demoFixture.js         synthetic demo slice (Preview-only, fixture-gated)
public/
  manifest.webmanifest     PWA manifest (installable)
  sw.js                    offline-tolerant app-shell service worker
  icons/                   geometric hub icon (NOT the Shanta logo)
supabase/schema.sql        prepared Hub auth schema — LOCAL ONLY, never run
docs/SSO_TOKEN.md          the SSO token: RS256 format, claims, verification, rotation
docs/SSO_PRODUCTION.md     production design: server issuer, secrets, rotation runbook, checklist
scripts/gen-dev-keys.mjs   print a fresh RSA-2048 keypair (never writes .env)
scripts/fixtures/stub-module.html  QA stub module (module side of the handoff protocol)
scripts/qa-screenshots.mjs headless-Chrome QA (137 checks + screenshots)
scripts/qa-retail-live.mjs live retail check (Node; real payload + proxy + fixture)
qa/                        QA screenshots (375 / 768 / 1440 px)
```

### Build targets

`HUB_BUILD_TARGET` is `dev` | `qa` | `production`, **default production**.
Set it in the shell or in `.env`. The guard in `vite.config.ts` makes a
production-target build FAIL FAST with a clear message if
`VITE_DEMO_AUTH=true`, any `VITE_JWT_*` signing variable is set, or
`HUB_DEMO_FIXTURE=true` — demo users, signing keys and the synthetic
retail demo slice must never ship in a production bundle. Dev and QA
builds set the target explicitly; `npm run qa` forces `HUB_BUILD_TARGET=qa`
itself.

### Auth providers

One provider: `HubAuthProvider` POSTs the Hub-side serverless function
`/api/hub-auth`, which verifies the credential against the Learning Hub
store server-side and returns a server-issued RS256 token in
`SignInResult.token`; `AuthContext` verifies that token (signature +
claims) before trusting it. The browser never holds a signing key. See
`docs/SSO_PRODUCTION.md` for the issuer design and rotation runbook.

### SSO token

On successful sign-in the Hub holds a signed JWT (RS256, 1-hour expiry)
with claims `sub` (Employee ID), `name`, `role`, `iat`, `exp`, `iss`. The
token lives in `sessionStorage` and is verified (signature + claims) on
session restore and every 30 seconds. Tokens are issued server-side
(`api/hub-auth.js`) — the browser never holds a signing key. The QA
harness signs test tokens in Node (it bundles `src/auth/jwt.ts`) to seed
sessions and call the proxies directly. Full spec, verification steps,
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
LeadFlow, Learning Hub and the Retail Sales Dashboard are NOT joined yet —
their tiles stay plain links until their join milestone.

### Tile icons (Mahadi's decision 2026-11-20)

Every tile shows the app's real icon, not the two-letter monogram. Tiles
load their icon **live** from the app's own deployed URL where one exists
(`iconUrl` in `src/data/modules.ts` — PremiumPulse, SDPP and Income use
their `/icon.svg`), so an app icon update appears in the Hub automatically.
Apps with no stable live icon URL yet use a local SVG copy in
`public/icons/modules/` (`icon` field — LeadFlow, Learning Hub and the
Retail Sales Dashboard; the Retail icon is Hub-created in the olive-tile
family, the app has only Shanta logo PNGs). Resolution is live → local →
monogram, and a failed load falls back to the monogram via `onError`, so a
tile never shows a broken image. Proposals has no app and keeps its
monogram. To flip a local icon to its live URL later, change one field.

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

The Dashboard page (`src/pages/DashboardPage.tsx`) shows Retail Sales data
— the Retail Sales Dashboard is the Hub's dashboard tool (Mahadi 2026-11-20;
the Sales Command Center sheet it replaced was a separately maintained
dataset with different figures, and is no longer a source anywhere in the
Hub). The page never fetches retail data directly: the workbook is private
(gviz returns 401) and the retail endpoint sends no CORS headers, so the
page calls the Hub-side Vercel proxy `api/retail-data.js` same-origin. The
proxy verifies the caller's Hub JWT (RS256, no JWT = 401), fetches the
retail endpoint server-to-server (no credentials needed), and returns ONLY
the computed summary for the caller's visible slice — the browser never
receives raw rows, which contain policy-owner PII. No new secrets, no
service account, no sheet-sharing change. The summarizer
(`api/_lib/retailSummary.js`) is pure — no Node/browser APIs — so the Node
check `npm run qa:retail-live` runs the exact production code against the
real payload. The full spec (formulas, join key, orphan rule, scoping) is
`~/workspace/agent-hub-retail-spec/RETAIL_DASHBOARD_SPEC.md`.

Visibility (Mahadi's standing rule): Employee sees own data only, no
leaderboard; Team Lead (≥1 subordinate) sees own + downline; Manager sees
own + subtree; Admin/T&D sees org-wide. Nobody else sees org-wide. The join
key is Employee ID = roster Code = the PR row's FA/UM/BM/AGM/DGM/GM Codes.
Orphan rows (`SLI` code / `Shanta Life Insurance PLC` name / `11…` chain)
are never merged into a real person — they show as a scoped Unassigned
line. Demo accounts (999xxxx) match no real rows, so the proxy serves them
a synthetic fixture slice (labelled DEMO in the UI) when
`HUB_DEMO_FIXTURE=true` on a non-production deployment — never in
production (the proxy requires `VERCEL_ENV !== 'production'`, and the
production build guard fails if the flag is on). If the fetch fails, the
page shows an error state with Retry and the link to the full Retail Sales
Dashboard; it never substitutes demo numbers for live ones.

### PWA / Capacitor (Android app)

The app ships a web manifest, a service worker (app-shell caching, registered
in production builds only) and a geometric app icon. It uses a relative Vite
base (`base: './'`) so the same build runs from `file://` and from a
Capacitor webview.

The Android shell is Capacitor 8 (`com.shantalife.agenthub`, "Agent Hub")
and **remote-loads the live production Hub** (`server.url`) — the APK
contains no copy of the web app, so every web deploy reaches installed
phones immediately with no new APK. The six module origins open in-app
(`server.allowNavigation`); the back button walks WebView history and
exits only at the Hub root (`src/native/backButton.ts` + the
`@capacitor/app` plugin); a local error page (`android-web/`,
`server.errorPath`) replaces the blank WebView when offline. Release
signing is from day one (release keystore in GitHub Secrets, never in
the repo); the version is owned by `android/version.properties`. Full
release procedure: `docs/ANDROID_RELEASE.md`. The CI workflow
(`.github/workflows/android.yml`) is manual-dispatch only — and it must
reach the repo via the github.com web UI, because the GitHub App cannot
push workflow files.

## What is demo vs real

| Real | Demo / placeholder |
|---|---|
| React 19 + Vite 7 + Tailwind 4 + TS scaffold | Demo auth provider (4 fictional users) |
| Login, lockout, forced-change, session expiry flows | Home widget numbers (per-role demo data) |
| Dashboard KPIs — live retail data via the Hub proxy, role-scoped | Due-premium widget rows (demo — the Due & Lapse sheet needs a service-account secret; see M3_DESIGN.md §2.6) |
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
4. **Capacitor wrap** — done (Android shell, remote-load, direct APK
   distribution; see `docs/ANDROID_RELEASE.md`). Play Store listing is a
   later decision, not release 1.
5. **LeadFlow and Learning Hub SSO join** — in-Hub framing + token sign-in;
   real widget data from LeadFlow / Learning Hub.
6. **Due-premium real data** — needs a Hub-side server endpoint holding the
   Google service-account key, or a scoped CORS-enabled due feed from the
   Retail Dashboard. Neither exists yet; the widget stays demo-marked until
   one does.

## QA

`npm run qa` runs `scripts/qa-screenshots.mjs` — 137 checks. It performs its
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
has no demo users and sign-in fails closed), plus the Retail Dashboard: the
Dashboard page (terminal state + retail link + refresh, the ready state
against a synthetic session cache with exact figures, Employee/Admin/empty
role views) and the due-premium widget (DEMO badge + note, demo rows, empty
state), with dashboard screenshots at 375 / 768 / 1440 px and
horizontal-overflow checks; tile icons (live + local rendering, monogram
fallback); instant-open (preconnect for all 6 origins, no prerender,
intent prefetch with dedup and no token fragment); and the Home
quick-actions grid + Leads/Learning data pages (DEMO summary strip + Go
button, Calculators/Proposals unchanged). Screenshots live in `qa/`.

`npm run qa:retail-live` runs `scripts/qa-retail-live.mjs`: it fetches the
retail endpoint's real payload and runs the Hub's own summarizer + proxy
handler against it (spec §12 values with tolerance, independent
recomputation, scoping checks, demo fixture exact values, the proxy's JWT
gating and fixture gating, and the DEV key match) — the live-data proof
for the Dashboard, since this VM's headless Chrome has no external network
and the in-browser fetch cannot succeed here.

Note: the VM's Chrome build hard-blocks loopback navigation
(`ERR_BLOCKED_BY_LOCAL_NETWORK_ACCESS_CHECKS`, not lifted by the standard
flag), so QA runs against `dist/` via `file://` — which is why the app uses a
relative base. Point `HUB_QA_URL` at a live server to QA over HTTP instead
(Milestone 1 checks only in that mode). The handoff test navigates same-tab
to a temp `file://` stub fixture, so it needs no loopback server.
