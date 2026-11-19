/**
 * Hub SSO public key — PUBLIC material, safe to commit in code.
 *
 * Milestone 2 moved the SSO token from HS256 (shared secret) to RS256: the
 * Hub signs with a private key, modules verify with this public key. A
 * public key is public by definition — it is bundled in the Hub AND in every
 * joined module (see docs/SSO_TOKEN.md and the Milestone 2 protocol).
 *
 * DEV keypair (generated 2026-11-20, kid c804e3560b5c8059): the private half
 * lives ONLY in the developer's local `.env` as VITE_JWT_PRIVATE_KEY_B64
 * (gitignored) and signs demo tokens in dev/QA builds. It is NEVER a
 * production key. Production tokens are issued server-side with a production
 * keypair held in server secrets; the production public key is bundled at
 * deploy time (see docs/SSO_PRODUCTION.md).
 *
 * Rotation: a new keypair gets a new kid (first 16 hex chars of the SHA-256
 * of the public key's DER encoding). During rotation, add the new kid to
 * KNOWN_KIDS and keep the old key verifiable until every token signed with
 * it has expired (one token lifetime: 1 hour), then retire it.
 *
 * Env overrides (dev/QA only): VITE_HUB_PUBLIC_KEY_PEM / VITE_HUB_KID let a
 * build pin a different public key — `npm run qa` uses them when no dev
 * private key is available (it generates an ephemeral keypair so QA passes
 * from a fresh clone). They carry public material only, so overriding them
 * cannot leak a secret. They must always be set as a matching pair.
 */

/** Kid of the bundled dev public key (SHA-256 of the public DER, first 16 hex). */
export const DEV_KID = 'c804e3560b5c8059';

/** Dev public key (SPKI PEM). Public — safe to commit, safe to bundle. */
export const DEV_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAvEHoMm02rFV2CEKJENpk
8GhABlXmR+dsz/7twrakwZLOv7Q4n+rj5MRkDd0prBKBPEAP9MpoHE4Ev8fSL/iD
GHGz5vSGQr94BKtLmr+JqRggkDOPwwyo2AnrCF3jIXoBiKsRG6jcADxyFfzgdZNc
aBEMPvWctJS1eQhz0AHWKQDjKl1xG0p1oyahOzTn4/o+Vaz+E16yIBgyZHXCCYvU
Xm6de4sFCUxAW3Q+1oXHdGkyA+g9LpK5uV8IA3xWBHH1xwOzg3oSDYppLUfi9f69
708HrB5Tod6Y8lFg0FQH+j7fa+lKwb0B4ClL8TLxXw9OOY6tYRnhxRCh1WS2fRon
DwIDAQAB
-----END PUBLIC KEY-----`;

// import.meta.env is replaced by Vite at build time. In a plain Node import
// (the QA harness bundles jwt.ts for Node) it is undefined — fall back to
// the bundled dev key.
const env: Record<string, string | undefined> = import.meta.env ?? {};

/** The public key this build verifies tokens against (override or dev key). */
export const HUB_PUBLIC_KEY_PEM: string = env.VITE_HUB_PUBLIC_KEY_PEM ?? DEV_PUBLIC_KEY_PEM;

/** The kid of HUB_PUBLIC_KEY_PEM — stamped on tokens this build signs. */
export const HUB_KID: string = env.VITE_HUB_KID ?? DEV_KID;

/**
 * Kids this build accepts. During rotation, add the new kid here (and the
 * matching public key) BEFORE the issuer switches to it, and retire the old
 * kid only after one token lifetime has passed.
 */
export const KNOWN_KIDS: ReadonlySet<string> = new Set([HUB_KID]);
