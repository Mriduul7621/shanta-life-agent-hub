# Agent Hub SSO token

How the Hub proves "this is Employee X, role Y" to a module (LeadFlow,
Learning Hub, the joined calculators, …) without a second login.

## Format

A standard JWT: `base64url(header) . base64url(payload) . base64url(signature)`.

- **Algorithm:** RS256 (RSASSA-PKCS1-v1_5 + SHA-256). Asymmetric: the Hub
  (or its server issuer) signs with a PRIVATE key; modules verify with the
  PUBLIC key. Milestone 1 used HS256 with a shared secret — that was removed
  entirely in Milestone 2, with no fallback. A shared secret cannot work for
  the joined calculators: they are static sites with no backend, so the
  secret would have to ship in their bundles and would be public by
  definition. RS256 fixes it — the public key is safe to bundle.
- **Header:** `{"alg":"RS256","typ":"JWT","kid":"c804e3560b5c8059"}` (`kid` =
  first 16 hex chars of the SHA-256 of the public key's DER encoding).
- **Transport:** the URL **fragment** only, at module-open time (see
  `src/sso/handoff.ts` and the protocol): the joined tile links to
  `<module-url>#hub-token=<JWT>`. A fragment is never sent to the server,
  and the module strips it immediately on load via `history.replaceState`.
  NEVER a URL query parameter (it would land in server logs), NEVER
  localStorage (sessionStorage only), NEVER logged. Milestone 2 originally
  used `postMessage`; the same-tab decision (Mahadi, 2026-11-20) replaced
  it with the fragment flow — the token format and verification are
  unchanged.
- **Lifetime:** 1 hour (`exp = iat + 3600`). No refresh token — after expiry
  the agent signs in again.

## Claims

| Claim | Type | Meaning | Example |
|---|---|---|---|
| `sub` | string | Employee ID (the shared identity across LeadFlow, Learning Hub, HR roster) | `"9990002"` |
| `name` | string | Display name | `"Demo Team Lead"` |
| `role` | string | One of `employee`, `team_lead`, `manager`, `admin` | `"team_lead"` |
| `iat` | number | Issued-at, seconds since epoch | `1795120245` |
| `exp` | number | Expiry, seconds since epoch (`iat + 3600`) | `1795123845` |
| `iss` | string | Issuer, always `shanta-life-agent-hub` | `"shanta-life-agent-hub"` |

### Sample (dev token, demo user — decoded, signature omitted)

Header:

```json
{"alg": "RS256", "typ": "JWT", "kid": "c804e3560b5c8059"}
```

Payload:

```json
{
  "sub": "9990002",
  "name": "Demo Team Lead",
  "role": "team_lead",
  "iat": 1795120245,
  "exp": 1795123845,
  "iss": "shanta-life-agent-hub"
}
```

Verified end to end in QA (`npm run qa`): all four demo roles receive a
token with these claims and `exp − iat = 3600`; the RS256 signature is
verified independently with Node `crypto` + the dev public key, and the
negative cases below are all rejected.

## Keys and key distribution

- **Dev keypair** (generated 2026-11-20, kid `c804e3560b5c8059`): the PUBLIC
  key is committed in `src/auth/keys.ts` and bundled in the Hub and in every
  joined module — it is public, so committing it is safe. The PRIVATE key
  (PKCS#8 DER, base64) lives ONLY in the developer's local `.env` as
  `VITE_JWT_PRIVATE_KEY_B64` (gitignored) and signs demo tokens in dev/QA
  builds. It is NEVER a production key.
- **Production keypair:** generated on the server / in the secret manager.
  The private key stays in server secrets (Supabase Edge Function secrets);
  the public key is bundled in the Hub and in each joined module at deploy
  time (replace the bundled key, or build with the `VITE_HUB_PUBLIC_KEY_PEM`
  / `VITE_HUB_KID` overrides). The browser never holds a signing key.
  Full production design: [`docs/SSO_PRODUCTION.md`](SSO_PRODUCTION.md).
- **Generate a keypair:** `node scripts/gen-dev-keys.mjs` (or
  `npm run keygen`) prints a fresh RSA-2048 keypair — public PEM, private
  DER base64, kid, and the exact `.env` line. It never writes any file.
- **Why RS256 for static modules:** a static site has no backend to hold a
  secret, so anything it needs to verify with must be public. RS256's public
  key is public by design; HS256's shared secret would be public by
  accident. The Hub header in a module is UI chrome, not a security
  boundary; the verified token is the boundary.

## Verification steps (for a module — and what the Hub itself does)

Reference implementation: `verifySsoToken()` in `src/auth/jwt.ts`
(WebCrypto, no dependencies). Joined modules implement the same checks.
Strictly reject — fail closed — on ANY of these:

1. Not exactly three parts, or any part undecodable / not JSON.
2. Header `alg` anything other than exactly `RS256`. Never accept `none`,
   never accept `HS256`, never accept any other algorithm — one algorithm,
   no fallback.
3. Header `kid` missing or unknown (Milestone 2: the single dev kid above;
   during rotation, current + previous kids).
4. Signature mismatch: verify `RSASSA-PKCS1-v1_5 + SHA-256` over
   `header.payload` with the public key for that `kid`.
5. `iss` anything other than `shanta-life-agent-hub`.
6. `exp` missing, not a number, or in the past (allow ≤ 60 s clock skew).
7. `iat` missing or not a number.
8. `sub` missing or empty; `role` outside the four values.
9. (Module side only) the token arrived in the URL fragment and the
   RS256 signature is the trust anchor — there is no origin check on the
   token itself, because the fragment is only ever written by a Hub tile
   link and a forged token fails signature verification. The Hub origin
   allowlist still gates the *referrer-based* sign-in prompt (a module
   opened from a Hub origin without a valid token shows the banner). See
   the handoff protocol.

On success, trust `sub` + `role` as the authenticated identity; do not
re-ask for a password. Apply the module's own role rules from there.

## Rotation (with kid)

1. Generate a new keypair (`npm run keygen`). New `kid`, new public key.
2. Deploy the new public key + kid to the Hub and to every joined module
   (add the kid to `KNOWN_KIDS` in `src/auth/keys.ts`; modules add it to
   their known-kid list). Verification now accepts BOTH kids.
3. Switch the issuer to sign with the new private key (new `kid` in the
   header). Old tokens keep verifying until they expire.
4. After one token lifetime (1 hour) all tokens signed with the old key
   have expired: remove the old kid + key everywhere. No downtime, no
   forced sign-out beyond the normal 1-hour expiry.
5. **Leak response:** if a PRIVATE key is ever exposed, rotate immediately
   (all live tokens die at rotation — agents sign in again) and treat it as
   a security incident, not a routine change. A PUBLIC key "leaking" is not
   an incident — it is public by design.

## Handoff and sign-out

- The Hub hands the token to a joined module in the URL fragment:
  the tile links to `<module-url>#hub-token=<JWT>` in the same tab.
  The module reads the fragment on load, verifies the RS256 signature,
  then strips the fragment immediately via `history.replaceState`
  (keeping path + query). Modules without join code ignore the fragment
  and simply run standalone — that is the graceful path, not an error.
  See `src/sso/handoff.ts` and the protocol.
- **Sign-out limitation (expected, not a failure):** same-tab navigation
  means there is no second window to notify, so Hub sign-out does NOT
  reach a module the agent already navigated to. A module session ends
  at token expiry (≤ 1 h) — modules re-check expiry on a 30 s timer and
  on visibility change. Hub sign-out still clears the Hub's own session
  immediately.
- A module opened from the Hub but without a valid token shows a
  dismissible "not signed in via the Hub" banner and REMAINS USABLE — the
  gate lives in the Hub (tiles need a Hub login), not in the calculator.

## What the token is NOT

- It is not a password and cannot be used to change credentials.
- It does not carry permissions beyond `role` — each module enforces its own
  visibility rules (reporting tree) from `sub` + `role`.
- It is not a session cookie: signing out of the Hub deletes it from
  sessionStorage. It does not broadcast sign-out to modules — same-tab
  navigation has no second window to notify, so a module session ends at
  token expiry (≤ 1 h).

## Never

- Never put the token in a URL query parameter, in localStorage, or in
  any log. The URL fragment (`#hub-token=`) is the one sanctioned URL
  transport — it is never sent to the server, and the module strips it
  immediately on load.
- Never put the PRIVATE key in Git, in chat, in a screenshot, or in any
  client bundle. `.env` is gitignored; `.env.example` carries only the
  placeholder. The production-target build guard (`vite.config.ts`)
  refuses to build when any `VITE_JWT_*` signing variable is set.
- Never accept `alg: none` or any algorithm other than `RS256`.
- Never accept a token whose signature fails, whatever its origin.
