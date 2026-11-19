# Agent Hub SSO token

How the Hub proves "this is Employee X, role Y" to a module (LeadFlow,
Learning Hub, …) without a second login. Milestone 1 defines and issues the
token; Milestone 2 modules verify it.

## Format

A standard JWT: `base64url(header) . base64url(payload) . base64url(signature)`.

- **Algorithm:** HS256 (HMAC-SHA-256). Symmetric — one shared secret signs
  and verifies. (A later milestone may move to RS256 so modules verify with a
  public key and only the issuer holds the private key.)
- **Header:** `{"alg":"HS256","typ":"JWT"}`
- **Transport:** issued at Hub sign-in; stored in `sessionStorage` under
  `hub-session-token`; handed to a module at open time (Milestone 2 — exact
  handoff TBD: `Authorization: Bearer <token>` header or a POSTed form field,
  never a URL query parameter).
- **Lifetime:** 1 hour (`exp = iat + 3600`). No refresh token in Milestone 1 —
  after expiry the agent signs in again.

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
{"alg": "HS256", "typ": "JWT"}
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

Verified end to end in QA (`npm run qa`): all four demo roles receive a token
with these claims and `exp − iat = 3600`.

## Verification steps (for a module, Milestone 2)

1. Split on `.` — exactly three parts.
2. Decode the header; reject unless `alg` is exactly `HS256` (never accept
   `none`, and never accept an algorithm other than the one configured).
3. Recompute `HMAC-SHA256(secret, header.payload)` and compare with the
   signature in constant time. Reject on mismatch.
4. Decode the payload; reject unless `iss === "shanta-life-agent-hub"`.
5. Reject if `exp` is in the past (allow ≤ 60 s clock skew).
6. Require `sub` (non-empty string) and `role` (one of the four values).
7. Trust `sub` + `role` as the authenticated identity; do not re-ask for a
   password. Apply the module's own role rules from there.

Reference implementation: `verifySsoToken()` in `src/auth/jwt.ts` (WebCrypto,
no dependencies) — the Hub uses it on session restore.

## Secrets and rotation

- **Milestone 1 (dev only):** the token is signed in the browser with
  `VITE_JWT_SECRET` from `.env`. This exists only so the format is verifiable
  end to end. A secret shipped to the browser is public by definition — it
  must never be treated as a production secret, and it must never be the same
  value as any production secret.
- **Production (Milestone 2):** tokens are issued server-side by the Hub auth
  service (Supabase Edge Function) with a secret stored in the project's
  server-side secrets. The browser never sees it. Modules verify with the same
  secret, held server-side on their own backends (or via a shared verification
  endpoint — TBD in Milestone 2 design).
- **Rotation:** keep two secrets live during rotation (`current` + `previous`):
  issue with `current`, verify against either; after one token lifetime (1 h)
  all tokens signed with `previous` have expired, so it can be retired. No
  downtime, no forced sign-out beyond the normal 1-hour expiry.
- **Leak response:** if a signing secret is ever exposed, rotate immediately
  (all live tokens die at rotation — agents sign in again) and treat it as a
  security incident, not a routine change.
- **Never** put the secret in Git, in chat, in a screenshot, or in any client
  bundle. `.env` is gitignored; `.env.example` carries only the dev placeholder.

## What the token is NOT

- It is not a password and cannot be used to change credentials.
- It does not carry permissions beyond `role` — each module enforces its own
  visibility rules (reporting tree) from `sub` + `role`.
- It is not a session cookie: signing out of the Hub deletes it from
  sessionStorage, and Milestone 2 modules must also end their own sessions on
  Hub sign-out (exact mechanism TBD — likely a sign-out broadcast).
