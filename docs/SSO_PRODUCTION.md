# Agent Hub SSO — production design

Milestone 2 defines the RS256 token and the module handoff. This document
describes how tokens are issued in PRODUCTION.

## Principle

The browser never holds a signing key. In production the Hub signs NOTHING
locally: on sign-in the Hub auth function verifies the credential and issues
the RS256 token server-side, and the Hub uses the returned token (see
`SignInResult.token` in `src/auth/types.ts` and the production path in
`AuthContext.signIn`, which verifies the server token against the bundled
public key before trusting it).

## The issuer: `api/hub-auth.js` (Vercel serverless, Hub project)

Phase 2 (spec §10) supersedes the earlier dedicated-Hub-auth-project
design: there is NO new auth database and NO Edge Function. The
credential store is the **Learning Hub** (its `employees` roster, the
PIN store `employee_credentials`, the staff password store
`employee_email_credentials`, the lockout counters, and the forced-change
flags — with the EXACT lockout contract the Hub promises, 5 wrong →
15 min). `api/hub-auth.js` verifies the credential by calling the LH
RPCs (`hub_verify_pin` / `hub_staff_login`) with the LH service_role
key, derives the Hub role from the reporting tree + `user_roles`, and
signs the Hub JWT server-side.

```
POST /api/hub-auth  { identifier, credential } → { user, token } | error
```

Sign-in flow (all server-side):

1. Route by identifier shape: an email address goes to the staff track
   (`hub_staff_login`); anything else goes to the PIN track
   (`hub_verify_pin` with the Employee ID).
2. PIN track: the Employee ID must have an LH `employees` row — without
   one the answer is a clear 401 `no_lms_record` (no role is invented).
   A BE signs in with Employee code; if the LH stub is keyed by BE code
   instead, that is the §15.4 mapping gap, not a credential failure.
3. The RPC enforces the 5/15 lockout and returns `must_change_pin` /
   `must_change_password`. A forced change means NO Hub token is issued
   — the user changes the credential in the Learning Hub itself (403
   `must_change_credential` with the LH login URL). The Hub builds no
   password-change flow for real users.
4. `hub_verify_pin` / `hub_staff_login` mint a 30-day LH session as a
   side effect (spec §15.3): the Hub DISCARDS that token — it is never
   returned, never stored, never logged. The clean fix is a dedicated
   no-session verifier RPC (one small LH migration, LH repo owns it).
5. On success: sign the RS256 token with the server-held private key
   (see Secrets): claims `sub` (Employee ID), `name`, `role`, `iat`,
   `exp = iat + 3600`, `iss = "shanta-life-agent-hub"`; header
   `{alg:"RS256",typ:"JWT",kid}`. Role: admin = LH `user_roles`
   td_admin/super_admin; manager = subtree contains a team_lead;
   team_lead = >= 1 subordinate; else employee (see
   `api/_lib/hubRoles.js`).
6. Return `{ user, token }`. The Hub stores the token in sessionStorage
   only (`hub-session-token`).

Rate limiting: the LH 5/15 lockout is the credential control (a second
Hub-side lockout is deliberately NOT built). Per-IP abuse control is
left to Vercel's platform; a WAF/edge rule is the production hardening
step if sign-in abuse is ever observed. Log sign-in failures without
logging credentials, tokens, or the identifier.

## Secrets handling

| Secret | Where it lives | Who sees it |
|---|---|---|
| Production RS256 PRIVATE key | Vercel env on the Hub project, `HUB_JWT_PRIVATE_KEY_B64` (server-only) — or the team's secret manager if IT prefers | Only the `hub-auth` function runtime. Never a developer machine, never the repo, never a client bundle, never chat. |
| Production kid | Vercel env `HUB_KID` (proxies) + `HUB_JWT_KID` (issuer, optional — the issuer derives the kid from the key when unset) + build-time `VITE_HUB_KID` | Public — a kid is an identifier, not a secret. |
| Production PUBLIC key | Vercel env `HUB_PUBLIC_KEY_PEM` (proxies) + build-time `VITE_HUB_PUBLIC_KEY_PEM` (browser verification) + bundled in every joined module | Everyone — it is public by design. |
| Dev private key | Developer's local `.env` only (`VITE_JWT_PRIVATE_KEY_B64`, gitignored) + the QA/preview Vercel env (fallback for `hub-auth` in QA builds) | Only that developer's machine / the QA project. Never a production key. |

Rules:

- The production private key is generated OFFLINE or in the secret
  manager, never with `scripts/gen-dev-keys.mjs` on a developer machine
  (that script is for dev/rotation keys). Store the private half in
  Vercel env (or the secret manager) immediately, and delete every
  other copy.
- The dev private key and the production private key are DIFFERENT keys.
  A dev token must never verify in production (different kid + key), and
  vice versa.
- Two layers guard the dev key out of production: the
  production-target build guard (`vite.config.ts`, `HUB_BUILD_TARGET`)
  refuses to build when `VITE_DEMO_AUTH=true`, any `VITE_JWT_*` signing
  variable is set, or `HUB_DEMO_FIXTURE=true` — AND the issuer itself
  (`api/_lib/signJwt.js`) refuses to sign when
  `HUB_BUILD_TARGET=production` and no `HUB_JWT_PRIVATE_KEY_B64` is set.
  The build guard cannot see Vercel runtime env, so the runtime check is
  the second layer, not a duplicate.
- If a private key is ever exposed: rotate immediately (runbook below) and
  treat it as a security incident.

## Production key setup (step by step — Mahadi / whoever owns the Hub project)

Do NOT generate a production key on a developer machine, and never paste
a private key into chat. The steps below run in a terminal that can reach
the secret manager / Vercel dashboard; the private key goes straight
into Vercel env.

1. Generate a 2048-bit RSA keypair (OpenSSL, offline):
   `openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out hub-private.pem`
   `openssl rsa -in hub-private.pem -pubout -out hub-public.pem`
2. Private half for Vercel: PKCS#8 DER, base64, single line:
   `openssl pkcs8 -topk8 -inform PEM -outform DER -in hub-private.pem -nocrypt | base64 -w0`
   → set as `HUB_JWT_PRIVATE_KEY_B64` (Production target, sensitive).
3. Kid: first 16 hex chars of the SHA-256 of the public key's SPKI DER
   (the `src/auth/keys.ts` rule):
   `openssl pkey -in hub-public.pem -pubin -outform DER | sha256sum`
   → the first 16 hex chars are the kid. Set it as `HUB_KID` (and
   `HUB_JWT_KID` to the same value, if the issuer override is wanted).
4. Public half for Vercel: the full PEM text of `hub-public.pem` →
   set as `HUB_PUBLIC_KEY_PEM` (Production target). The build guard
   verifies the kid matches this key and fails the build otherwise.
5. Browser verification: the production build must verify tokens
   against the production public key — set the build-time overrides
   `VITE_HUB_PUBLIC_KEY_PEM` (same PEM text) + `VITE_HUB_KID` (same
   kid) in the production build environment, or commit the public key
   in `src/auth/keys.ts`. Without this the bundle verifies against
   the dev key and rejects production tokens.
6. Set `HUB_BUILD_TARGET=production` for the production build (it is
   the default). `VITE_DEMO_AUTH` false/absent. No `VITE_JWT_*`
   variable set anywhere in the build environment. No
   `HUB_DEMO_FIXTURE`. Confirm the guard blocks a bad build:
   `HUB_BUILD_TARGET=production VITE_DEMO_AUTH=true npm run build`
   must fail.
7. Set the LH env vars the issuer needs (Production target):
   `LEARNINGHUB_SUPABASE_URL` + `LEARNINGHUB_SERVICE_ROLE_KEY`
   (already set for the data proxies — same values, no new secret).
8. Bundle the production public key + kid in every joined module
   (their `VITE_HUB_PUBLIC_KEY_PEM` / `VITE_HUB_KID` equivalents —
   see each module's join doc), and add the Hub production URL to
   every joined module's Hub origin allowlist (`VITE_HUB_ORIGINS`).
   Without this, modules reject the Hub's token.
9. Verify end to end in production: real Employee ID sign-in → token
   issued (RS256, production kid) → joined module opens in hub mode
   with the user chip → Hub sign-out clears the session → direct
   module link still works standalone.
10. Delete the local key files (`hub-private.pem`, `hub-public.pem`)
    once the values are stored in Vercel. Keep no other copy of the
    private key.

## Rotation runbook (production)

Same shape as the dev rotation in `docs/SSO_TOKEN.md`, with the server
steps added:

1. Generate a new production keypair in the secret manager. New kid.
2. Add the new public key + kid to the Hub (`src/auth/keys.ts`,
   `KNOWN_KIDS`, or the `VITE_HUB_PUBLIC_KEY_PEM` / `VITE_HUB_KID`
   build overrides) and to every joined module. Deploy. Verification
   now accepts BOTH kids; issuance still uses the old key.
3. Confirm the new key is live everywhere (check the deployed Hub bundle
   and each module bundle carry the new kid).
4. Switch the Vercel env to the new private key + kid
   (`HUB_JWT_PRIVATE_KEY_B64`, `HUB_KID`, `HUB_PUBLIC_KEY_PEM`).
   Issuance now uses the new key. Old tokens keep verifying until they
   expire.
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

- [ ] Production keypair generated offline; `HUB_JWT_PRIVATE_KEY_B64` +
      `HUB_PUBLIC_KEY_PEM` + `HUB_KID` set in the Hub Vercel project
      (Production target); build-time `VITE_HUB_PUBLIC_KEY_PEM` /
      `VITE_HUB_KID` set (or the public key committed in keys.ts).
- [ ] `LEARNINGHUB_SUPABASE_URL` + `LEARNINGHUB_SERVICE_ROLE_KEY` set
      (Production target) — the issuer and the learning proxy share them.
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
- [ ] Demo users do not exist in the Learning Hub roster; the login page
      shows no demo notice.
- [ ] Verify end to end in production: real Employee ID sign-in → token
      issued (RS256, production kid) → joined module opens in hub mode
      with the user chip → Hub sign-out clears the module session →
      direct module link still works standalone.
- [ ] Lockout and forced-change flows verified against the real provider
      (5 wrong attempts → 15-minute lockout; temporary credential →
      forced change in the Learning Hub).
- [ ] Incident contact + rotation runbook (above) handed to whoever owns
      the Hub project.

## What stays dev-only, forever

- The demo accounts and the demo provider (`src/auth/demoProvider.ts`)
  — REMOVED entirely (Mahadi 2026-11-20). There is no demo sign-in
  path; the `999xxxx` fixture slices behind the proxy gates
  (`HUB_DEMO_FIXTURE` + 999 sub) remain as QA-only scaffolding and are
  unreachable via login.
- Browser-side signing (`signSsoToken` with `VITE_JWT_PRIVATE_KEY_B64`).
  REMOVED from the app — the QA harness still signs test tokens in
  Node. Production tokens are issued server-side only.
- The dev keypair (kid `c804e3560b5c8059`). If it ever appears in a
  production bundle or a production token, that is a misconfiguration to
  fix immediately, not a supported setup.
