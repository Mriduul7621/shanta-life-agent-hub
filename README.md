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

> **Status: Milestone 1** — Hub shell + login + home screen. Local build only.
> Nothing here is deployed, and nothing touches any live system.

## Run it

```bash
cp .env.example .env   # demo auth ON, dev-only JWT secret
npm install
npm run dev            # http://localhost:5173
npm run build          # production build into dist/
npm run preview        # serve the production build
npm run qa             # headless-Chrome checks + screenshots (needs a fresh build)
```

Requirements: Node 20+ (built with Node 24). No other services needed for
Milestone 1 — the demo provider runs entirely in the browser.

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
    jwt.ts                 HS256 sign/verify (WebCrypto, no deps)
    demoProvider.ts        dev-only demo users, lockout, forced change
    supabaseProvider.ts    STUB — Milestone 2 wiring
  i18n/
    dictionary.ts          every UI string, Bangla + English
    I18nContext.tsx        BN default, BN|EN pill, localStorage persistence
  data/
    demoData.ts            per-role demo widget data (clearly fictional)
    modules.ts             module tiles — URLs from INVENTORY.md only
  components/              Layout (sidebar/bottom nav), WidgetCard,
                           ModuleTile, LanguagePill, icons
  pages/                   Login, ForceChange, Home, Module, Profile
public/
  manifest.webmanifest     PWA manifest (installable)
  sw.js                    offline-tolerant app-shell service worker
  icons/                   geometric hub icon (NOT the Shanta logo)
supabase/schema.sql        prepared Hub auth schema — LOCAL ONLY, never run
docs/SSO_TOKEN.md          the SSO token: format, claims, verification
scripts/qa-screenshots.mjs headless-Chrome QA (33 checks + screenshots)
qa/                        QA screenshots (375 / 768 / 1440 px)
```

### Auth providers

`AuthContext` picks a provider by env: `VITE_DEMO_AUTH=true` → the demo
provider; anything else → the Supabase provider stub, which fails closed
(`not_configured`) until Milestone 2 wires it. Adding a provider means
implementing the `AuthProvider` interface in `src/auth/types.ts` — sign-in
and credential change, nothing else.

### SSO token

On successful sign-in the Hub issues a signed JWT (HS256, 1-hour expiry) with
claims `sub` (Employee ID), `name`, `role`, `iat`, `exp`, `iss`. The token
lives in `sessionStorage` and is verified (signature + expiry) on session
restore. **Milestone 1 signs tokens in the browser with a dev-only secret from
`.env`** so the format can be verified end to end. Production tokens must be
issued server-side — the browser must never hold the signing secret. Full
spec, verification steps and rotation notes: [`docs/SSO_TOKEN.md`](docs/SSO_TOKEN.md).

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
| Login, lockout, forced-change, session expiry flows | All home widget numbers (per-role demo data) |
| JWT format + verification (dev secret) | Supabase provider (stub — no backend) |
| BN/EN i18n for every UI string | Proposals tile disabled (production portal URL unconfirmed) |
| Module tiles linking to the 6 verified production URLs | Admin console (placeholder, later milestone) |
| PWA manifest + service worker + icon | In-Hub framing of modules (Milestone 2 — tiles open new tabs for now) |
| All-device layouts (phone / tablet / laptop) | Real widget data (Milestones 2–3) |

## Follow-ups (not Milestone 1)

1. **Real Shanta logo** — the Hub currently uses a text wordmark ("Shanta
   Life" + "Agent Hub") and a geometric icon. Do not recreate the logo: integrate
   the approved vector asset from the brand guidelines when IT/brand approves.
2. **Supabase wiring** — implement `supabaseProvider.ts` against the schema in
   `supabase/schema.sql` (Edge Function for verify + server-side JWT issue).
   The schema file is prepared locally only; it has never been run anywhere.
3. **Proposals portal URL** — only the UAT URL exists in the exploration
   report; the production URL needs IT confirmation. Never link UAT from the Hub.
4. **Capacitor wrap** for a Play Store / installable build.
5. **Milestone 2** — in-Hub framing + token sign-in for LeadFlow and Learning
   Hub; real widget data from LeadFlow / Due & Lapse sheet / Learning Hub.

## QA

`npm run qa` runs `scripts/qa-screenshots.mjs` against the production build:
login for all 4 roles, JWT claim checks, lockout after 5 wrong PINs, the
forced-change flow, sign-out clearing the session, BN/EN switching, role-view
differences, and screenshots (login + home + profile at 375 / 768 / 1440 px)
with a horizontal-overflow check on each. Screenshots live in `qa/`.

Note: the VM's Chrome build hard-blocks loopback navigation
(`ERR_BLOCKED_BY_LOCAL_NETWORK_ACCESS_CHECKS`, not lifted by the standard
flag), so QA runs against `dist/` via `file://` — which is why the app uses a
relative base. Point `HUB_QA_URL` at a live server to QA over HTTP instead.
