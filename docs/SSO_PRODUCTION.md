# Agent Hub SSO — production design

Milestone 2 defines the RS256 token and the module handoff. This document
describes how tokens are issued in PRODUCTION. Nothing here is built yet:
the Supabase provider is still a stub (`src/auth/supabaseProvider.ts`
returns `not_configured`), the schema at `supabase/schema.sql` has never
been run against any live database, and no Edge Function exists. This is
the design to build against — not a record of a live system.

## Principle

The browser never holds a signing key. In production the Hub signs NOTHING
locally: on sign-in the Hub auth service verifies the credential and issues
the RS256 token server-side, and the Hub uses the returned token (see
`SignInResult.token` in `src/auth/types.ts` and the production path in
`AuthContext.signIn`, which verifies the server token against the bundled
production public key before trusting it).

## Server issuer: Supabase Edge Function sketch

One Edge Function, `hub-auth`, in the dedicated Hub auth Supabase project
(schema: `supabase/schema.sql`). Two endpoints:

```
POST /auth/sign-in          { employeeId, credential } → { user, token } | error
POST /auth/change-credential { token, newCredential, confirmCredential } → { ok } | error
```

`sign-in` flow (all server-side):

1. Look up the employee by Employee ID in the Hub auth schema (one HR
   roster row per employee; Employee ID is the shared identity with
   LeadFlow and Learning Hub).
2. Check lockout: 5 wrong attempts → 15 minute lockout (same contract as
   the demo provider; counters live in the database, not the browser).
3. Verify the credential hash (bcrypt/argon2) — never compare hashes in
   the browser, never return the hash.
4. If `must_change_credential`, return the user with that flag set (the
   Hub shows the forced-change flow; no token is needed until the change
   completes — or issue a short-lived token scoped to the change endpoint
   only; decide at implementation time and document the choice).
5. Sign the RS256 token with the production private key (see Secrets):
   claims `sub` (Employee ID), `name`, `role`, `iat`, `exp = iat + 3600`,
   `iss = "shanta-life-agent-hub"`; header `{alg:"RS256",typ:"JWT",kid}`
   with the production kid.
6. Return `{ user, token }`. The Hub stores the token in sessionStorage
   only (`hub-session-token`).

`change-credential` flow: verify the session token first (signature +
expiry + `sub` matches), validate the new credential (6-digit PIN, not the
same as the current one), re-hash server-side, clear
`must_change_credential`.

Suggested implementation shape (Deno, Edge Function runtime — sketch, not
final code):

```ts
// supabase/functions/hub-auth/index.ts (SKETCH — not built yet)
import { serve } from 'https://deno.land/std/http/server.ts';
// Sign with WebCrypto (RSASSA-PKCS1-v1_5 + SHA-256), importing the PKCS#8
// private key from Deno.env — the same crypto the Hub uses in src/auth/jwt.ts,
// so the token format is identical in dev and production.
const PRIVATE_KEY_B64 = Deno.env.get('HUB_JWT_PRIVATE_KEY_B64')!; // server secret
const KID = Deno.env.get('HUB_JWT_KID')!;                          // e.g. 'a1b2c3d4e5f60718'
```

Rate-limit sign-in attempts per Employee ID and per IP at the Edge
Function (the 15-minute lockout is the second line, not the only one).
Log sign-in failures without logging credentials or tokens.

## Secrets handling

| Secret | Where it lives | Who sees it |
|---|---|---|
| Production RS256 PRIVATE key | Supabase Edge Function secrets (`HUB_JWT_PRIVATE_KEY_B64`) — or the team's secret manager if IT prefers | Only the Edge Function runtime. Never a developer machine, never the repo, never a client bundle, never chat. |
| Production kid | Edge Function env (`HUB_JWT_KID`) + committed in the Hub / module code alongside the public key | Public — a kid is an identifier, not a secret. |
| Production PUBLIC key | Committed in `src/auth/keys.ts` (Hub) and in each joined module's bundle; also settable per-build via `VITE_HUB_PUBLIC_KEY_PEM` + `VITE_HUB_KID` | Everyone — it is public by design. |
| Dev private key | Developer's local `.env` only (`VITE_JWT_PRIVATE_KEY_B64`, gitignored) | Only that developer's machine. Never a production key. |

Rules:

- The production private key is generated ON the server (or in the secret
  manager), never with `scripts/gen-dev-keys.mjs` on a developer machine
  (that script is for dev/rotation keys). If a keypair must be generated
  offline, generate it on an air-gapped step, store the private half in
  the secret manager immediately, and delete every other copy.
- The dev private key and the production private key are DIFFERENT keys.
  A dev token must never verify in production (different kid + key), and
  vice versa.
- The production-target build guard (`vite.config.ts`, `HUB_BUILD_TARGET`)
  refuses to build when `VITE_DEMO_AUTH=true` or any `VITE_JWT_*` signing
  variable is set. That guard is the last line of defence against shipping
  a signing key — it does not replace keeping the key out of the repo.
- If a private key is ever exposed: rotate immediately (runbook below) and
  treat it as a security incident.

## Rotation runbook (production)

Same shape as the dev rotation in `docs/SSO_TOKEN.md`, with the server
steps added:

1. Generate a new production keypair in the secret manager. New kid.
2. Add the new public key + kid to the Hub (`src/auth/keys.ts`,
   `KNOWN_KIDS`) and to every joined module. Deploy. Verification now
   accepts BOTH kids; issuance still uses the old key.
3. Confirm the new key is live everywhere (check the deployed Hub bundle
   and each module bundle carry the new kid).
4. Switch the Edge Function secrets to the new private key + kid
   (`HUB_JWT_PRIVATE_KEY_B64`, `HUB_JWT_KID`). Issuance now uses the new
   key. Old tokens keep verifying until they expire.
5. Wait one token lifetime (1 hour). All old-key tokens have expired.
6. Remove the old kid + public key from the Hub and all modules; deploy.
   Retire the old private key in the secret manager.
7. Verify: sign in via the Hub, open a joined module, confirm hub mode
   with the new token; confirm an old token (if one was captured) is
   rejected.

Emergency rotation (key compromise): same steps, but step 2–4 happen as
fast as possible and step 6 happens immediately after step 4 — live
sessions on the old key die at once, and agents sign in again. That is the
correct trade-off for a compromise.

## Deployment checklist (production Hub)

- [ ] Hub auth Supabase project created; schema from `supabase/schema.sql`
      reviewed and run (by the Supabase holder — never from this repo's
      automation).
- [ ] `hub-auth` Edge Function deployed; production keypair generated in
      server secrets; `HUB_JWT_PRIVATE_KEY_B64` + `HUB_JWT_KID` set.
- [ ] Production public key + kid bundled in the Hub
      (`src/auth/keys.ts`, or `VITE_HUB_PUBLIC_KEY_PEM` / `VITE_HUB_KID`
      at build time) and in every joined module.
- [ ] Hub production URL added to every joined module's Hub origin
      allowlist (`VITE_HUB_ORIGINS` in each module's deploy env). Without
      this, modules reject the Hub's token and agents get the sign-in
      banner instead of hub mode.
- [ ] Each joined module's `VITE_HUB_URL` set to the Hub production URL
      (for its "Back to Hub" fallback link).
- [ ] `HUB_BUILD_TARGET=production` for the production build (it is the
      default). `VITE_DEMO_AUTH` false/absent. No `VITE_JWT_*` variable
      set anywhere in the build environment. Confirm the guard blocks a
      bad build: `HUB_BUILD_TARGET=production VITE_DEMO_AUTH=true npm run
      build` must fail.
- [ ] Demo users do not exist in the production auth database; the login
      page shows no demo notice.
- [ ] Verify end to end in production: real Employee ID sign-in → token
      issued (RS256, production kid) → joined module opens in hub mode
      with the user chip → Hub sign-out clears the module session →
      direct module link still works standalone.
- [ ] Lockout and forced-change flows verified against the real provider
      (5 wrong attempts → 15-minute lockout; temporary credential →
      forced change).
- [ ] Incident contact + rotation runbook (above) handed to whoever owns
      the Hub auth project.

## What stays dev-only, forever

- The demo provider (`src/auth/demoProvider.ts`) and its four fictional
  users. Env-gated, OFF by default, blocked from production builds by the
  build-target guard.
- Local signing in the browser (`signSsoToken` with `VITE_JWT_PRIVATE_KEY_B64`).
  It exists so the token format and handoff are verifiable without a
  backend. Production never calls it.
- The dev keypair (kid `c804e3560b5c8059`). If it ever appears in a
  production bundle or a production token, that is a misconfiguration to
  fix immediately, not a supported setup.
