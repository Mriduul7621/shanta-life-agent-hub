/**
 * Milestone 3 QA — headless-Chrome checks for the Agent Hub.
 *
 * Usage: `npm run qa` — the script performs its own QA build
 * (HUB_BUILD_TARGET=qa, script-forced) so it passes from a fresh
 * clone. Plain `npm run build` still respects `.env` and defaults
 * to the production target (see vite.config.ts).
 *
 * Sessions are SEEDED, not typed: there is no demo sign-in path at
 * all (the demo accounts were removed 2026-11-20, and the demo
 * fixture code was deleted the same day) — so `login()` signs a test
 * token in Node with the bundled jwt.ts + the .env dev key (or the
 * ephemeral keypair when no .env key exists) and drops it into
 * sessionStorage — the app restores it exactly as it would a
 * server-issued token. The 999xxxx IDs are harness-only TEST users
 * (safely non-real, never in the bundle). The UI sign-in form is
 * tested separately (§3/§22): a 999xxxx attempt must FAIL (no demo
 * route), and the server side of real auth is covered by
 * `npm run qa:auth-live`.
 *
 * Runs against the PRODUCTION build via file:// — the VM's Chrome build
 * hard-blocks loopback navigation (ERR_BLOCKED_BY_LOCAL_NETWORK_ACCESS_CHECKS;
 * the standard --disable-features flag does not lift it), so the dev server
 * cannot be driven by headless Chrome here. The app uses a relative Vite base
 * so the same build also runs from file:// and, later, from a Capacitor
 * webview. Override with HUB_QA_URL to point at a live server instead — in
 * that mode only the Milestone 1 browser checks run (the M2 checks need the
 * local QA build), and session seeding needs the .env dev key to match
 * the server's bundled public key. The handoff test navigates same-tab to a temp file://
 * stub fixture, so it needs no loopback server at all.
 *
 * NOTE (Retail Dashboard): this VM's headless Chrome has no external network
 * and there is no /api/retail-data proxy under file://, so the Dashboard's
 * live fetch cannot succeed here — the dashboard QA below asserts the page
 * reaches a terminal state (live KPIs OR the error state with retry + the
 * retail-dashboard link) and records which path was taken. The ready state
 * is verified against a synthetic session cache seeded with a TEST
 * fixture summary (computed by the Hub's own summarizer, api/_lib —
 * see scripts/test-fixtures/). The live path itself is verified by
 * `npm run qa:retail-live`, which runs the Hub's own summarizer +
 * proxy handler against the real retail endpoint payload from Node.
 * The same pattern applies to the Phase 2 feeds (§21): the LeadFlow /
 * Learning Hub / retail proxies do not exist under file://, so the
 * live ready states are verified against seeded session caches
 * (hub-leadflow-cache-v1, hub-learning-cache-v1, hub-retail-cache-v1,
 * each suffixed with the period — `:today` by default, `:all` for
 * Home + the dues feed, `:custom:from:to` for a custom range)
 * computed by the Hub's own summarizers. The live paths are verified
 * by `npm run qa:leadflow-live` and `npm run qa:learning-live`.
 *
 * Checks (Milestone 1 — 33, unchanged):
 *  1. Login page loads with no console errors.
 *  2. All 4 roles render from a seeded session; the token carries the
 *     documented claims.
 *  3. A 999xxxx UI sign-in attempt FAILS (no demo route — there are
 *     no demo accounts and no demo code path at all); no token is
 *     issued, no lockout message.
 *  4. Sign-out clears the session token.
 *  5. EN/BN switch changes UI strings.
 *  6. Role views differ (team section only for Team Lead / Manager; Admin sees
 *     the console placeholder on Profile).
 *  7. Screenshots: login + home + profile + dashboard at 375 / 768 / 1440 px.
 *     Each shot also checks for horizontal overflow (scrollWidth >
 *     innerWidth). (Dashboard shots are Milestone 3 — 3 of its 22 checks.)
 *  8. One home screenshot per role at 1440 px.
 *
 * Checks (Milestone 2 — 31):
 *  9. Key sanity: the signing private key matches the public key QA
 *     verifies with; the kid is the SHA-256(DER) derivation.
 * 10. The QA build itself succeeds (qa target, stub override).
 * 11. RS256: the issued token's header (alg RS256, expected kid), its
 *     signature verified independently with node:crypto, accepted by the
 *     app's own verifySsoToken (bundled for Node via esbuild), and a
 *     sign+verify round-trip through the bundled jwt.ts.
 * 12. Negative cases, all rejected by verifySsoToken: tampered payload,
 *     expired token, wrong iss, alg none, alg HS256, unknown kid, empty
 *     sub, role outside the four values.
 * 13. Handoff end-to-end against a LOCAL stub module fixture (no live
 *     URLs, same-tab fragment flow): the joined tile's href carries a
 *     valid token in #hub-token=; clicking it navigates the same tab to
 *     the stub, which verifies the token and reports a valid hub session
 *     with the right sub/role; the hub header + user chip show; the
 *     fragment is stripped from the URL; Back to Hub returns to the
 *     still-signed-in Hub; re-entering the tile restores the hub session;
 *     and a token past expiry clears the module session (same-tab has no
 *     cross-window sign-out broadcast — expiry is the mechanism, by design).
 * 14. Tile wiring: ALL enabled modules render as same-tab links
 *     (no target=_blank); ssoJoined tiles carry #hub-token= in the href,
 *     non-joined tiles are plain links (read-only — no live navigation).
 * 15. Production-target guard: a production build with a signing key
 *     FAILS, a production signing key without its matching public-key
 *     config FAILS, a HUB_KID that does not match HUB_PUBLIC_KEY_PEM
 *     FAILS, a matching production keypair SUCCEEDS, and a clean
 *     production build (temp copy, no .env) succeeds with no test
 *     users shown and sign-in failing closed. (The old demo-auth
 *     guard test is gone with the demo code — vite.config.ts no
 *     longer checks VITE_DEMO_AUTH.)
 *
 * Checks (Retail Dashboard — 40):
 * 16. Dashboard page: heading is "Retail Sales Dashboard", reaches a
 *     terminal state (live KPIs, empty state or error state with retry),
 *     has a Refresh button, links to the Retail Sales Dashboard, and
 *     carries no link to the removed SCC tile.
 * 16b. Dashboard ready state (Team Lead): renders against a synthetic
 *     session cache seeded with a test fixture summary — exact figures
 *     for all 6 KPIs, the Top team members leaderboard, the scope
 *     label, and the cached-while-refreshing banner. No DEMO badge or
 *     demo note anywhere — those were removed with the demo code.
 * 16c. Dashboard role views: Employee sees own data only (no leaderboard);
 *     Admin sees Top Business Executives + the Unassigned line + Org-wide;
 *     an empty scope shows the empty state with the no-code note and no
 *     KPI cards.
 * 17. Due-premium widget: on Home, one widget only — the unseeded
 *     (failed-fetch) state shows the error + retry, a seeded cache
 *     shows the live rows + totals, and a seeded EMPTY summary shows
 *     the plain empty state. No demo rows, no DEMO badge, no note.
 *
 * Checks (Instant-open — 8):
 * 19. Preconnect + dns-prefetch links exist for all 6 module origins, no
 *     prerender link exists anywhere, hovering a tile adds a prefetch
 *     link for that app's document, hovering twice adds only one, and the
 *     prefetch URL carries no SSO token fragment.
 *
 * Checks (Home quick-actions + module data pages — 19):
 * 20. Home has one flat quick-action grid (7 tiles, icon + name, no group
 *     headings, no descriptions) with disabled Proposals + Coming soon.
 *     Leads/Learning pages show an error + retry when the feeds are
 *     unloaded (no seeded cache, no proxy under file://) — never
 *     fixture figures — with a same-tab Go button and no ModuleTile;
 *     Calculators/Proposals pages are unchanged (tiles only, no
 *     summary, no Go button).
 * 20b. Leads/Learning pages at 375 px: no horizontal overflow, with
 *     screenshots (device gate; 1440 px shots are taken in §20).
 *
 * Checks (Phase 2 — live feeds):
 * 21. Home / Leads / Learning live ready states against seeded session
 *     caches (test fixture summaries computed by the Hub's own
 *     summarizers): exact figures per card (follow-ups 4 own / 12 team
 *     today-only, dues this week 2 / ৳17,000 with the Sun 15 – Sat 21
 *     Nov week range, learning this month 0 credits / 1 in progress /
 *     0 completed, business this-month FYCP ৳35,000, sales 1 policy /
 *     FYCP ৳35,000 this month), the Due widget in summary mode (amount
 *     + policies + month + scope + full-dashboard link) with the 3
 *     recent dues above the totals, the team section drops to 2 cards
 *     (follow-ups + learning) with no team Due widget, and the
 *     Leads/Learning summary strips show the figures only — no badge,
 *     no "Live from …" line, no Last synced, no note — with the extra
 *     live stats (overdue / open / converted; enrolled / completed /
 *     certificates / credits). Empty live states show the plain empty
 *     text per card. Overflow checks at 375 / 768 / 1440 with
 *     screenshots (home-live-*, leads-live-1440, learning-live-1440).
 * 27. No-demo rule (Mahadi 2026-11-20 — the demo code is deleted):
 *     a REAL-user session (non-999 id) with a FAILED retail fetch
 *     shows no fixture figures anywhere (error + retry instead); a
 *     real user with an EMPTY retail feed shows zeros + empty states,
 *     never fixture figures; and no 'demo' text appears anywhere
 *     user-visible on any page for any session.
 *
 * Checks (Phase 2 — real auth):
 * 22. Real-login form at 375 / 768 / 1440: identifier label "Employee
 *     ID or email", identifier placeholder, forgot link out to the
 *     Learning Hub, NO test ID or demo notice anywhere (there are no
 *     demo accounts and no demo code), and the credential field switching to a password field
 *     when an email is typed; error state (a 999xxxx attempt shows
 *     the not-configured message, never a lockout) at 375 px, with
 *     screenshots (login-real-*, login-error-375,
 *     login-error-repeat-375). The server side of real auth is
 *     covered by `npm run qa:auth-live`.
 *
 * Checks (Phase 2 — time-frame filter):
 * 23. Dashboard / Leads / Learning at 375 / 768 / 1440: the period
 *     control is a dropdown (default This Month on the Dashboard,
 *     Today on Leads/Learning) with a Custom range. The session caches
 *     are seeded (live mode); the page shows the default figures first
 *     (Dashboard this-month total ৳43,000, FYCP ৳35,000, policies 1;
 *     Leads new leads own 2 + team 1; Learning org enrolled 6, credits
 *     140), then selecting 'Last 3 months' switches the figures to the
 *     3m values (Dashboard total ৳1,08,000, FYCP ৳1,00,000, policies 3;
 *     Leads new leads own 5 + team 11; Learning org enrolled 12,
 *     credits 290) while the snapshots stay put (due ৳34,000,
 *     persistency 83.3%, overdue/open/converted, certificates 1); the
 *     select's value tracks the selection, no horizontal overflow, with
 *     screenshots (*-period-3m-*). A custom range (2026-11-01..2026-11-20)
 *     returns exactly the rows inside it (Dashboard total ৳43,000, FYCP
 *     ৳35,000, policies 1 — the this-month values), and an invalid
 *     range (to before from) shows the inline error and keeps the
 *     last figures. The exact period math is covered by
 *     `npm run qa:retail-live` (§5b), `qa:leadflow-live` (§2b) and
 *     `qa:learning-live` (§2b), including invalid custom ranges
 *     returning 400 from the proxies.
 *
 * Checks (Demo removal + login visuals):
 * 24. No DEMO badge in the header for any session (999xxxx test user
 *     or real Employee ID); the built bundle contains no signing key,
 *     no test ID, no test PIN and no 'demo' string.
 * 25. Splash screen: present on first load, gone within ~1.5s; the
 *     login photo panel, wave band and animated card render at
 *     1440/375 with the logo fallbacks; screenshots (splash-*).
 * 26. No subtitle under any title (Mahadi 2026-11-20) — no sentence
 *     under any page title OR section title, on Home, Dashboard,
 *     Leads, Learning, Calculators, Proposals, Profile: the titles
 *     stay, no <p> follows any h1, and none of the removed strings
 *     (subtitles, demo/live notes, Last synced, "Live from …")
 *     appears anywhere. Card sub-values and scope labels are kept —
 *     they are data, not title sentences.
 *
 * Checks (Android app download promo — 25):
 * 28. Home popup (Mahadi 2026-11-21): visible on an Android UA at
 *     375 px after the splash, with the Hub download-route href and
 *     target _blank, no horizontal overflow, no console errors;
 *     closing it sets the versioned dismissal flag and it stays gone
 *     after a reload; tapping Download also dismisses it. Hidden on
 *     an iOS UA, on desktop, and inside the native app (simulated by
 *     injecting window.androidBridge before load — the same signal
 *     Capacitor's isNativePlatform reads). BN strings render with
 *     hub-lang=bn. Login page: the SAME popup appears before sign-in
 *     (Android only, hidden on iOS), and dismissing it there also
 *     hides it on Home (shared flag); the download link is present
 *     on Android with the same APK href, absent on iOS / native /
 *     desktop. Screenshots: android-promo-375.png,
 *     android-promo-bn-375.png, login-android-375.png,
 *     login-promo-375.png.
 *
 * Checks (FCM push notifications — 29):
 * 29. The pushRouting bundle builds for Node (esbuild, like jwt.ts).
 *     Pure routing (the REAL src/native/pushRouting.ts): topic
 *     derivation (valid ID →
 *     user-<id>, whitespace trimmed, empty / whitespace / bad
 *     characters / non-string → null) and tap routing (leadflow →
 *     LeadFlow URL, learning → Learning Hub URL, module fallback,
 *     learning-hub alias, relative route appended incl. query,
 *     absolute / protocol-relative / fragment routes ignored,
 *     unknown / missing / null data → Home '/'). The
 *     /api/push-subscribe route handler (imported directly): no auth
 *     → 401, bad token → 401, valid JWT + missing FCM token → 400,
 *     GET → 405, valid JWT + valid body with no service account →
 *     503 push_not_configured (graceful degradation — the Firebase
 *     project does not exist yet). Bundle split (local QA only): the
 *     eager index chunk contains neither the '@capacitor/
 *     push-notifications' specifier nor the plugin's registration
 *     call (`"PushNotifications",{}`), while a lazy chunk does — the
 *     dynamic import keeps the plugin out of the eager bundle, so the
 *     web bundle pays nothing for push; and in the harness
 *     Capacitor.isNativePlatform() is false, so the native guard
 *     holds (window.Capacitor itself IS defined in any browser — the
 *     core always installs the global; nativeness is the bridge
 *     check, not the global's presence).
 *     (The plugin has no web implementation — its lazy chunk is only
 *     the registration stub; the real implementation lives in the
 *     Android shell.) Native push itself (permission, registration,
 *     tap delivery) cannot run in headless Chrome — it needs the
 *     device build.
 *
 * Checks (Tile icons — 6):
 * 18. Tiles show the app's real icon: live icons (PremiumPulse, SDPP,
 *     Income) render as <img> with the expected live URL, local icons
 *     (LeadFlow, Learning Hub, Retail Dashboard) render with the expected
 *     local path and actually load (naturalWidth > 0); Proposals keeps its
 *     monogram with no img. A failed live icon falls back to the monogram
 *     (live requests held by interception, then aborted), and breaking a
 *     local icon's src at runtime also falls back to the monogram.
 *     Remote icons cannot load in this VM (no external network) — their
 *     live rendering is verified post-push with a browser task.
 *
 * Exits non-zero if any check fails. Screenshots land in qa/.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';
// Retail Dashboard QA: the test fixture summary is computed by the Hub's
// OWN summarizer (api/_lib — pure, no Node/browser APIs), so the seeded
// cache is exactly what the proxy would return for the same rows. The
// fixture builders live under scripts/test-fixtures/ (test-only —
// never imported by the app bundle).
import { summarizeRetail } from '../api/_lib/retailSummary.js';
import { buildTestPayload } from './test-fixtures/testFixture.js';
// Phase 2 feeds QA: same pattern — the seeded caches are computed by
// the Hub's OWN summarizers, so they are exactly what the proxies
// would return for the same rows.
import { summarizeLeadflow, aggregateLeadCounts, scopeSetsFor } from '../api/_lib/leadflowSummary.js';
import { buildLeadflowTestFixture } from './test-fixtures/testFixtureLeadflow.js';
import { summarizeLearning } from '../api/_lib/learningSummary.js';
import { buildLearningTestFixture } from './test-fixtures/testFixtureLearning.js';
import { periodMsWindow, periodDateWindow } from '../api/_lib/periods.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const LOCAL_QA = !process.env.HUB_QA_URL;
const BASE =
  process.env.HUB_QA_URL ??
  `file://${path.resolve(ROOT, 'dist', 'index.html')}`;
const CHROME = '/opt/meta-chromium/chrome';
const QA_DIR = path.resolve(ROOT, 'qa');

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

function summarizeAndExit(code) {
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
  if (failed.length > 0) {
    console.log('FAILED:');
    for (const f of failed) console.log(` - ${f.name} ${f.detail}`);
  }
  process.exit(code);
}

/** Run `npm run build` in `cwd` with exactly `env`. Returns { status, output }. */
function runBuild(cwd, env) {
  const res = spawnSync('npm', ['run', 'build'], { cwd, env, encoding: 'utf8', timeout: 300000 });
  return { status: res.status, output: `${res.stdout ?? ''}${res.stderr ?? ''}` };
}

// ---------------------------------------------------------------------------
// Key resolution. QA needs the private key that signs test tokens and the
// public key that verifies them. From a fresh clone there is no .env, so QA
// generates an ephemeral keypair and passes the matching public key + kid to
// the build via the VITE_HUB_* overrides (public material only). When the
// dev .env key exists, QA uses it with the bundled dev public key.
// ---------------------------------------------------------------------------
function readDotEnvValue(key) {
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) return undefined;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith(`${key}=`)) return trimmed.slice(key.length + 1).trim();
  }
  return undefined;
}

function bundledDevKey() {
  const src = fs.readFileSync(path.join(ROOT, 'src', 'auth', 'keys.ts'), 'utf8');
  const pemMatch = src.match(/DEV_PUBLIC_KEY_PEM = `([\s\S]*?)`/);
  const kidMatch = src.match(/DEV_KID = '([0-9a-f]+)'/);
  if (!pemMatch || !kidMatch) throw new Error('could not extract DEV_PUBLIC_KEY_PEM/DEV_KID from src/auth/keys.ts');
  return { pem: pemMatch[1], kid: kidMatch[1] };
}

function kidOfPem(pem) {
  const der = crypto.createPublicKey(pem).export({ type: 'spki', format: 'der' });
  return crypto.createHash('sha256').update(der).digest('hex').slice(0, 16);
}

function publicPemOfPrivate(privateKeyObj) {
  return crypto.createPublicKey(privateKeyObj).export({ type: 'spki', format: 'pem' });
}

let privateB64 = readDotEnvValue('VITE_JWT_PRIVATE_KEY_B64');
let publicPem;
let kid;
let keySource;
const extraBuildEnv = {};
if (privateB64) {
  const dev = bundledDevKey();
  publicPem = dev.pem;
  kid = dev.kid;
  keySource = 'dev .env key + bundled dev public key';
} else {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  publicPem = publicKey.export({ type: 'spki', format: 'pem' });
  kid = kidOfPem(publicPem);
  privateB64 = privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64');
  extraBuildEnv.VITE_HUB_PUBLIC_KEY_PEM = publicPem;
  extraBuildEnv.VITE_HUB_KID = kid;
  keySource = 'ephemeral keypair (no .env key — fresh-clone path)';
}
console.log(`keys: ${keySource} (kid ${kid})`);

// The signing key MUST be PKCS#8 DER, base64 — that is the documented format
// (PROTOCOL.md, docs/SSO_TOKEN.md) and the only private-key format WebCrypto
// imports. A PKCS#1 value fails here with a clear message instead of an
// uncaught stack trace (and instead of silently breaking dev sign-in).
let privateKeyObj;
try {
  privateKeyObj = crypto.createPrivateKey({ key: Buffer.from(privateB64, 'base64'), format: 'der', type: 'pkcs8' });
} catch {
  check('keys: signing private key parses as PKCS#8 DER', false, 'not PKCS#8 DER base64');
  console.log('\nThe signing key is not PKCS#8 DER (base64). Re-export it as PKCS#8, or');
  console.log('regenerate a keypair with `npm run keygen` (it prints PKCS#8) and update');
  console.log('src/auth/keys.ts + .env together. (A PKCS#1 value parses in Node but');
  console.log('WebCrypto cannot import it, so dev sign-in would fail.)');
  summarizeAndExit(1);
}
const publicKeyObj = crypto.createPublicKey(publicPem);

// ---- 9. Key sanity ----
const derivedPublic = publicPemOfPrivate(privateKeyObj).trim();
check('keys: signing private key matches the verifying public key', derivedPublic === publicPem.trim());
check('keys: kid is the SHA-256(DER) first-16-hex derivation', kidOfPem(publicPem) === kid);
if (results.some((r) => !r.ok)) {
  console.log('\nKey mismatch: the private key in .env is not the pair of the public key in');
  console.log('src/auth/keys.ts. Rotate with `npm run keygen` and update BOTH sides, or');
  console.log('remove the .env key to let QA generate an ephemeral keypair.');
  summarizeAndExit(1);
}

// ---- Stub module fixture (local QA only) ----
// Same-tab navigation means the handoff test navigates the Hub page itself
// to the stub — and this Chrome build blocks loopback navigation, so the
// stub is a temp file:// page (WebCrypto works on file://). The QA build
// points the PremiumPulse tile at it via VITE_MODULE_URL_OVERRIDES.
let stubTmpDir = null;
let STUB_URL = '';
if (LOCAL_QA) {
  const fixture = fs
    .readFileSync(path.join(ROOT, 'scripts', 'fixtures', 'stub-module.html'), 'utf8')
    .split('__HUB_PUBLIC_KEY_PEM__')
    .join(publicPem)
    .split('__HUB_KID__')
    .join(kid)
    .split('__HUB_URL__')
    .join(BASE);
  if (fixture.includes('__HUB_')) throw new Error('stub fixture placeholders not all replaced');
  stubTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-qa-stub-'));
  const stubPath = path.join(stubTmpDir, 'stub-module.html');
  fs.writeFileSync(stubPath, fixture);
  STUB_URL = pathToFileURL(stubPath).href;
  console.log(`stub module: ${STUB_URL}`);
}

// ---- 10. QA's own build (local QA only) ----
// The build needs NO signing variables: the app signs nothing in the
// browser and there is no demo sign-in path. The private key stays in
// the harness (Node-side test-token signing only) — the check below
// proves it never reaches the bundle.
if (LOCAL_QA) {
  const qaBuild = runBuild(ROOT, {
    ...process.env,
    HUB_BUILD_TARGET: 'qa',
    VITE_MODULE_URL_OVERRIDES: JSON.stringify({ premiumpulse: STUB_URL }),
    ...extraBuildEnv,
  });
  check('qa build succeeds (HUB_BUILD_TARGET=qa, stub override)', qaBuild.status === 0, qaBuild.status === 0 ? '' : qaBuild.output.slice(-500));
  if (qaBuild.status !== 0) {
    console.log(qaBuild.output);
    summarizeAndExit(1);
  }
  // The dev signing key, the test IDs and the test PIN must not ship
  // in the browser bundle (the browser never signs; there are no demo
  // accounts and no demo code). Read the built assets and check the
  // raw strings. The bundle must also carry no 'demo' string at all —
  // the word survives only in code comments that explain the removal.
  const bundleText = fs
    .readdirSync(path.join(ROOT, 'dist', 'assets'))
    .filter((f) => f.endsWith('.js'))
    .map((f) => fs.readFileSync(path.join(ROOT, 'dist', 'assets', f), 'utf8'))
    .join('\n');
  check('bundle: no dev signing key ships in the browser bundle', !bundleText.includes(privateB64));
  check('bundle: no test Employee ID ships in the browser bundle', !bundleText.includes('9990001'));
  check('bundle: no test PIN ships in the browser bundle', !bundleText.includes('123456'));
  check('bundle: no demo string ships in the browser bundle', !/demo/i.test(bundleText));
}

// ---- Bundle the app's jwt.ts for Node (negative-case tests use the REAL code) ----
// Unconditional: session seeding (login()) needs it in HUB_QA_URL mode too.
let jwtNode = null;
let jwtBundleDir = null;
{
  jwtBundleDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-qa-jwt-'));
  const bundlePath = path.join(jwtBundleDir, 'jwt-bundle.mjs');
  const esbuild = spawnSync(path.join(ROOT, 'node_modules', '.bin', 'esbuild'), [
    path.join(ROOT, 'src', 'auth', 'jwt.ts'),
    '--bundle',
    '--platform=node',
    '--format=esm',
    '--target=node20',
    `--outfile=${bundlePath}`,
  ], { encoding: 'utf8' });
  check('jwt bundle builds for Node (esbuild)', esbuild.status === 0, esbuild.status === 0 ? '' : `${esbuild.stdout ?? ''}${esbuild.stderr ?? ''}`.slice(-300));
  if (esbuild.status !== 0) {
    summarizeAndExit(1);
  }
  jwtNode = await import(pathToFileURL(bundlePath).href);
}

// ---- Bundle the app's pushRouting.ts for Node (same pattern) ----
let pushRouting = null;
let pushBundleDir = null;
{
  pushBundleDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-qa-push-'));
  const bundlePath = path.join(pushBundleDir, 'push-routing-bundle.mjs');
  const esbuild = spawnSync(path.join(ROOT, 'node_modules', '.bin', 'esbuild'), [
    path.join(ROOT, 'src', 'native', 'pushRouting.ts'),
    '--bundle',
    '--platform=node',
    '--format=esm',
    '--target=node20',
    `--outfile=${bundlePath}`,
  ], { encoding: 'utf8' });
  check('pushRouting bundle builds for Node (esbuild)', esbuild.status === 0, esbuild.status === 0 ? '' : `${esbuild.stdout ?? ''}${esbuild.stderr ?? ''}`.slice(-300));
  if (esbuild.status !== 0) {
    summarizeAndExit(1);
  }
  pushRouting = await import(pathToFileURL(bundlePath).href);
}

// ---------------------------------------------------------------------------
// Browser helpers (Milestone 1, unchanged)
// ---------------------------------------------------------------------------
async function newPage(browser, width) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.setViewport({ width, height: 900, deviceScaleFactor: 1 });
  return { ctx, page, errors };
}

/**
 * Test users for session seeding. There is NO demo sign-in path —
 * the demo accounts were removed (Mahadi 2026-11-20) and the demo
 * code deleted the same day — so these records exist only so the
 * harness can mint test tokens for the role views (999xxxx IDs are
 * safely non-real). No PIN exists for any of them.
 */
const TEST_USERS = {
  9990001: { role: 'employee', name: 'Test Agent' },
  9990002: { role: 'team_lead', name: 'Test Team Lead' },
  9990003: { role: 'manager', name: 'Test Manager' },
  9990004: { role: 'admin', name: 'Test Admin' },
};

/**
 * Seed a session: sign a test token in Node with the app's own
 * jwt.ts (bundled above) + the dev/ephemeral private key, drop it
 * into sessionStorage, and reload — the app restores it exactly as
 * it would a server-issued token (signature + claims verified
 * against the bundled public key). Returns the token. Unknown IDs
 * seed as an employee named 'Test User' unless role/name are given.
 */
async function login(page, id, role, name) {
  const u = TEST_USERS[id] ?? { role: 'employee', name: 'Test User' };
  const token = await jwtNode.signSsoToken(
    { sub: id, name: name ?? u.name, role: role ?? u.role },
    privateB64,
  );
  // domcontentloaded, NOT networkidle0: the tile-icon section (§16)
  // holds live-icon requests via request interception, so the
  // network never goes idle after the reload (the home page's tiles
  // request the held icons). Call sites wait for content afterwards.
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.evaluate((t) => sessionStorage.setItem('hub-session-token', t), token);
  await page.reload({ waitUntil: 'domcontentloaded' });
  return token;
}

/**
 * Set a native date input's value the way React notices it: the
 * native value setter + a bubbling 'input' event (page.type cannot
 * reliably fill date inputs).
 */
async function setDateInput(page, selector, value) {
  await page.evaluate((sel, val) => {
    const el = document.querySelector(sel);
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(el, val);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, selector, value);
}

async function getToken(page) {
  return page.evaluate(() => sessionStorage.getItem('hub-session-token'));
}

function decodeJwt(token) {
  const [, payload] = token.split('.');
  const json = Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
  const [header] = token.split('.');
  const headerJson = Buffer.from(header.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
  return { header: JSON.parse(headerJson), payload: JSON.parse(json) };
}

async function overflowCheck(page) {
  return page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
    overflow: document.documentElement.scrollWidth > window.innerWidth,
  }));
}

async function clickNav(page, bn, en) {
  await page.evaluate(
    (labels) => {
      const btns = [...document.querySelectorAll('nav button')];
      btns.find((b) => labels.some((l) => b.textContent.includes(l)))?.click();
    },
    [bn, en],
  );
}

/**
 * Dashboard terminal state: live KPIs rendered, the empty state rendered,
 * or the error state rendered. Returns 'live' | 'empty' | 'error'. The
 * live fetch needs the /api/retail-data proxy, which does not exist under
 * file:// in this VM's headless Chrome — so 'error' is the expected
 * outcome here, and the live path is verified separately by
 * scripts/qa-retail-live.mjs.
 */
async function waitForDashboardTerminal(page) {
  await page.waitForFunction(
    () =>
      document.body.textContent.includes('ড্যাশবোর্ড লোড করা যায়নি') ||
      document.body.textContent.includes('Could not load the dashboard') ||
      document.body.textContent.includes('মোট প্রাপ্ত প্রিমিয়াম') ||
      document.body.textContent.includes('Total premium received') ||
      document.body.textContent.includes('এই স্কোপে কোনো সেলস ডেটা নেই') ||
      document.body.textContent.includes('No sales data in scope'),
    { timeout: 30000 },
  );
  return page.evaluate(() => {
    const text = document.body.textContent;
    if (text.includes('মোট প্রাপ্ত প্রিমিয়াম') || text.includes('Total premium received')) return 'live';
    if (text.includes('এই স্কোপে কোনো সেলস ডেটা নেই') || text.includes('No sales data in scope')) return 'empty';
    return 'error';
  });
}

/**
 * The test fixture summary the proxy would return for the same rows —
 * used to seed the Dashboard's session cache (hub-retail-cache-v1) so
 * the ready state can be verified without the proxy. Values are the
 * hand-computed fixture expectations (see scripts/qa-retail-live.mjs).
 * The fixture scenario is PINNED to 2026-11-20: its due expectations
 * depend on instalment dates relative to the reference day, so pinning
 * keeps the seeded values deterministic whatever day the suite runs.
 */
const FIXTURE_TODAY = '2026-11-20';
function testSummaryFor(employeeId, role, period = 'all', customRange = null) {
  return summarizeRetail(buildTestPayload(FIXTURE_TODAY), { employeeId, role }, FIXTURE_TODAY, period, customRange);
}

/**
 * Phase 2 feed summaries for the seeded caches (§21). The figures are
 * the hand-computed test fixture values; the UI treats the seeded
 * summaries exactly as it treats live proxy data (there is no demo
 * flag any more — the demo code was deleted 2026-11-20).
 */
function leadflowSummaryFor(employeeId, role, period = 'all') {
  const fixture = buildLeadflowTestFixture(FIXTURE_TODAY);
  const scopes = scopeSetsFor(fixture.users, employeeId, role);
  const byUuid = new Map(fixture.users.map((u) => [String(u.id), u]));
  const byEmp = new Map(fixture.users.map((u) => [String(u.employee_id).toUpperCase(), u]));
  const emptyCounts = {
    followups: { overdue: 0, today: 0, upcoming: 0 },
    total: 0,
    open: 0,
    converted: 0,
    todayCollection: 0,
    createdInPeriod: 0,
  };
  const periodMs = periodMsWindow(period, FIXTURE_TODAY);
  const ownCounts = scopes
    ? aggregateLeadCounts(fixture.leads, byUuid, byEmp, scopes.ownUuids, scopes.ownEmpIds, fixture.terminalStatuses, FIXTURE_TODAY, periodMs)
    : emptyCounts;
  const teamCounts = scopes
    ? aggregateLeadCounts(fixture.leads, byUuid, byEmp, scopes.teamUuids, scopes.teamEmpIds, fixture.terminalStatuses, FIXTURE_TODAY, periodMs)
    : emptyCounts;
  const summary = summarizeLeadflow(
    { users: fixture.users, ownCounts, teamCounts, rows: fixture.leads, terminalStatuses: fixture.terminalStatuses, period, periodWindow: periodDateWindow(period, FIXTURE_TODAY) },
    { employeeId, role },
    FIXTURE_TODAY,
  );
  return summary;
}
function learningSummaryFor(employeeId, role, period = 'all') {
  const fixture = buildLearningTestFixture(FIXTURE_TODAY);
  const summary = summarizeLearning(
    {
      ...fixture,
      creditLedger: fixture.creditLedger,
      downlineIds: null,
      truncated: false,
      period,
      periodWindow: periodDateWindow(period, FIXTURE_TODAY),
      periodWindowMs: periodMsWindow(period, FIXTURE_TODAY),
    },
    { employeeId, role },
  );
  return summary;
}

/** Wait until a Leads/Learning summary strip has rendered stat values
 * (the ready state — the strip used to carry a "Live from …" line to
 * wait on; that line was removed with the demo code). */
async function waitForSummaryReady(page) {
  await page.waitForFunction(
    () => {
      const section = document.querySelector('section[aria-label="Summary"], section[aria-label="সারসংক্ষেপ"]');
      return section && section.querySelectorAll('p.text-2xl').length > 0;
    },
    { timeout: 5000 },
  );
}

/** No 'demo' text anywhere user-visible on the current page (EN + BN
 * — 'ডেমো' included). The word may remain in code comments only. */
async function noDemoText(page) {
  return page.evaluate(() => !/demo|ডেমো/i.test(document.body.textContent));
}

/** The splash shows on every (re)load and fades within ~1s — wait it
 * out before a screenshot, or the shot shows the splash, not the
 * page. Returns immediately when the splash is already gone. */
async function waitForSplashGone(page) {
  await page.waitForFunction(() => !document.querySelector('[data-splash]'), { timeout: 5000 }).catch(() => {});
}

/** Seed any of the three feed caches (null = leave unseeded).
 * Seeds the `:<period>` key — the pages default to Today; Home and
 * the dues feed read `:all`. A custom range is seeded by passing
 * its full suffix, e.g. 'custom:2026-11-01:2026-11-20'. */
async function seedFeedCaches(page, employeeId, { leadflow, learning, retail }, period = 'all') {
  await page.evaluate(
    (caches) => {
      for (const [key, cache] of Object.entries(caches)) {
        if (cache) sessionStorage.setItem(key, JSON.stringify(cache));
      }
    },
    {
      [`hub-leadflow-cache-v1:${period}`]: leadflow ? { summary: leadflow, employeeId, syncedAt: Date.now() } : null,
      [`hub-learning-cache-v1:${period}`]: learning ? { summary: learning, employeeId, syncedAt: Date.now() } : null,
      [`hub-retail-cache-v1:${period}`]: retail ? { summary: retail, employeeId, syncedAt: Date.now() } : null,
    },
  );
}
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: [
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--no-proxy-server',
    '--allow-file-access-from-files',
    '--disable-features=LocalNetworkAccessChecks',
    '--hatch-webgl-allowed-domains-file=/tmp/webgl-policy.txt',
    '--hatch-webgl-allowed-domains-sha256=8097045f0459c96c4cdc76e3a1af4e0f43f640b4b59c43d6db35e3641c0264c6',
  ],
});

fs.mkdirSync(QA_DIR, { recursive: true });

// The seeded token from the 9990002 session, reused by the RS256 checks.
let issuedToken = null;

// Temp copy used by the clean production-build check (removed in finally).
let prodTmp = null;

try {
  // ---- 1. Login page loads, no console errors; EN default ----
  {
    const { ctx, page, errors } = await newPage(browser, 1440);
    await page.goto(BASE, { waitUntil: 'networkidle0' });
    const title = await page.$eval('h1', (el) => el.textContent);
    check('login page loads (EN default)', title.includes('Sign in to Agent Hub'), title);
    // The login photo + logos are live-referenced from the Learning
    // Hub deployment and cannot load in this VM (no external
    // network) — "Failed to load resource" is a handled network
    // failure (the fallbacks show), not an app error.
    const appErrors = errors.filter((e) => !e.startsWith('Failed to load resource'));
    check('login page: no console errors', appErrors.length === 0, appErrors.join(' | '));
    await ctx.close();
  }

  // ---- 2. All 4 roles render from a seeded session; JWT claims ----
  // There is no demo sign-in path — login() seeds a Node-signed test
  // token and the app restores it. The token's claims (sub/name/role/exp-iat=3600) are checked from the stored
  // session, and the 9990002 token is reused by the RS256 checks.
  const roleCases = [
    { id: '9990001', role: 'employee', name: 'Test Agent' },
    { id: '9990002', role: 'team_lead', name: 'Test Team Lead' },
    { id: '9990003', role: 'manager', name: 'Test Manager' },
    { id: '9990004', role: 'admin', name: 'Test Admin' },
  ];
  for (const c of roleCases) {
    const { ctx, page, errors } = await newPage(browser, 1440);
    await login(page, c.id);
    await page.waitForFunction(
      (name) => document.body.textContent.includes(name),
      { timeout: 5000 },
      c.name,
    );
    const token = await getToken(page);
    if (c.id === '9990002' && token) issuedToken = token;
    check(`login ${c.id} (${c.role}): home renders`, !!token);
    if (token) {
      const { header, payload } = decodeJwt(token);
      const claimsOk =
        payload.sub === c.id && payload.name === c.name && payload.role === c.role && payload.exp - payload.iat === 3600;
      check(`login ${c.id}: JWT claims sub/name/role/exp-iat=3600`, claimsOk, JSON.stringify(payload));
      if (c.id === '9990002') {
        console.log('SAMPLE JWT header:', JSON.stringify(header));
        console.log('SAMPLE JWT payload:', JSON.stringify(payload));
      }
    }
    // Live tile icons fail to load in this VM (no external network) and log
    // "Failed to load resource" — a network failure the tile handles via its
    // monogram fallback, not an app error. Same filter as the dashboard
    // sections below.
    const appErrors = errors.filter((e) => !e.startsWith('Failed to load resource'));
    check(`login ${c.id}: no console errors`, appErrors.length === 0, appErrors.join(' | '));
    await ctx.close();
  }

  // ---- 3. A 999xxxx UI sign-in attempt FAILS (no demo route) ----
  // There are no demo accounts and no demo code path — submitting a
  // 999xxxx ID in the form must not sign in, must not issue a token,
  // and must never show a lockout message (there is no client-side
  // lockout any more; the server lockout is covered by qa:auth-live).
  // Under file:// the /api/hub-auth fetch throws, so the form shows
  // the not-configured message; the point here is the failure, not
  // the wording.
  {
    const { ctx, page } = await newPage(browser, 1440);
    await page.goto(BASE, { waitUntil: 'networkidle0' });
    for (let i = 0; i < 5; i++) {
      await page.waitForSelector('#employee-id');
      await page.evaluate(() => {
        document.querySelector('#employee-id').value = '';
        document.querySelector('#pin').value = '';
      });
      await page.type('#employee-id', '9990002');
      await page.type('#pin', '000000');
      await page.click('button[type="submit"]');
      await new Promise((r) => setTimeout(r, 400));
    }
    const alert = await page.$eval('[role="alert"]', (el) => el.textContent);
    check('no demo sign-in: 999xxxx attempt fails (not configured)', /কনফিগার করা হয়নি|not configured/i.test(alert), alert);
    check('no demo sign-in: 5 attempts never show a lock message', !/লক|lock/i.test(alert), alert);
    const tokenAfterFail = await getToken(page);
    check('no demo sign-in: no token issued', tokenAfterFail === null);
    const stillLogin = await page.evaluate(() => !!document.querySelector('#employee-id'));
    check('no demo sign-in: still on the login page', stillLogin);
    await ctx.close();
  }

  // ---- 4. Sign-out clears the session token ----
  {
    const { ctx, page } = await newPage(browser, 1440);
    await login(page, '9990001');
    await page.waitForFunction(() => document.body.textContent.includes('Test Agent'), { timeout: 5000 });
    await page.evaluate(() => {
      const btns = [...document.querySelectorAll('button')];
      btns.find((b) => b.textContent.includes('প্রোফাইল') || b.textContent.includes('Profile'))?.click();
    });
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.textContent.includes('সাইন আউট') || b.textContent.includes('Sign out')), { timeout: 5000 });
    const tokenBefore = await getToken(page);
    await page.evaluate(() => {
      [...document.querySelectorAll('button')].find((b) => b.textContent.includes('সাইন আউট') || b.textContent.includes('Sign out'))?.click();
    });
    await page.waitForSelector('#employee-id', { timeout: 5000 });
    const tokenAfter = await getToken(page);
    check('sign-out clears session token', tokenBefore !== null && tokenAfter === null);
    await ctx.close();
  }

  // ---- 5. EN/BN switch changes strings ----
  {
    const { ctx, page } = await newPage(browser, 1440);
    await page.goto(BASE, { waitUntil: 'networkidle0' });
    const enTitle = await page.$eval('h1', (el) => el.textContent);
    await page.evaluate(() => {
      [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'BN')?.click();
    });
    await page.waitForFunction(() => document.querySelector('h1')?.textContent.includes('এজেন্ট হাবে'), { timeout: 5000 });
    const bnTitle = await page.$eval('h1', (el) => el.textContent);
    check('EN/BN switch changes login title', bnTitle !== enTitle && bnTitle.includes('এজেন্ট হাবে'), `${enTitle} → ${bnTitle}`);
    const stored = await page.evaluate(() => localStorage.getItem('hub-lang'));
    check('language persisted in localStorage', stored === 'bn', stored);
    await ctx.close();
  }

  // ---- 6. Role views differ ----
  {
    const { ctx, page } = await newPage(browser, 1440);
    await login(page, '9990002');
    await page.waitForFunction(() => document.body.textContent.includes('Test Team Lead'), { timeout: 5000 });
    const teamLeadHasTeam = await page.evaluate(() => document.body.textContent.includes('আপনার টিম') || document.body.textContent.includes('Your team'));
    check('team lead home: team section present', teamLeadHasTeam);
    await ctx.close();
  }
  {
    const { ctx, page } = await newPage(browser, 1440);
    await login(page, '9990001');
    await page.waitForFunction(() => document.body.textContent.includes('Test Agent'), { timeout: 5000 });
    const employeeHasTeam = await page.evaluate(() => document.body.textContent.includes('আপনার টিম') || document.body.textContent.includes('Your team'));
    check('employee home: NO team section', !employeeHasTeam);
    await ctx.close();
  }
  {
    const { ctx, page } = await newPage(browser, 1440);
    await login(page, '9990004');
    await page.waitForFunction(() => document.body.textContent.includes('Test Admin'), { timeout: 5000 });
    await page.evaluate(() => {
      [...document.querySelectorAll('button')].find((b) => b.textContent.includes('প্রোফাইল') || b.textContent.includes('Profile'))?.click();
    });
    await page.waitForFunction(() => document.body.textContent.includes('টি অ্যান্ড ডি কনসোল') || document.body.textContent.includes('T&D Console'), { timeout: 5000 });
    check('admin profile: console placeholder present', true);
    await page.evaluate(() => {
      [...document.querySelectorAll('button')].find((b) => b.textContent.includes('হোম') || b.textContent.includes('Home'))?.click();
    });
    // Back on Home with no seeded cache and no proxy under file://,
    // the feeds fail — the page must say so plainly (error + retry),
    // never silently show fixture figures or a fake empty state. (The
    // old check expected the demo admin's empty text here — that text
    // came from the demo fallback, which is deleted.)
    await page.waitForFunction(
      () =>
        document.body.textContent.includes('Could not load this data.') ||
        document.body.textContent.includes('এই ডেটা লোড করা যায়নি।'),
      { timeout: 10000 },
    );
    const adminError = await page.evaluate(
      () =>
        (document.body.textContent.includes('Could not load this data.') ||
          document.body.textContent.includes('এই ডেটা লোড করা যায়নি।')) &&
        (document.body.textContent.includes('Try again') ||
          document.body.textContent.includes('আবার চেষ্টা করুন')) &&
        !document.body.textContent.includes('48,500') &&
        !document.body.textContent.includes('185,000'),
    );
    check('admin home: failed feeds say so plainly (error + retry, no fixture figures)', adminError);
    await ctx.close();
  }

  // ---- 7. Screenshots at 375 / 768 / 1440 + overflow checks ----
  for (const width of [375, 768, 1440]) {
    const { ctx, page } = await newPage(browser, width);
    // Login — wait for the splash to fade first, or the shot shows
    // the splash instead of the form.
    await page.goto(BASE, { waitUntil: 'networkidle0' });
    await page.waitForFunction(() => !document.querySelector('[data-splash]'), { timeout: 5000 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 300));
    const loginOv = await overflowCheck(page);
    check(`screenshot login-${width}: no horizontal overflow`, !loginOv.overflow, `scrollWidth=${loginOv.scrollWidth} innerWidth=${loginOv.innerWidth}`);
    await waitForSplashGone(page);
    await page.screenshot({ path: path.join(QA_DIR, `login-${width}.png`), fullPage: true });
    // Home as Team Lead (richest view: own + team widgets)
    await login(page, '9990002');
    await page.waitForFunction(() => document.body.textContent.includes('Test Team Lead'), { timeout: 5000 });
    await new Promise((r) => setTimeout(r, 300));
    const homeOv = await overflowCheck(page);
    check(`screenshot home-${width}: no horizontal overflow`, !homeOv.overflow, `scrollWidth=${homeOv.scrollWidth} innerWidth=${homeOv.innerWidth}`);
    await waitForSplashGone(page);
    await page.screenshot({ path: path.join(QA_DIR, `home-${width}.png`), fullPage: true });
    // Profile
    await page.evaluate(() => {
      [...document.querySelectorAll('button')].find((b) => b.textContent.includes('প্রোফাইল') || b.textContent.includes('Profile'))?.click();
    });
    await new Promise((r) => setTimeout(r, 500));
    const profOv = await overflowCheck(page);
    check(`screenshot profile-${width}: no horizontal overflow`, !profOv.overflow, `scrollWidth=${profOv.scrollWidth} innerWidth=${profOv.innerWidth}`);
    await waitForSplashGone(page);
    await page.screenshot({ path: path.join(QA_DIR, `profile-${width}.png`), fullPage: true });
    // Dashboard (M3) — terminal state (live or error), overflow, screenshot
    await clickNav(page, 'ড্যাশবোর্ড', 'Dashboard');
    const dashPath = await waitForDashboardTerminal(page);
    await new Promise((r) => setTimeout(r, 300));
    const dashOv = await overflowCheck(page);
    check(`screenshot dashboard-${width}: no horizontal overflow (${dashPath})`, !dashOv.overflow, `scrollWidth=${dashOv.scrollWidth} innerWidth=${dashOv.innerWidth}`);
    await waitForSplashGone(page);
    await page.screenshot({ path: path.join(QA_DIR, `dashboard-${width}.png`), fullPage: true });
    await ctx.close();
  }

  // ---- 8. One home screenshot per role at 1440 ----
  const roleShots = [
    { id: '9990001', file: 'home-employee-1440.png' },
    { id: '9990003', file: 'home-manager-1440.png' },
    { id: '9990004', file: 'home-admin-1440.png' },
  ];
  for (const s of roleShots) {
    const { ctx, page } = await newPage(browser, 1440);
    await login(page, s.id);
    await page.waitForFunction(() => document.body.textContent.includes('Test'), { timeout: 5000 });
    await new Promise((r) => setTimeout(r, 300));
    await waitForSplashGone(page);
    await page.screenshot({ path: path.join(QA_DIR, s.file), fullPage: true });
    console.log(`SHOT  ${s.file}`);
    await ctx.close();
  }

  // ---- 16. Dashboard page (retail): terminal state, retail link, refresh ----
  {
    const { ctx, page, errors } = await newPage(browser, 1440);
    await login(page, '9990002');
    await page.waitForFunction(() => document.body.textContent.includes('Test Team Lead'), { timeout: 5000 });
    await clickNav(page, 'ড্যাশবোর্ড', 'Dashboard');
    const dashPath = await waitForDashboardTerminal(page);
    check('dashboard: reaches a terminal state', dashPath === 'live' || dashPath === 'error' || dashPath === 'empty', `path=${dashPath}`);
    const dashTitle = await page.$eval('h1', (el) => el.textContent);
    check('dashboard: heading is Retail Sales Dashboard', dashTitle === 'Retail Sales Dashboard' || dashTitle === 'রিটেইল সেলস ড্যাশবোর্ড', dashTitle);
    // The "Open the full dashboard" section must link to the Retail Sales
    // Dashboard (Mahadi 2026-11-20 — the SCC tile was the wrong source).
    const retailLink = await page.evaluate(() => {
      const a = [...document.querySelectorAll('a')].find((el) =>
        el.href.includes('retail-dashboard-zeta.vercel.app'),
      );
      return a ? a.href : null;
    });
    check('dashboard: full-dashboard link points to Retail', !!retailLink, retailLink || 'none');
    const sccLink = await page.evaluate(() => {
      const a = [...document.querySelectorAll('a')].find((el) =>
        el.href.includes('training-dashboard-shanta-life.vercel.app'),
      );
      return a ? a.href : null;
    });
    check('dashboard: removed SCC tile stays gone (no SCC link)', !sccLink, sccLink || 'none');
    const hasRefresh = await page.evaluate(() =>
      [...document.querySelectorAll('button')].some(
        (b) => b.textContent.includes('রিফ্রেশ') || b.textContent.includes('Refresh'),
      ),
    );
    check('dashboard: refresh button present', hasRefresh);
    if (dashPath === 'error') {
      const hasRetry = await page.evaluate(() =>
        [...document.querySelectorAll('button')].some(
          (b) => b.textContent.includes('আবার চেষ্টা করুন') || b.textContent.includes('Try again'),
        ),
      );
      check('dashboard (error path): retry button present', hasRetry);
    } else if (dashPath === 'live') {
      const hasLeaders = await page.evaluate(
        () =>
          document.body.textContent.includes('শীর্ষ টিম মেম্বার') ||
          document.body.textContent.includes('Top team members'),
      );
      check('dashboard (live path): leaders section present', hasLeaders);
    } else {
      check('dashboard (empty path): empty state present', true, 'empty scope, no live fetch here');
    }
    // Chrome logs a failed fetch as a console error ("Failed to load
    // resource") even when the app catches it — and the Dashboard handles a
    // failed fetch by design (error state + retry). Resource-load logs are
    // therefore excluded here; uncaught JS errors (pageerror / console.error
    // from the app) still fail the check.
    const appErrors = errors.filter((e) => !e.startsWith('Failed to load resource'));
    check('dashboard: no console errors', appErrors.length === 0, appErrors.join(' | '));
    await ctx.close();
  }

  // ---- 16b. Dashboard ready state (retail): synthetic cache, exact figures ----
  // Seeded with the test fixture summary for 9990002 (Team Lead), computed
  // by the Hub's own summarizer — the exact values the proxy returns.
  // The page defaults to This Month: total ৳43,000 · FYCP ৳35,000 ·
  // policies 1 · due ৳34,000 (4 pol) · persistency 83.3% (5/6) ·
  // active 3 of 3 (ever-sold) · leaders Test Agent ৳35,000, Eleven
  // ৳0, Twelve ৳0. Switching the dropdown to All time shows total
  // ৳1,64,000 · FYCP ৳1,56,000 · policies 7 · leaders Test Agent
  // ৳67,000, Test FA Eleven ৳57,000, Test FA Twelve ৳15,000 · scope
  // "Own + team". There is no DEMO badge or demo note any more — the
  // demo code was deleted 2026-11-20. The background refresh fails here
  // (no proxy under file://), so the cached-while-refreshing banner
  // must also show.
  {
    const { ctx, page, errors } = await newPage(browser, 1440);
    await login(page, '9990002');
    await page.waitForFunction(() => document.body.textContent.includes('Test Team Lead'), { timeout: 5000 });
    await seedFeedCaches(page, '9990002', { leadflow: null, learning: null, retail: testSummaryFor('9990002', 'team_lead', 'this-month') }, 'this-month');
    await seedFeedCaches(page, '9990002', { leadflow: null, learning: null, retail: testSummaryFor('9990002', 'team_lead') }, 'all');
    await clickNav(page, 'ড্যাশবোর্ড', 'Dashboard');
    const dashPath = await waitForDashboardTerminal(page);
    check('dashboard (synthetic cache): ready state renders', dashPath === 'live', `path=${dashPath}`);
    // KPI values read per card (WidgetCard renders <section aria-label={title}>),
    // so a figure is attributed to its card — not just present somewhere.
    const readKpisHere = () =>
      page.evaluate(() => {
        const out = {};
        for (const section of document.querySelectorAll('section[aria-label]')) {
          const value = section.querySelector('p.text-3xl');
          if (value) out[section.getAttribute('aria-label')] = value.textContent.trim();
        }
        return out;
      });
    // Default is This Month — assert the this-month figures first.
    check('dashboard ready: dropdown defaults to This Month', (await page.$eval('#period-select', (el) => el.value)) === 'this-month');
    const kpisThisMonth = await readKpisHere();
    check('dashboard ready (this-month default): total ৳43,000 + FYCP ৳35,000 + policies 1', kpisThisMonth['Total premium received'] === '৳43,000' && kpisThisMonth.FYCP === '৳35,000' && kpisThisMonth.Policies === '1', JSON.stringify(kpisThisMonth));
    check('dashboard ready (this-month): due ৳34,000 + persistency 83.3% + active 3 of 3', kpisThisMonth['Due premium — this month'] === '৳34,000' && kpisThisMonth.Persistency === '83.3%' && kpisThisMonth['Active field FAs'] === '3 of 3', JSON.stringify(kpisThisMonth));
    const bodyThisMonth = await page.evaluate(() => document.body.textContent);
    check('dashboard ready (this-month): leaders still listed (35,000 / 0 / 0)', bodyThisMonth.includes('Test Agent') && bodyThisMonth.includes('Test FA Eleven') && bodyThisMonth.includes('Test FA Twelve'));
    check('dashboard ready (this-month): due card shows the MTD window', bodyThisMonth.includes('1 – 20 Nov 2026'));
    // Switch the dropdown to All time and assert the all-time figures.
    await page.select('#period-select', 'all');
    await page.waitForFunction(
      () => [...document.querySelectorAll('section[aria-label="Total premium received"] p.text-3xl')].some((el) => el.textContent.trim() === '৳1,64,000'),
      { timeout: 5000 },
    );
    // Wait for the background refresh to fail so the banner is visible.
    await page.waitForFunction(
      () => document.body.textContent.includes('Refresh failed') || document.body.textContent.includes('রিফ্রেশ ব্যর্থ'),
      { timeout: 10000 },
    ).catch(() => {});
    const body = await page.evaluate(() => document.body.textContent);
    const kpis = await readKpisHere();
    check('dashboard ready: total premium ৳1,64,000', kpis['Total premium received'] === '৳1,64,000', JSON.stringify(kpis));
    check('dashboard ready: FYCP ৳1,56,000 + policies 7', kpis.FYCP === '৳1,56,000' && kpis.Policies === '7', JSON.stringify(kpis));
    check('dashboard ready: due premium ৳34,000', kpis['Due premium — this month'] === '৳34,000', JSON.stringify(kpis));
    check('dashboard ready: persistency 83.3%', kpis.Persistency === '83.3%', JSON.stringify(kpis));
    check('dashboard ready: active FAs 3 of 3', kpis['Active field FAs'] === '3 of 3', JSON.stringify(kpis));
    check('dashboard ready: due 4 policies + persistency 5 of 6 inforce', body.includes('4 policies') && body.includes('5 of 6 inforce'));
    check('dashboard ready: deferred/renewal subline', body.includes('Deferred 3.0%') && body.includes('Renewal 4.9%'));
    check('dashboard ready: leaders ranked (Test Agent, Eleven, Twelve)', body.includes('Test Agent') && body.includes('Test FA Eleven') && body.includes('Test FA Twelve'));
    check('dashboard ready: no DEMO badge or demo note anywhere', !body.includes('DEMO DATA') && !/demo/i.test(body));
    check('dashboard ready: scope label Own + team', body.includes('Own + team'));
    check('dashboard ready: cached-while-refreshing banner', body.includes('Refresh failed') || body.includes('রিফ্রেশ ব্যর্থ'));
    const readyOv = await overflowCheck(page);
    check('dashboard ready: no horizontal overflow', !readyOv.overflow, `scrollWidth=${readyOv.scrollWidth} innerWidth=${readyOv.innerWidth}`);
    await waitForSplashGone(page);
    await page.screenshot({ path: path.join(QA_DIR, 'dashboard-ready-1440.png'), fullPage: true });
    const appErrors = errors.filter((e) => !e.startsWith('Failed to load resource'));
    check('dashboard ready: no console errors', appErrors.length === 0, appErrors.join(' | '));
    await ctx.close();
  }

  // ---- 16c. Dashboard role views: Employee, Admin, empty scope ----
  // Employee (9990001): own data only — total ৳67,000, persistency 100.0%,
  // scope "Own data", and NO leaderboard section at all. Both the
  // :this-month and :all caches are seeded; the page defaults to This
  // Month, so the all-time assertions need the dropdown switched to
  // All time first.
  {
    const { ctx, page } = await newPage(browser, 1440);
    await login(page, '9990001');
    await page.waitForFunction(() => document.body.textContent.includes('Test Agent'), { timeout: 5000 });
    await seedFeedCaches(page, '9990001', { leadflow: null, learning: null, retail: testSummaryFor('9990001', 'employee', 'this-month') }, 'this-month');
    await seedFeedCaches(page, '9990001', { leadflow: null, learning: null, retail: testSummaryFor('9990001', 'employee') }, 'all');
    await clickNav(page, 'ড্যাশবোর্ড', 'Dashboard');
    const dashPath = await waitForDashboardTerminal(page);
    check('dashboard (employee): ready state renders', dashPath === 'live', `path=${dashPath}`);
    await page.select('#period-select', 'all');
    await page.waitForFunction(
      () => [...document.querySelectorAll('section[aria-label="Total premium received"] p.text-3xl')].some((el) => el.textContent.trim() === '৳67,000'),
      { timeout: 5000 },
    );
    const body = await page.evaluate(() => document.body.textContent);
    check('dashboard (employee): own total ৳67,000 + persistency 100.0%', body.includes('৳67,000') && body.includes('100.0%'));
    check('dashboard (employee): scope label Own data', body.includes('Own data'));
    check('dashboard (employee): no leaderboard section', !body.includes('Top team members') && !body.includes('Top Business Executives') && !body.includes('শীর্ষ টিম মেম্বার') && !body.includes('শীর্ষ বিজনেস এক্সিকিউটিভ'));
    await ctx.close();
  }
  // Admin (9990004): org-wide — Top Business Executives with Test BE
  // ৳2,34,000, the Unassigned line ৳7,000, scope "Org-wide".
  {
    const { ctx, page } = await newPage(browser, 1440);
    await login(page, '9990004');
    await page.waitForFunction(() => document.body.textContent.includes('Test Admin'), { timeout: 5000 });
    await seedFeedCaches(page, '9990004', { leadflow: null, learning: null, retail: testSummaryFor('9990004', 'admin', 'this-month') }, 'this-month');
    await seedFeedCaches(page, '9990004', { leadflow: null, learning: null, retail: testSummaryFor('9990004', 'admin') }, 'all');
    await clickNav(page, 'ড্যাশবোর্ড', 'Dashboard');
    const dashPath = await waitForDashboardTerminal(page);
    check('dashboard (admin): ready state renders', dashPath === 'live', `path=${dashPath}`);
    await page.select('#period-select', 'all');
    await page.waitForFunction(
      () => [...document.querySelectorAll('section[aria-label="Total premium received"] p.text-3xl')].some((el) => el.textContent.trim() === '৳2,41,000'),
      { timeout: 5000 },
    );
    const body = await page.evaluate(() => document.body.textContent);
    check('dashboard (admin): Top Business Executives + Test BE ৳2,34,000', body.includes('Top Business Executives') && body.includes('Test BE') && body.includes('৳2,34,000'));
    check('dashboard (admin): Unassigned line ৳7,000', body.includes('Unassigned') && body.includes('৳7,000'));
    check('dashboard (admin): scope label Org-wide', body.includes('Org-wide'));
    await ctx.close();
  }
  // Empty scope: the empty state with the no-code note — and no KPI cards.
  // Only the :this-month cache is seeded — the page defaults to This
  // Month, so the empty state renders immediately.
  {
    const { ctx, page } = await newPage(browser, 1440);
    await login(page, '9990001');
    await page.waitForFunction(() => document.body.textContent.includes('Test Agent'), { timeout: 5000 });
    const emptySummary = testSummaryFor('9990001', 'employee', 'this-month');
    emptySummary.empty = true;
    emptySummary.emptyReason = 'no-code';
    await seedFeedCaches(page, '9990001', { leadflow: null, learning: null, retail: emptySummary }, 'this-month');
    await clickNav(page, 'ড্যাশবোর্ড', 'Dashboard');
    const dashPath = await waitForDashboardTerminal(page);
    check('dashboard (empty scope): empty state renders', dashPath === 'empty', `path=${dashPath}`);
    const body = await page.evaluate(() => document.body.textContent);
    check('dashboard (empty scope): no-code note', body.includes('No producer code is linked to this Employee ID'));
    check('dashboard (empty scope): no KPI cards', !body.includes('Total premium received') && !body.includes('মোট প্রাপ্ত প্রিমিয়াম'));
    await ctx.close();
  }
  // ---- 17. Due-premium widget (M3) ----
  // One widget only, on Home. Three states, no demo anywhere:
  // (a) unseeded Team Lead — the retail fetch fails under file://, so
  // the widget shows the error state + retry, never fixture figures;
  // (b) Manager with a seeded cache — the two-column live widget
  // (Upcoming + Overdue) + MTD totals; (c) Admin with a seeded EMPTY
  // summary — the plain empty state. The old demo rows ("DEMO-"
  // policies) and the "showing 5 of 31" line are gone with the demo
  // code.
  {
    const { ctx, page } = await newPage(browser, 1440);
    await login(page, '9990002');
    await page.waitForFunction(() => document.body.textContent.includes('Test Team Lead'), { timeout: 5000 });
    // The retail fetch fails (no proxy under file://) and the single
    // retry fails too — the widget itself must land on the error state.
    await page.waitForFunction(
      () => {
        const el = document.querySelector('section[aria-label="Due premiums"], section[aria-label="বকেয়া প্রিমিয়াম"]');
        return el && (el.textContent.includes('Could not load this data.') || el.textContent.includes('এই ডেটা লোড করা যায়নি।'));
      },
      { timeout: 10000 },
    );
    const widget = await page.evaluate(() => {
      const sections = [
        ...document.querySelectorAll(
          'section[aria-label="বকেয়া প্রিমিয়াম"], section[aria-label="Due premiums"]',
        ),
      ];
      return { count: sections.length, text: sections[0] ? sections[0].textContent : '' };
    });
    check('due widget: exactly one widget on team-lead home', widget.count === 1, `sections=${widget.count}`);
    check(
      'due widget (failed fetch): error state + retry, no fixture figures',
      widget.text.includes('Could not load this data.') &&
        widget.text.includes('Try again') &&
        !widget.text.includes('48,500') &&
        !widget.text.includes('185,000'),
      widget.text.slice(0, 160),
    );
    check('due widget (failed fetch): no demo text', !/demo|ডেমো/i.test(widget.text), widget.text.slice(0, 120));
    await ctx.close();
  }
  {
    const { ctx, page } = await newPage(browser, 1440);
    await login(page, '9990003');
    await page.waitForFunction(() => document.body.textContent.includes('Test Manager'), { timeout: 5000 });
    await seedFeedCaches(page, '9990003', { leadflow: null, learning: null, retail: testSummaryFor('9990003', 'manager', 'this-month') }, 'this-month');
    await page.reload({ waitUntil: 'networkidle0' });
    await page.waitForFunction(() => document.body.textContent.includes('৳38,000'), { timeout: 5000 });
    const widget = await page.evaluate(() => {
      const el = document.querySelector(
        'section[aria-label="বকেয়া প্রিমিয়াম"], section[aria-label="Due premiums"]',
      );
      return el ? el.textContent : '';
    });
    check(
      'due widget (manager, seeded): MTD totals 5 policies + ৳38,000',
      widget.includes('5 policies') && widget.includes('৳38,000'),
      widget.slice(0, 200),
    );
    check(
      'due widget (manager, seeded): two columns — Overdue 10 Oct ৳3,000, 10 Nov ৳5,000, 12 Nov ৳4,000; Upcoming 20 Nov ৳8,000, 5 Dec ৳6,000, 8 Dec ৳2,000',
      widget.includes('Upcoming dues') &&
        widget.includes('Overdue') &&
        widget.includes('10 Oct 2026') && widget.includes('10 Nov 2026') && widget.includes('12 Nov 2026') &&
        widget.includes('20 Nov 2026') && widget.includes('5 Dec 2026') && widget.includes('8 Dec 2026') &&
        widget.includes('৳3,000') && widget.includes('৳5,000') && widget.includes('৳4,000') &&
        widget.includes('৳8,000') && widget.includes('৳6,000') && widget.includes('৳2,000'),
      widget.slice(0, 500),
    );
    check(
      'due widget (manager, seeded): no demo text, no DEMO- rows',
      !/demo|ডেমো/i.test(widget) && !widget.includes('DEMO-'),
      widget.slice(0, 120),
    );
    await ctx.close();
  }
  {
    // One column empty: the empty column shows its honest empty
    // state, the other column still shows its rows.
    const { ctx, page } = await newPage(browser, 1440);
    await login(page, '9990003');
    await page.waitForFunction(() => document.body.textContent.includes('Test Manager'), { timeout: 5000 });
    const oneColumn = testSummaryFor('9990003', 'manager', 'this-month');
    oneColumn.dueRowsOverdue = [];
    await seedFeedCaches(page, '9990003', { leadflow: null, learning: null, retail: oneColumn }, 'this-month');
    await page.reload({ waitUntil: 'networkidle0' });
    await page.waitForFunction(() => document.body.textContent.includes('৳38,000'), { timeout: 5000 });
    const widget = await page.evaluate(() => {
      const el = document.querySelector(
        'section[aria-label="বকেয়া প্রিমিয়াম"], section[aria-label="Due premiums"]',
      );
      return el ? el.textContent : '';
    });
    check(
      'due widget (one column empty): Overdue column says "No overdue premiums", Upcoming still shows rows',
      widget.includes('No overdue premiums') && widget.includes('Upcoming dues') && widget.includes('20 Nov 2026') && widget.includes('৳8,000'),
      widget.slice(0, 400),
    );
    await ctx.close();
  }
  {
    const { ctx, page } = await newPage(browser, 1440);
    await login(page, '9990004');
    await page.waitForFunction(() => document.body.textContent.includes('Test Admin'), { timeout: 5000 });
    const emptySummary = testSummaryFor('9990004', 'admin', 'this-month');
    emptySummary.empty = true;
    emptySummary.emptyReason = 'no-code';
    emptySummary.duePolicies = 0;
    emptySummary.duePremium = 0;
    emptySummary.dueRowsOverdue = [];
    emptySummary.dueRowsUpcoming = [];
    await seedFeedCaches(page, '9990004', { leadflow: null, learning: null, retail: emptySummary }, 'this-month');
    await page.reload({ waitUntil: 'networkidle0' });
    await page.waitForFunction(
      () =>
        document.body.textContent.includes('No premiums due this month') ||
        document.body.textContent.includes('এই মাসে কোনো প্রিমিয়াম বকেয়া নেই'),
      { timeout: 5000 },
    );
    const adminWidget = await page.evaluate(() => {
      const el = document.querySelector(
        'section[aria-label="বকেয়া প্রিমিয়াম"], section[aria-label="Due premiums"]',
      );
      return el ? el.textContent : '';
    });
    check(
      'due widget (admin, empty): empty state says so plainly',
      adminWidget.includes('এই মাসে কোনো প্রিমিয়াম বকেয়া নেই') ||
        adminWidget.includes('No premiums due this month'),
      adminWidget.slice(0, 120),
    );
    check('due widget (admin, empty): no demo text', !/demo|ডেমো/i.test(adminWidget), adminWidget.slice(0, 120));
    await ctx.close();
  }

  // ---- 11 + 12. RS256 verification + negative cases (local QA only) ----
  // The negative cases run against the app's REAL verifySsoToken, bundled
  // for Node via esbuild — not a re-implementation.
  if (LOCAL_QA) {
    const b64urlJson = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
    const signRs256 = (header, payload) => {
      const input = `${b64urlJson(header)}.${b64urlJson(payload)}`;
      return `${input}.${crypto.sign('sha256', Buffer.from(input), privateKeyObj).toString('base64url')}`;
    };
    const nowSec = () => Math.floor(Date.now() / 1000);
    const basePayload = {
      sub: '9990002',
      name: 'Test Team Lead',
      role: 'team_lead',
      iat: nowSec(),
      exp: nowSec() + 3600,
      iss: 'shanta-life-agent-hub',
    };
    const baseHeader = { alg: 'RS256', typ: 'JWT', kid };
    const knownKids = new Set([kid]);

    if (issuedToken) {
      const { header } = decodeJwt(issuedToken);
      check(
        'rs256: issued token header is RS256 + expected kid',
        header.alg === 'RS256' && header.typ === 'JWT' && header.kid === kid,
        JSON.stringify(header),
      );
      const [h, p, s] = issuedToken.split('.');
      const sigOk = crypto.verify('sha256', Buffer.from(`${h}.${p}`), publicKeyObj, Buffer.from(s, 'base64url'));
      check('rs256: node:crypto verifies the issued token signature', sigOk);
      const claims = await jwtNode.verifySsoToken(issuedToken, publicPem, knownKids);
      check(
        'rs256: verifySsoToken accepts the issued token',
        claims?.sub === '9990002' && claims?.role === 'team_lead',
        claims ? JSON.stringify(claims) : 'null',
      );
      // Tampered payload: same signature, changed claim — valid JSON, bad signature.
      const tamperedPayload = { ...decodeJwt(issuedToken).payload, name: 'Tampered Name' };
      const tampered = `${h}.${b64urlJson(tamperedPayload)}.${s}`;
      check('reject: tampered payload', (await jwtNode.verifySsoToken(tampered, publicPem, knownKids)) === null);
    } else {
      check('rs256: issued token header is RS256 + expected kid', false, 'no issued token captured (login failed?)');
      check('rs256: node:crypto verifies the issued token signature', false, 'no issued token captured');
      check('rs256: verifySsoToken accepts the issued token', false, 'no issued token captured');
      check('reject: tampered payload', false, 'no issued token captured');
    }

    // Round-trip through the bundled jwt.ts (independent of the login token).
    const roundTrip = await jwtNode.signSsoToken(
      { sub: '9990002', name: 'Test Team Lead', role: 'team_lead' },
      privateB64,
    );
    const rtHeader = decodeJwt(roundTrip).header;
    const rtClaims = await jwtNode.verifySsoToken(roundTrip, publicPem, new Set([rtHeader.kid]));
    check(
      'rs256: sign+verify round-trip through the bundled jwt.ts',
      rtClaims?.sub === '9990002' && rtClaims?.role === 'team_lead',
      rtClaims ? JSON.stringify(rtClaims) : 'null',
    );

    // Remaining negative cases: validly signed with node:crypto, one defect each.
    const neg = [
      ['reject: expired token', signRs256(baseHeader, { ...basePayload, iat: nowSec() - 7200, exp: nowSec() - 3600 })],
      ['reject: wrong iss', signRs256(baseHeader, { ...basePayload, iss: 'evil-hub' })],
      ['reject: alg none', `${b64urlJson({ alg: 'none', typ: 'JWT', kid })}.${b64urlJson(basePayload)}.`],
      [
        'reject: alg HS256',
        (() => {
          const input = `${b64urlJson({ alg: 'HS256', typ: 'JWT', kid })}.${b64urlJson(basePayload)}`;
          const mac = crypto.createHmac('sha256', 'whatever-secret').update(input).digest('base64url');
          return `${input}.${mac}`;
        })(),
      ],
      ['reject: unknown kid', signRs256({ ...baseHeader, kid: '0000000000000000' }, basePayload)],
      ['reject: empty sub', signRs256(baseHeader, { ...basePayload, sub: '' })],
      ['reject: role outside the four values', signRs256(baseHeader, { ...basePayload, role: 'superuser' })],
    ];
    for (const [name, token] of neg) {
      check(name, (await jwtNode.verifySsoToken(token, publicPem, knownKids)) === null);
    }
  }

  // ---- 13 + 14. Tile wiring + handoff end-to-end (local QA only) ----
  if (LOCAL_QA) {
    const { ctx, page, errors } = await newPage(browser, 1440);
    try {
      await login(page, '9990002');
      await page.waitForFunction(() => document.body.textContent.includes('Test Team Lead'), { timeout: 5000 });

      // 14. Tile wiring (read-only — no live navigation).
      const wiring = await page.evaluate(() => {
        const names = ['LeadFlow', 'Learning Hub', 'PremiumPulse', 'SDPP Projection', 'Income Calculator', 'Retail Sales Dashboard', 'Proposals'];
        return [...document.querySelectorAll('h3')]
          .filter((h) => names.includes(h.textContent))
          .map((h) => {
            const tile = h.closest('a,button,div');
            return {
              name: h.textContent,
              tag: tile ? tile.tagName : null,
              href: tile && tile.tagName === 'A' ? tile.getAttribute('href') : null,
              target: tile && tile.tagName === 'A' ? tile.getAttribute('target') : null,
            };
          });
      });
      // Never log a token: redact the fragment JWT from the wiring detail.
      const wiringSummary = JSON.stringify(wiring, (_k, v) =>
        typeof v === 'string' && v.includes('#hub-token=')
          ? `${v.split('#hub-token=')[0]}#hub-token=<jwt>`
          : v,
      );
      const joinedOk = ['PremiumPulse', 'SDPP Projection', 'Income Calculator'].every((n) => {
        const w = wiring.find((x) => x.name === n);
        return w?.tag === 'A' && typeof w.href === 'string' && w.href.includes('#hub-token=') && !w.target;
      });
      check('tiles: ssoJoined modules render as same-tab links carrying #hub-token=', joinedOk, wiringSummary);
      const plainOk =
        wiring.find((w) => w.name === 'LeadFlow')?.tag === 'A' &&
        wiring.find((w) => w.name === 'LeadFlow')?.href === 'https://lead-flow-jet.vercel.app' &&
        !wiring.find((w) => w.name === 'LeadFlow')?.target &&
        wiring.find((w) => w.name === 'Learning Hub')?.tag === 'A' &&
        wiring.find((w) => w.name === 'Learning Hub')?.href === 'https://shanta-life-learning-hub.vercel.app' &&
        !wiring.find((w) => w.name === 'Learning Hub')?.target &&
        wiring.find((w) => w.name === 'Retail Sales Dashboard')?.tag === 'A' &&
        wiring.find((w) => w.name === 'Retail Sales Dashboard')?.href === 'https://retail-dashboard-zeta.vercel.app' &&
        !wiring.find((w) => w.name === 'Retail Sales Dashboard')?.target;
      check('tiles: non-joined modules render as plain same-tab links (no target)', !!plainOk, wiringSummary);

      // 13. Handoff end-to-end against the local stub module (no live URLs).
      // Same-tab: clicking the tile navigates THIS page to the stub, and
      // Back to Hub navigates it back. Console errors are counted only
      // from the moment the tile is clicked (the Hub page itself may
      // already have logged before that). failHandoff only records checks
      // not already recorded, so a mid-flow throw never double-counts.
      const HANDOFF_CHECK_NAMES = [
        'handoff: tile href carries a valid token in #hub-token=',
        'handoff: stub module reports a valid hub session',
        'handoff: stub shows hub header + user chip',
        'handoff: fragment stripped from the stub URL',
        'handoff: stub page has no console errors',
        'handoff: Back to Hub returns to the signed-in Hub',
        'handoff: re-entering the tile restores the hub session',
        'handoff: expired token clears the module session',
      ];
      const doneHandoffChecks = new Set();
      const handoffCheck = (name, ok, detail = '') => {
        doneHandoffChecks.add(name);
        check(name, ok, detail);
      };
      const failHandoff = (reason) => {
        for (const name of HANDOFF_CHECK_NAMES) {
          if (!doneHandoffChecks.has(name)) check(name, false, reason);
        }
      };
      const clickTile = () =>
        page.evaluate(() => {
          const a = [...document.querySelectorAll('a')].find(
            (el) => el.querySelector('h3')?.textContent === 'PremiumPulse',
          );
          if (!a) return false;
          a.click();
          return true;
        });
      const waitForStubStatus = async (timeoutMs = 15000) => {
        try {
          await page.waitForFunction(
            () => {
              const t = document.getElementById('stub-status')?.textContent ?? '';
              return t.startsWith('hub-session-ok') || t === 'hub-session-invalid' || t === 'hub-session-expired';
            },
            { timeout: timeoutMs },
          );
        } catch {
          /* fall through to read the status */
        }
        return page.$eval('#stub-status', (el) => el.textContent).catch(() => '(status unreadable)');
      };

      const tileHref = wiring.find((w) => w.name === 'PremiumPulse')?.href ?? '';
      const fragmentToken = tileHref.includes('#hub-token=') ? tileHref.split('#hub-token=')[1] : '';
      let tokenClaims = null;
      if (fragmentToken) {
        try {
          tokenClaims = await jwtNode.verifySsoToken(fragmentToken, publicPem, new Set([kid]));
        } catch {
          tokenClaims = null;
        }
      }
      handoffCheck(
        'handoff: tile href carries a valid token in #hub-token=',
        tokenClaims?.sub === '9990002' && tokenClaims?.role === 'team_lead',
        tokenClaims ? JSON.stringify(tokenClaims) : 'no verifiable token in href',
      );
      if (!fragmentToken) {
        failHandoff('tile href has no fragment token');
      } else {
        try {
          const errorsBeforeClick = errors.length;
          if (!(await clickTile())) throw new Error('PremiumPulse tile link not found');
          const status = await waitForStubStatus();
          handoffCheck(
            'handoff: stub module reports a valid hub session',
            status.startsWith('hub-session-ok') && status.includes('sub=9990002') && status.includes('role=team_lead'),
            status,
          );
          const hubHeader = await page
            .evaluate(
              () =>
                document.getElementById('hub-header')?.classList.contains('visible') &&
                (document.getElementById('user-chip')?.textContent ?? '').includes('Test Team Lead'),
            )
            .catch(() => false);
          handoffCheck('handoff: stub shows hub header + user chip', !!hubHeader, status);
          const hashAfter = await page.evaluate(() => window.location.hash).catch(() => '(unreadable)');
          handoffCheck('handoff: fragment stripped from the stub URL', hashAfter === '', `hash=${hashAfter}`);
          const stubErrors = errors.slice(errorsBeforeClick);
          handoffCheck('handoff: stub page has no console errors', stubErrors.length === 0, stubErrors.join(' | '));

          // Back to Hub: same-tab navigation back to the Hub home, still signed in.
          await page.evaluate(() => document.getElementById('back-to-hub')?.click());
          await page.waitForFunction(() => document.body.textContent.includes('Test Team Lead'), { timeout: 10000 });
          const tokenAfterBack = await getToken(page);
          handoffCheck('handoff: Back to Hub returns to the signed-in Hub', tokenAfterBack !== null);

          // Re-enter the tile: the stub must reach hub mode again.
          if (!(await clickTile())) throw new Error('PremiumPulse tile link not found on re-entry');
          const status2 = await waitForStubStatus();
          handoffCheck(
            'handoff: re-entering the tile restores the hub session',
            status2.startsWith('hub-session-ok') && status2.includes('sub=9990002'),
            status2,
          );

          // Expiry (same-tab has NO cross-window sign-out broadcast — a
          // module session ends at token expiry, by design): rewrite the
          // stored session's expiry to the past and trigger the stub's
          // visibility-change re-check; the session must clear + banner show.
          await page.evaluate(() => {
            const key = 'premiumpulse-hub-session';
            const sess = JSON.parse(sessionStorage.getItem(key));
            sess.exp = Math.floor(Date.now() / 1000) - 3600;
            sessionStorage.setItem(key, JSON.stringify(sess));
            document.dispatchEvent(new Event('visibilitychange'));
          });
          let expiredStatus = '(status unreadable)';
          try {
            await page.waitForFunction(
              () => document.getElementById('stub-status')?.textContent === 'hub-session-expired',
              { timeout: 5000 },
            );
            expiredStatus = await page.$eval('#stub-status', (el) => el.textContent);
          } catch {
            expiredStatus = await page.$eval('#stub-status', (el) => el.textContent).catch(() => '(status unreadable)');
          }
          const bannerAfterExpiry = await page
            .evaluate(() => document.getElementById('banner')?.classList.contains('visible'))
            .catch(() => false);
          const sessionAfterExpiry = await page
            .evaluate(() => sessionStorage.getItem('premiumpulse-hub-session'))
            .catch(() => '(unreadable)');
          handoffCheck(
            'handoff: expired token clears the module session',
            expiredStatus === 'hub-session-expired' && bannerAfterExpiry && sessionAfterExpiry === null,
            `${expiredStatus} banner=${bannerAfterExpiry} session=${sessionAfterExpiry}`,
          );
        } catch (e) {
          failHandoff(`handoff threw: ${String(e).slice(0, 200)}`);
        }
      }
} finally {
      await ctx.close();
    }
  }

  // ---- 15. Production-target guard (local QA only) ----
  // The old demo-auth guard test is gone with the demo code:
  // vite.config.ts no longer checks VITE_DEMO_AUTH at all (there is
  // no demo auth to guard). The guard that remains is the signing-key
  // guard — a production build must never ship a signing key — plus
  // the production key-pair checks and the clean-build fail-closed
  // login check.
  if (LOCAL_QA) {
    const failSigning = runBuild(ROOT, {
      ...process.env,
      HUB_BUILD_TARGET: 'production',
      VITE_JWT_PRIVATE_KEY_B64: privateB64,
    });
    check(
      'guard: production build with signing key FAILS',
      failSigning.status !== 0 && /signing variable/.test(failSigning.output),
      `exit=${failSigning.status}`,
    );

    // Clean production build in a temp copy (no .env — fresh-clone shape) +
    // fail-closed login check against it. The production-key guard checks
    // run in the temp copy too: a SUCCEEDING production build must never
    // overwrite the QA build's dist in ROOT (later sections need it).
    prodTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-qa-prod-'));
    fs.cpSync(ROOT, prodTmp, {
      recursive: true,
      filter: (src) => {
        const rel = path.relative(ROOT, src);
        if (!rel) return true;
        const top = rel.split(path.sep)[0];
        return !['node_modules', 'dist', '.git', 'qa', '.env', 'scripts', 'supabase', 'docs', 'tsconfig.tsbuildinfo'].includes(top);
      },
    });
    fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(prodTmp, 'node_modules'), 'dir');
    const prodEnv = { ...process.env };
    for (const k of Object.keys(prodEnv)) {
      if (k.startsWith('VITE_') || k.startsWith('HUB_')) delete prodEnv[k];
    }
    prodEnv.HUB_BUILD_TARGET = 'production';

    // Production-key guard (real auth): a production signing key without
    // its matching public-key config, or a kid that does not match the
    // public key, must FAIL — otherwise hub-auth signs with a key nothing
    // verifies against. A matching pair must SUCCEED.
    const failKeyPair = runBuild(prodTmp, {
      ...prodEnv,
      HUB_JWT_PRIVATE_KEY_B64: privateB64,
    });
    check(
      'guard: production signing key without public-key config FAILS',
      failKeyPair.status !== 0 && /HUB_PUBLIC_KEY_PEM/.test(failKeyPair.output),
      `exit=${failKeyPair.status}`,
    );
    const failKidMismatch = runBuild(prodTmp, {
      ...prodEnv,
      HUB_JWT_PRIVATE_KEY_B64: privateB64,
      HUB_PUBLIC_KEY_PEM: publicPem,
      HUB_KID: '0000000000000000',
    });
    check(
      'guard: HUB_KID not matching HUB_PUBLIC_KEY_PEM FAILS',
      failKidMismatch.status !== 0 && /does not match/.test(failKidMismatch.output),
      `exit=${failKidMismatch.status}`,
    );
    const okKeyPair = runBuild(prodTmp, {
      ...prodEnv,
      HUB_JWT_PRIVATE_KEY_B64: privateB64,
      HUB_PUBLIC_KEY_PEM: publicPem,
      HUB_KID: kid,
    });
    check(
      'guard: production signing key + matching public key + kid SUCCEEDS',
      okKeyPair.status === 0,
      okKeyPair.status === 0 ? '' : okKeyPair.output.slice(-400),
    );
    const prodBuild = runBuild(prodTmp, prodEnv);
    check('production build: clean build succeeds', prodBuild.status === 0, prodBuild.status === 0 ? '' : prodBuild.output.slice(-400));
    if (prodBuild.status === 0) {
      const prodBase = `file://${path.join(prodTmp, 'dist', 'index.html')}`;
      const { ctx, page } = await newPage(browser, 1440);
      await page.goto(prodBase, { waitUntil: 'networkidle0' });
      const testIdShown = await page.evaluate(() => document.body.textContent.includes('9990001'));
      check('production build: no test IDs shown', !testIdShown);
      await page.type('#employee-id', '9990002');
      await page.type('#pin', '123456');
      await page.click('button[type="submit"]');
      let alert = '(no alert shown)';
      try {
        await page.waitForFunction(() => document.querySelector('[role="alert"]'), { timeout: 5000 });
        alert = await page.$eval('[role="alert"]', (el) => el.textContent);
      } catch {
        /* alert stays '(no alert shown)' */
      }
      const prodToken = await page.evaluate(() => sessionStorage.getItem('hub-session-token'));
      check(
        'production build: sign-in fails closed (not configured)',
        /কনফিগার করা হয়নি|not configured/i.test(alert) && prodToken === null,
        alert,
      );
      await ctx.close();
    } else {
      check('production build: no test IDs shown', false, 'production build failed');
      check('production build: sign-in fails closed (not configured)', false, 'production build failed');
    }
  }

  // ---- 16. Tile icons (local QA only) ----
  // This Chrome build has no external network, so the three LIVE icons
  // (PremiumPulse, SDPP, Income) cannot load here. Request interception
  // holds their requests so the <img> src can be read from the DOM, then
  // aborts them so the onError fallback (monogram) can be verified. Live
  // rendering of the remote icons is verified post-push with a browser
  // task. Local icons (LeadFlow, Learning Hub, Retail Dashboard) load
  // from file:// and are checked for real pixels.
  if (LOCAL_QA) {
    const LIVE_ICON_URLS = [
      'https://premium-illustrator.vercel.app/icon.svg',
      'https://sdpp-value-projection.vercel.app/icon.svg',
      'https://incomecalculator-delta.vercel.app/icon.svg',
    ];
    const EXPECTED_ICON_SRC = {
      LeadFlow: 'icons/modules/leadflow.svg',
      'Learning Hub': 'icons/modules/learning-hub.svg',
      PremiumPulse: 'https://premium-illustrator.vercel.app/icon.svg',
      'SDPP Projection': 'https://sdpp-value-projection.vercel.app/icon.svg',
      'Income Calculator': 'https://incomecalculator-delta.vercel.app/icon.svg',
      'Retail Sales Dashboard': 'icons/modules/retail-dashboard.svg',
    };
    const TILE_NAMES = [...Object.keys(EXPECTED_ICON_SRC), 'Proposals'];
    const { ctx, page } = await newPage(browser, 1440);
    const heldRequests = [];
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      if (LIVE_ICON_URLS.includes(req.url())) {
        heldRequests.push(req); // hold: answer later, after the src is read
      } else {
        void req.continue();
      }
    });
    try {
      await login(page, '9990002');
      await page.waitForFunction(() => document.body.textContent.includes('Test Team Lead'), { timeout: 5000 });
      await page.waitForFunction(
        (names) => names.every((n) => [...document.querySelectorAll('h3')].some((h) => h.textContent === n)),
        { timeout: 5000 },
        TILE_NAMES,
      );
      // Local icons must have finished loading before the read.
      await page.waitForFunction(
        () => {
          const names = ['LeadFlow', 'Learning Hub', 'Retail Sales Dashboard'];
          return names.every((n) => {
            const h = [...document.querySelectorAll('h3')].find((x) => x.textContent === n);
            const img = h?.closest('a,button,div')?.querySelector('img');
            return img && img.complete && img.naturalWidth > 0;
          });
        },
        { timeout: 5000 },
      );
      const readTileIcons = () =>
        page.evaluate((names) => {
          return [...document.querySelectorAll('h3')]
            .filter((h) => names.includes(h.textContent))
            .map((h) => {
              const tile = h.closest('a,button,div');
              const img = tile ? tile.querySelector('img') : null;
              const mark = tile ? tile.querySelector('span[aria-hidden]') : null;
              return {
                name: h.textContent,
                imgSrc: img ? img.getAttribute('src') : null,
                imgLoaded: img ? img.complete && img.naturalWidth > 0 : false,
                markText: mark ? mark.textContent : null,
              };
            });
        }, TILE_NAMES);
      const before = await readTileIcons();
      const liveOk = ['PremiumPulse', 'SDPP Projection', 'Income Calculator'].every(
        (n) => before.find((x) => x.name === n)?.imgSrc === EXPECTED_ICON_SRC[n],
      );
      check('tiles: live icons render as <img> with the expected src', liveOk, JSON.stringify(before.map((b) => [b.name, b.imgSrc])));
      const localOk = ['LeadFlow', 'Learning Hub', 'Retail Sales Dashboard'].every(
        (n) => before.find((x) => x.name === n)?.imgSrc === EXPECTED_ICON_SRC[n],
      );
      check('tiles: local icons render as <img> with the expected src', localOk, JSON.stringify(before.map((b) => [b.name, b.imgSrc])));
      const localLoaded = ['LeadFlow', 'Learning Hub', 'Retail Sales Dashboard'].every(
        (n) => before.find((x) => x.name === n)?.imgLoaded === true,
      );
      check('tiles: local icons actually load (naturalWidth > 0)', localLoaded, JSON.stringify(before.map((b) => [b.name, b.imgLoaded])));
      const proposalsTile = before.find((x) => x.name === 'Proposals');
      check('tiles: Proposals keeps the monogram (no img)', proposalsTile?.imgSrc === null && proposalsTile?.markText === 'PR', JSON.stringify(proposalsTile));

      // Release the held live-icon requests as failures: the tiles must
      // fall back to their monograms, never a broken image.
      for (const req of heldRequests) await req.abort().catch(() => {});
      await page.waitForFunction(
        (names) => names.every((n) => {
          const h = [...document.querySelectorAll('h3')].find((x) => x.textContent === n);
          const tile = h?.closest('a,button,div');
          return tile && !tile.querySelector('img') && tile.querySelector('span[aria-hidden]');
        }),
        { timeout: 5000 },
        ['PremiumPulse', 'SDPP Projection', 'Income Calculator'],
      ).catch(() => {});
      const after = await readTileIcons();
      const fallbackOk = [
        ['PremiumPulse', 'PP'],
        ['SDPP Projection', 'SP'],
        ['Income Calculator', 'IC'],
      ].every(([n, mark]) => {
        const t = after.find((x) => x.name === n);
        return t?.imgSrc === null && t?.markText === mark;
      });
      check('tiles: failed live icon falls back to the monogram', fallbackOk, JSON.stringify(after.map((b) => [b.name, b.imgSrc, b.markText])));

      // Runtime onError check: break one local icon and watch the monogram appear.
      await page.evaluate(() => {
        const h = [...document.querySelectorAll('h3')].find((x) => x.textContent === 'LeadFlow');
        const img = h?.closest('a,button,div')?.querySelector('img');
        if (img) img.src = 'icons/modules/does-not-exist.svg';
      });
      await page.waitForFunction(() => {
        const h = [...document.querySelectorAll('h3')].find((x) => x.textContent === 'LeadFlow');
        const tile = h?.closest('a,button,div');
        return tile && !tile.querySelector('img') && tile.querySelector('span[aria-hidden]')?.textContent === 'LF';
      }, { timeout: 5000 }).catch(() => {});
      const leadflowAfter = await page.evaluate(() => {
        const h = [...document.querySelectorAll('h3')].find((x) => x.textContent === 'LeadFlow');
        const tile = h?.closest('a,button,div');
        return { hasImg: !!tile?.querySelector('img'), mark: tile?.querySelector('span[aria-hidden]')?.textContent ?? null };
      });
      check('tiles: icon onError falls back to the monogram (runtime swap)', leadflowAfter.hasImg === false && leadflowAfter.mark === 'LF', JSON.stringify(leadflowAfter));
    } finally {
      await ctx.close();
    }
  }

  // ---- 19. Instant-open: preconnect + intent prefetch (local QA only) ----
  // Preconnects live in index.html; the prefetch link is added to <head>
  // on tile hover. The prefetch fetch itself fails in this VM (no
  // external network) — what matters is that the <link> is created with
  // the right href, once, and never carries the SSO token fragment.
  if (LOCAL_QA) {
    const MODULE_ORIGINS = [
      'https://lead-flow-jet.vercel.app',
      'https://shanta-life-learning-hub.vercel.app',
      'https://premium-illustrator.vercel.app',
      'https://sdpp-value-projection.vercel.app',
      'https://incomecalculator-delta.vercel.app',
      'https://retail-dashboard-zeta.vercel.app',
    ];
    const { ctx, page } = await newPage(browser, 1440);
    try {
      await login(page, '9990002');
      await page.waitForFunction(() => document.body.textContent.includes('Test Team Lead'), { timeout: 5000 });
      const headLinks = await page.evaluate(() => ({
        preconnect: [...document.querySelectorAll('link[rel="preconnect"]')].map((l) => l.getAttribute('href')),
        dnsPrefetch: [...document.querySelectorAll('link[rel="dns-prefetch"]')].map((l) => l.getAttribute('href')),
        prerender: [...document.querySelectorAll('link[rel="prerender"]')].map((l) => l.getAttribute('href')),
      }));
      check(
        'instant-open: preconnect for all 6 module origins',
        MODULE_ORIGINS.every((o) => headLinks.preconnect.includes(o)),
        JSON.stringify(headLinks.preconnect),
      );
      check(
        'instant-open: dns-prefetch for all 6 module origins',
        MODULE_ORIGINS.every((o) => headLinks.dnsPrefetch.includes(o)),
        JSON.stringify(headLinks.dnsPrefetch),
      );
      check('instant-open: no prerender links anywhere', headLinks.prerender.length === 0, JSON.stringify(headLinks.prerender));
      const hoverTile = async (name) => {
        const box = await page.evaluate((n) => {
          const h = [...document.querySelectorAll('h3')].find((x) => x.textContent === n);
          const tile = h?.closest('a');
          if (!tile) return null;
          tile.scrollIntoView({ block: 'center' });
          const r = tile.getBoundingClientRect();
          return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
        }, name);
        if (!box) return false;
        await page.mouse.move(box.x, box.y);
        await new Promise((r) => setTimeout(r, 200));
        return true;
      };
      const prefetchHrefs = () =>
        page.evaluate(() =>
          [...document.querySelectorAll('link[rel="prefetch"]')].map((l) => l.getAttribute('href')),
        );
      check('instant-open: hover finds the LeadFlow tile', await hoverTile('LeadFlow'));
      const afterFirst = await prefetchHrefs();
      check(
        'instant-open: hovering a tile adds a prefetch link for its document',
        afterFirst.some((h) => h.startsWith('https://lead-flow-jet.vercel.app')),
        JSON.stringify(afterFirst),
      );
      await page.mouse.move(10, 10);
      await hoverTile('LeadFlow');
      const afterSecond = await prefetchHrefs();
      check(
        'instant-open: hovering twice adds only one prefetch link (dedup)',
        afterSecond.filter((h) => h.startsWith('https://lead-flow-jet.vercel.app')).length === 1,
        JSON.stringify(afterSecond),
      );
      // The joined tile's href carries #hub-token=<jwt> — the prefetch
      // must be the module's BASE url with no fragment at all. The QA
      // build overrides PremiumPulse's URL to the local stub module, so
      // the new prefetch href is found by diffing before/after the hover
      // rather than by matching the production URL.
      const beforeJoined = await prefetchHrefs();
      check('instant-open: hover finds the PremiumPulse tile', await hoverTile('PremiumPulse'));
      const afterJoined = await prefetchHrefs();
      const ppPrefetch = afterJoined.find((h) => !beforeJoined.includes(h));
      check(
        'instant-open: prefetch URL carries no SSO token fragment',
        !!ppPrefetch && !ppPrefetch.includes('#hub-token=') && !ppPrefetch.includes('#'),
        JSON.stringify(afterJoined),
      );
    } finally {
      await ctx.close();
    }
  }

  // ---- 20. Home quick-actions + Leads/Learning data pages ----
  // Home (Mahadi 2026-11-20): one flat quick-action grid under "Your
  // tools" — no group sections. Leads/Learning pages with NO seeded
  // cache and no proxy under file://: the summary strip shows the
  // error state + retry — never fixture figures (the demo summary
  // strip is gone with the demo code). The seeded live ready states
  // are covered in §21b/§21c. Calculators/Proposals pages: unchanged.
  {
    const { ctx, page } = await newPage(browser, 1440);
    await login(page, '9990002');
    await page.waitForFunction(() => document.body.textContent.includes('Test Team Lead'), { timeout: 5000 });
    // Home quick-actions.
    const toolsSection = await page.evaluate(() => {
      const section = document.querySelector('section[aria-label="Your tools"], section[aria-label="আপনার টুলস"]');
      if (!section) return null;
      const h3s = [...section.querySelectorAll('h3')];
      return {
        names: h3s.map((h) => h.textContent),
        uppercaseHeadings: h3s.filter((h) => h.className.includes('uppercase')).map((h) => h.textContent),
        text: section.textContent,
        hasDisabledProposals: !!section.querySelector('div[aria-disabled="true"]'),
      };
    });
    const QUICK_NAMES = ['LeadFlow', 'Learning Hub', 'PremiumPulse', 'SDPP Projection', 'Income Calculator', 'Retail Sales Dashboard', 'Proposals'];
    check(
      'home quick-actions: no group headings, exactly 7 tiles',
      !!toolsSection &&
        toolsSection.names.length === 7 &&
        QUICK_NAMES.every((n) => toolsSection.names.includes(n)) &&
        toolsSection.uppercaseHeadings.length === 0,
      JSON.stringify(toolsSection && { names: toolsSection.names, uppercase: toolsSection.uppercaseHeadings }),
    );
    check(
      'home quick-actions: icon + name only, no descriptions',
      !!toolsSection &&
        !toolsSection.text.includes('Leads, follow-ups, reminders and Lead360.') &&
        !toolsSection.text.includes('Courses, quizzes and certificates.') &&
        !toolsSection.text.includes('Opens in this tab'),
      toolsSection ? toolsSection.text.slice(0, 160) : 'no tools section',
    );
    check(
      'home quick-actions: disabled Proposals present with Coming soon',
      !!toolsSection && toolsSection.hasDisabledProposals && toolsSection.text.includes('Coming soon'),
      toolsSection ? toolsSection.text.slice(0, 160) : 'no tools section',
    );

    // Stat values inside the Summary strip: the error state shows no
    // stat values at all (zero p.text-2xl elements).
    const stripStatCount = () =>
      page.evaluate(() => {
        const section = document.querySelector('section[aria-label="Summary"], section[aria-label="সারসংক্ষেপ"]');
        return section ? section.querySelectorAll('p.text-2xl').length : -1;
      });
    const goButton = (en, bn) =>
      page.evaluate(([e, b]) => {
        const a = [...document.querySelectorAll('a')].find(
          (el) => el.textContent.includes(e) || el.textContent.includes(b),
        );
        return a ? { href: a.getAttribute('href'), target: a.getAttribute('target') } : null;
      }, [en, bn]);
    const hasTileNamed = (name) =>
      page.evaluate(
        (n) => [...document.querySelectorAll('h3')].some((h) => h.textContent === n),
        name,
      );
    const summaryInfo = () =>
      page.evaluate(() => {
        const section = document.querySelector('section[aria-label="Summary"], section[aria-label="সারসংক্ষেপ"]');
        return section ? section.textContent : null;
      });

    // Leads page (Team Lead 9990002, no seeded cache): the feed fetch
    // fails under file://, so the strip shows the error state + retry
    // — no figures at all, and certainly no fixture figures.
    await clickNav(page, 'লিডস', 'Leads');
    await page.waitForFunction(() => document.body.textContent.includes('Go to Lead Management') || document.body.textContent.includes('লিড ম্যানেজমেন্টে যান'), { timeout: 5000 });
    await page.waitForFunction(
      () =>
        document.body.textContent.includes('Could not load the data.') ||
        document.body.textContent.includes('ডেটা লোড করা যায়নি।'),
      { timeout: 10000 },
    );
    const leadsSummary = await summaryInfo();
    check(
      'leads page (unloaded): error state + retry, no figures, no demo text',
      !!leadsSummary &&
        leadsSummary.includes('Could not load the data.') &&
        leadsSummary.includes('Try again') &&
        (await stripStatCount()) === 0 &&
        !/demo|ডেমো/i.test(leadsSummary),
      leadsSummary ? leadsSummary.slice(0, 160) : 'no summary strip',
    );
    const leadsGo = await goButton('Go to Lead Management', 'লিড ম্যানেজমেন্টে যান');
    check(
      'leads page: Go button links same-tab to LeadFlow',
      leadsGo?.href === 'https://lead-flow-jet.vercel.app' && !leadsGo.target,
      JSON.stringify(leadsGo),
    );
    check('leads page: no ModuleTile (Go button replaces it)', !(await hasTileNamed('LeadFlow')));

    // Learning page (Team Lead, no seeded cache): same error state.
    await clickNav(page, 'লার্নিং', 'Learning');
    await page.waitForFunction(() => document.body.textContent.includes('Go to Learning') || document.body.textContent.includes('লার্নিং-এ যান'), { timeout: 5000 });
    await page.waitForFunction(
      () =>
        document.body.textContent.includes('Could not load the data.') ||
        document.body.textContent.includes('ডেটা লোড করা যায়নি।'),
      { timeout: 10000 },
    );
    const learningSummary = await summaryInfo();
    check(
      'learning page (unloaded): error state + retry, no figures, no demo text',
      !!learningSummary &&
        learningSummary.includes('Could not load the data.') &&
        learningSummary.includes('Try again') &&
        (await stripStatCount()) === 0 &&
        !/demo|ডেমো/i.test(learningSummary),
      learningSummary ? learningSummary.slice(0, 160) : 'no summary strip',
    );
    const learningGo = await goButton('Go to Learning', 'লার্নিং-এ যান');
    check(
      'learning page: Go button links same-tab to Learning Hub',
      learningGo?.href === 'https://shanta-life-learning-hub.vercel.app' && !learningGo.target,
      JSON.stringify(learningGo),
    );
    check('learning page: no ModuleTile (Go button replaces it)', !(await hasTileNamed('Learning Hub')));

    // Calculators page: unchanged — 3 tiles, no summary, no Go button.
    await clickNav(page, 'ক্যালকুলেটর', 'Calculators');
    await page.waitForFunction(() => document.body.textContent.includes('PremiumPulse'), { timeout: 5000 });
    const calcTiles = await page.evaluate(() =>
      ['PremiumPulse', 'SDPP Projection', 'Income Calculator'].every((n) =>
        [...document.querySelectorAll('h3')].some((h) => h.textContent === n),
      ),
    );
    check('calculators page: unchanged, 3 tiles present', calcTiles);
    check(
      'calculators page: no summary strip, no Go button',
      (await summaryInfo()) === null && !(await goButton('Go to', 'যান')),
      'summary/go must be absent here',
    );

    // Proposals page: unchanged — disabled tile + Coming soon, no
    // summary, no Go button. (The "production portal link" callout
    // note under the title was removed with the other title
    // sentences — the tile itself still says "Link to confirm with
    // IT".)
    await clickNav(page, 'প্রপোজাল', 'Proposals');
    await page.waitForFunction(() => document.body.textContent.includes('Proposals'), { timeout: 5000 });
    const proposalsOk = await page.evaluate(
      () =>
        [...document.querySelectorAll('h3')].some((h) => h.textContent === 'Proposals') &&
        document.body.textContent.includes('Coming soon') &&
        document.body.textContent.includes('Link to confirm with IT'),
    );
    check('proposals page: unchanged, disabled tile + Coming soon', proposalsOk);
    check(
      'proposals page: no summary strip, no Go button',
      (await summaryInfo()) === null && !(await goButton('Go to', 'যান')),
      'summary/go must be absent here',
    );
    // Screenshots of the two new data pages (device gate).
    await clickNav(page, 'লিডস', 'Leads');
    await page.waitForFunction(() => document.body.textContent.includes('Go to Lead Management') || document.body.textContent.includes('লিড ম্যানেজমেন্টে যান'), { timeout: 5000 });
    await new Promise((r) => setTimeout(r, 300));
    await waitForSplashGone(page);
    await page.screenshot({ path: path.join(QA_DIR, 'leads-1440.png'), fullPage: true });
    await clickNav(page, 'লার্নিং', 'Learning');
    await page.waitForFunction(() => document.body.textContent.includes('Go to Learning') || document.body.textContent.includes('লার্নিং-এ যান'), { timeout: 5000 });
    await new Promise((r) => setTimeout(r, 300));
    await waitForSplashGone(page);
    await page.screenshot({ path: path.join(QA_DIR, 'learning-1440.png'), fullPage: true });
    await ctx.close();
  }

  // ---- 20b. Leads/Learning pages at 375 px (device gate) ----
  {
    const { ctx, page } = await newPage(browser, 375);
    await login(page, '9990002');
    await page.waitForFunction(() => document.body.textContent.includes('Test Team Lead'), { timeout: 5000 });
    await clickNav(page, 'লিডস', 'Leads');
    await page.waitForFunction(() => document.body.textContent.includes('Go to Lead Management') || document.body.textContent.includes('লিড ম্যানেজমেন্টে যান'), { timeout: 5000 });
    await new Promise((r) => setTimeout(r, 300));
    const leadsOv = await overflowCheck(page);
    check('screenshot leads-375: no horizontal overflow', !leadsOv.overflow, `scrollWidth=${leadsOv.scrollWidth} innerWidth=${leadsOv.innerWidth}`);
    await waitForSplashGone(page);
    await page.screenshot({ path: path.join(QA_DIR, 'leads-375.png'), fullPage: true });
    await clickNav(page, 'লার্নিং', 'Learning');
    await page.waitForFunction(() => document.body.textContent.includes('Go to Learning') || document.body.textContent.includes('লার্নিং-এ যান'), { timeout: 5000 });
    await new Promise((r) => setTimeout(r, 300));
    const learningOv = await overflowCheck(page);
    check('screenshot learning-375: no horizontal overflow', !learningOv.overflow, `scrollWidth=${learningOv.scrollWidth} innerWidth=${learningOv.innerWidth}`);
    await waitForSplashGone(page);
    await page.screenshot({ path: path.join(QA_DIR, 'learning-375.png'), fullPage: true });
    await ctx.close();
  }

  // ---- 21a. Home live ready state (Team Lead): seeded caches ----
  // Test fixture figures, live rendering: exact card figures,
  // business (this-month FYCP), dues this week with the week range,
  // monthly learning card, Due widget in summary mode with the 3
  // recent dues, team section drops to 2 cards, no team Due widget.
  // No feed chips any more (deleted with the demo code) and no
  // "Live from …" line anywhere. Home loads retail + learning with
  // :this-month and LeadFlow with :all (follow-ups are day-bucketed).
  {
    const { ctx, page, errors } = await newPage(browser, 1440);
    await login(page, '9990002');
    await page.waitForFunction(() => document.body.textContent.includes('Test Team Lead'), { timeout: 5000 });
    await seedFeedCaches(page, '9990002', {
      leadflow: leadflowSummaryFor('9990002', 'team_lead'),
      learning: null,
      retail: null,
    });
    await seedFeedCaches(page, '9990002', {
      leadflow: null,
      learning: learningSummaryFor('9990002', 'team_lead', 'this-month'),
      retail: testSummaryFor('9990002', 'team_lead', 'this-month'),
    }, 'this-month');
    // The Home effect already ran (empty caches) — reload so it re-reads.
    await page.reload({ waitUntil: 'networkidle0' });
    await page.waitForFunction(() => document.body.textContent.includes('৳34,000'), { timeout: 5000 });
    const body = await page.evaluate(() => document.body.textContent);
    check(
      'home live: no feed chips, no demo/live info anywhere',
      !body.includes('LeadFlow · Live') && !body.includes('Learning Hub · Live') && !body.includes('Retail Dashboard · Live') &&
        !body.includes('LeadFlow · Demo') && !body.includes('Learning Hub · Demo') && !body.includes('Retail Dashboard · Demo') &&
        !/demo|ডেমো/i.test(body),
    );
    check('home live: no page-title subtitle', !body.includes('Here is your day at a glance') && !body.includes('Live data from your connected apps.'));
    const cards = await page.evaluate(() => {
      const out = { own: {}, team: {} };
      for (const section of document.querySelectorAll('section[aria-label]')) {
        if (!section.querySelector(':scope > span[aria-hidden].w-1')) continue; // direct child — a parent section (e.g. Your team) must not match via a nested card // WidgetCard only
        const title = section.getAttribute('aria-label');
        const value = section.querySelector('p.text-3xl');
        const sub = value ? value.nextElementSibling : null;
        const empty = section.querySelector('p.text-base');
        const entry = {
          value: value ? value.textContent.trim() : null,
          sub: sub ? sub.textContent.trim() : '',
          emptyText: empty ? empty.textContent.trim() : null,
        };
        const inTeam = !!section.closest('section[aria-label="Your team"], section[aria-label="আপনার টিম"]');
        (inTeam ? out.team : out.own)[title] = entry;
      }
      return out;
    });
    check('home live own: follow-ups 4 (today only)', cards.own["Today's follow-ups"]?.value === '4', JSON.stringify(cards.own));
    check(
      'home live own: dues this week 2, Own + team, Sun 15 – Sat 21 Nov, ৳17,000',
      cards.own['Dues this week']?.value === '2' &&
        cards.own['Dues this week']?.sub.includes('Own + team') &&
        cards.own['Dues this week']?.sub.includes('Sun 15 – Sat 21 Nov') &&
        cards.own['Dues this week']?.sub.includes('2 premiums due') &&
        cards.own['Dues this week']?.sub.includes('৳17,000'),
      JSON.stringify(cards.own['Dues this week']),
    );
    check(
      'home live own: learning this month 0 credits, 1 in progress, 0 completed',
      cards.own['Learning this month']?.value === '0' &&
        cards.own['Learning this month']?.sub.includes('1 in progress') &&
        cards.own['Learning this month']?.sub.includes('0 completed'),
      JSON.stringify(cards.own['Learning this month']),
    );
    check(
      'home live own: business this-month FYCP ৳35,000',
      cards.own["This month's business"]?.value === '৳35,000',
      JSON.stringify(cards.own["This month's business"]),
    );
    // Sales overview (Mahadi 2026-11-20): THIS-MONTH retail figures —
    // Total policy sales 1 and Total FYCP ৳35,000 with the New
    // ৳30,000 · Deferred ৳5,000 sub-text, scoped Own + team.
    check(
      'home live sales: Total policy sales 1, New policies · This month',
      cards.own['Total policy sales']?.value === '1' &&
        cards.own['Total policy sales']?.sub === 'New policies · This month',
      JSON.stringify(cards.own['Total policy sales']),
    );
    check(
      'home live sales: Total FYCP ৳35,000, New ৳30,000 · Deferred ৳5,000',
      cards.own['Total FYCP']?.value === '৳35,000' &&
        cards.own['Total FYCP']?.sub === 'New ৳30,000 · Deferred ৳5,000',
      JSON.stringify(cards.own['Total FYCP']),
    );
    check('home live sales: scope chip Own + team · This month', body.includes('Own + team · This month'));
    check(
      'home live team: 2 cards only (follow-ups 12, learning 45%)',
      Object.keys(cards.team).length === 2 &&
        cards.team["Today's follow-ups"]?.value === '12' &&
        cards.team['Learning in progress']?.value === '45%',
      JSON.stringify(cards.team),
    );
    check('home live team: size 3 team members', body.includes('3 team members'));
    const dueWidgets = await page.evaluate(() =>
      [...document.querySelectorAll('section[aria-label="Due premiums"], section[aria-label="বকেয়া প্রিমিয়াম"]')].map((s) => s.textContent),
    );
    check('home live: exactly one Due widget (team widget omitted)', dueWidgets.length === 1, `sections=${dueWidgets.length}`);
    check(
      'home live due widget: summary mode ৳34,000 + 4 policies + November 2026',
      dueWidgets[0]?.includes('৳34,000') && dueWidgets[0]?.includes('4 policies due') && dueWidgets[0]?.includes('Due in November 2026'),
      dueWidgets[0]?.slice(0, 200),
    );
    check(
      'home live due widget: two columns — Upcoming (20 Nov ৳8,000, 8 Dec ৳2,000, 9 Dec ৳2,500), Overdue (10 Oct ৳3,000, 10 Nov ৳5,000)',
      dueWidgets[0]?.includes('Upcoming dues') &&
        dueWidgets[0]?.includes('Overdue') &&
        dueWidgets[0]?.includes('10 Oct 2026') &&
        dueWidgets[0]?.includes('10 Nov 2026') &&
        dueWidgets[0]?.includes('20 Nov 2026') &&
        dueWidgets[0]?.includes('8 Dec 2026') &&
        dueWidgets[0]?.includes('9 Dec 2026') &&
        dueWidgets[0]?.includes('৳3,000') &&
        dueWidgets[0]?.includes('৳5,000') &&
        dueWidgets[0]?.includes('৳8,000') &&
        dueWidgets[0]?.includes('৳2,000') &&
        dueWidgets[0]?.includes('৳2,500'),
      dueWidgets[0]?.slice(0, 500),
    );
    check(
      'home live due widget: no mobile anywhere in the widget',
      !/mobile|মোবাইল|01[3-9]\d{8}/i.test(dueWidgets[0] ?? ''),
      dueWidgets[0]?.slice(0, 400),
    );
    // Two-column layout at desktop width: Upcoming left, Overdue
    // right, on the same row, no overlap.
    const dueLayout1440 = await page.evaluate(() => {
      const section = document.querySelector('section[aria-label="Due premiums"], section[aria-label="বকেয়া প্রিমিয়াম"]');
      if (!section) return null;
      const heads = [...section.querySelectorAll('h4')].map((h) => {
        const r = h.getBoundingClientRect();
        return { text: h.textContent.trim(), top: r.top, left: r.left, right: r.right, bottom: r.bottom };
      });
      return {
        up: heads.find((h) => h.text === 'Upcoming dues' || h.text === 'আসন্ন বকেয়া') ?? null,
        over: heads.find((h) => h.text === 'Overdue' || h.text === 'মেয়াদোত্তীর্ণ') ?? null,
      };
    });
    check(
      'home live due widget: columns side-by-side at 1440 (Upcoming left, Overdue right)',
      dueLayout1440?.up != null &&
        dueLayout1440?.over != null &&
        Math.abs(dueLayout1440.up.top - dueLayout1440.over.top) <= 2 &&
        dueLayout1440.up.left < dueLayout1440.over.left &&
        dueLayout1440.up.right < dueLayout1440.over.left,
      JSON.stringify(dueLayout1440),
    );
    check(
      'home live due widget: scope + full-dashboard link, no live-note line',
      dueWidgets[0]?.includes('Own + team') &&
        dueWidgets[0]?.includes('Open the full dashboard') &&
        !dueWidgets[0]?.includes('Live from Retail Sales Dashboard'),
      dueWidgets[0]?.slice(0, 200),
    );
    check('home live due widget: no demo text, no DEMO- rows', !/demo|ডেমো/i.test(dueWidgets[0] ?? '') && !dueWidgets[0]?.includes('DEMO-'));
    const ov = await overflowCheck(page);
    check('home live 1440: no horizontal overflow', !ov.overflow, `scrollWidth=${ov.scrollWidth} innerWidth=${ov.innerWidth}`);
    await waitForSplashGone(page);
    await page.screenshot({ path: path.join(QA_DIR, 'home-live-1440.png'), fullPage: true });
    const appErrors = errors.filter((e) => !e.startsWith('Failed to load resource'));
    check('home live: no console errors', appErrors.length === 0, appErrors.join(' | '));
    await ctx.close();
  }

  // ---- 21b. Leads page live ready state (Team Lead) ----
  // The Leads page defaults to Today now, so the leadflow summary is
  // seeded at :today (the snapshot assertions below are
  // period-independent); the retail dues feed stays :all.
  {
    const { ctx, page } = await newPage(browser, 1440);
    await login(page, '9990002');
    await page.waitForFunction(() => document.body.textContent.includes('Test Team Lead'), { timeout: 5000 });
    await seedFeedCaches(page, '9990002', {
      leadflow: leadflowSummaryFor('9990002', 'team_lead', 'today'),
      learning: null,
      retail: null,
    }, 'today');
    await seedFeedCaches(page, '9990002', {
      leadflow: null,
      learning: null,
      retail: testSummaryFor('9990002', 'team_lead'),
    }, 'all');
    await clickNav(page, 'লিডস', 'Leads');
    await waitForSummaryReady(page);
    const strip = await page.evaluate(() => {
      const section = document.querySelector('section[aria-label="Summary"], section[aria-label="সারসংক্ষেপ"]');
      return section ? section.textContent : null;
    });
    check(
      'leads live: figures only — no badge, no "Live from …", no Last synced, no note',
      strip !== null &&
        !strip.includes('Live from LeadFlow') &&
        !strip.includes('Last synced') &&
        !strip.includes('Live lead data from LeadFlow.') &&
        !/demo|ডেমো/i.test(strip),
      strip?.slice(0, 200),
    );
    const readStats = (label) =>
      page.evaluate((lbl) => {
        const section = document.querySelector('section[aria-label="Summary"], section[aria-label="সারসংক্ষেপ"]');
        if (!section) return null;
        const out = [];
        for (const valueEl of section.querySelectorAll('p.text-2xl')) {
          const labelEl = valueEl.previousElementSibling;
          if (labelEl && labelEl.textContent.trim() === lbl) out.push(valueEl.textContent.trim());
        }
        return out;
      }, label);
    check('leads live: follow-ups 4 own + 12 team', JSON.stringify(await readStats("Today's follow-ups")) === JSON.stringify(['4', '12']));
    check('leads live: dues 4 this month (own only)', JSON.stringify(await readStats('Dues this month')) === JSON.stringify(['4']));
    check(
      'leads live: overdue 1, open 8 own + 20 team, converted 1',
      JSON.stringify(await readStats('Overdue follow-ups')) === JSON.stringify(['1']) &&
        JSON.stringify(await readStats('Open leads')) === JSON.stringify(['8', '20']) &&
        JSON.stringify(await readStats('Converted')) === JSON.stringify(['1']),
    );
    const go = await page.evaluate(() => {
      const a = [...document.querySelectorAll('a')].find((el) => el.textContent.includes('Go to Lead Management'));
      return a ? { href: a.getAttribute('href'), target: a.getAttribute('target') } : null;
    });
    check('leads live: Go button still same-tab to LeadFlow', go?.href === 'https://lead-flow-jet.vercel.app' && !go.target, JSON.stringify(go));
    const ov = await overflowCheck(page);
    check('leads live 1440: no horizontal overflow', !ov.overflow, `scrollWidth=${ov.scrollWidth} innerWidth=${ov.innerWidth}`);
    await waitForSplashGone(page);
    await page.screenshot({ path: path.join(QA_DIR, 'leads-live-1440.png'), fullPage: true });
    await ctx.close();
  }

  // ---- 21c. Learning page live ready state (Team Lead) ----
  // The Learning page defaults to Today now: seed :today AND :all,
  // assert the today figures first (9990002 enrolled 0, credits 0 —
  // the enrolment is 40 days back), then switch the dropdown to All
  // time and assert the all-time figures (1 / 0 / 0 / 120).
  {
    const { ctx, page } = await newPage(browser, 1440);
    await login(page, '9990002');
    await page.waitForFunction(() => document.body.textContent.includes('Test Team Lead'), { timeout: 5000 });
    await seedFeedCaches(page, '9990002', {
      leadflow: null,
      learning: learningSummaryFor('9990002', 'team_lead', 'today'),
      retail: null,
    }, 'today');
    await seedFeedCaches(page, '9990002', {
      leadflow: null,
      learning: learningSummaryFor('9990002', 'team_lead'),
      retail: null,
    }, 'all');
    await clickNav(page, 'লার্নিং', 'Learning');
    await waitForSummaryReady(page);
    const strip = await page.evaluate(() => {
      const section = document.querySelector('section[aria-label="Summary"], section[aria-label="সারসংক্ষেপ"]');
      return section ? section.textContent : null;
    });
    check(
      'learning live: figures only — no badge, no "Live from …", no Last synced, no note',
      strip !== null &&
        !strip.includes('Live from Learning Hub') &&
        !strip.includes('Last synced') &&
        !strip.includes('Live learning data from the Learning Hub.') &&
        !/demo|ডেমো/i.test(strip),
      strip?.slice(0, 200),
    );
    const readStats = (label) =>
      page.evaluate((lbl) => {
        const section = document.querySelector('section[aria-label="Summary"], section[aria-label="সারসংক্ষেপ"]');
        if (!section) return null;
        const out = [];
        for (const valueEl of section.querySelectorAll('p.text-2xl')) {
          const labelEl = valueEl.previousElementSibling;
          if (labelEl && labelEl.textContent.trim() === lbl) out.push(valueEl.textContent.trim());
        }
        return out;
      }, label);
    check('learning live: progress 80% own + 45% team', JSON.stringify(await readStats('Learning in progress')) === JSON.stringify(['80%', '45%']));
    check(
      'learning live (today default): enrolled 0, completed 0, certificates 0, credits 0',
      JSON.stringify(await readStats('Courses enrolled')) === JSON.stringify(['0']) &&
        JSON.stringify(await readStats('Courses completed')) === JSON.stringify(['0']) &&
        JSON.stringify(await readStats('Certificates')) === JSON.stringify(['0']) &&
        JSON.stringify(await readStats('Knowledge Credit')) === JSON.stringify(['0']),
    );
    await page.select('#period-select', 'all');
    await page.waitForFunction(
      () => {
        const section = document.querySelector('section[aria-label="Summary"], section[aria-label="সারসংক্ষেপ"]');
        if (!section) return false;
        const vals = [];
        for (const valueEl of section.querySelectorAll('p.text-2xl')) {
          const labelEl = valueEl.previousElementSibling;
          if (labelEl && labelEl.textContent.trim() === 'Courses enrolled') vals.push(valueEl.textContent.trim());
        }
        return JSON.stringify(vals) === JSON.stringify(['1']);
      },
      { timeout: 5000 },
    );
    check(
      'learning live: enrolled 1, completed 0, certificates 0, credits 120',
      JSON.stringify(await readStats('Courses enrolled')) === JSON.stringify(['1']) &&
        JSON.stringify(await readStats('Courses completed')) === JSON.stringify(['0']) &&
        JSON.stringify(await readStats('Certificates')) === JSON.stringify(['0']) &&
        JSON.stringify(await readStats('Knowledge Credit')) === JSON.stringify(['120']),
    );
    check('learning live: team members line', strip?.includes('5 team members learning in progress'));
    const go = await page.evaluate(() => {
      const a = [...document.querySelectorAll('a')].find((el) => el.textContent.includes('Go to Learning'));
      return a ? { href: a.getAttribute('href'), target: a.getAttribute('target') } : null;
    });
    check('learning live: Go button still same-tab to Learning Hub', go?.href === 'https://shanta-life-learning-hub.vercel.app' && !go.target, JSON.stringify(go));
    const ov = await overflowCheck(page);
    check('learning live 1440: no horizontal overflow', !ov.overflow, `scrollWidth=${ov.scrollWidth} innerWidth=${ov.innerWidth}`);
    await waitForSplashGone(page);
    await page.screenshot({ path: path.join(QA_DIR, 'learning-live-1440.png'), fullPage: true });
    await ctx.close();
  }

  // ---- 21d. Home live at 375 + 768 px (device gate) ----
  for (const width of [375, 768]) {
    const { ctx, page } = await newPage(browser, width);
    await login(page, '9990002');
    await page.waitForFunction(() => document.body.textContent.includes('Test Team Lead'), { timeout: 5000 });
    await seedFeedCaches(page, '9990002', {
      leadflow: leadflowSummaryFor('9990002', 'team_lead'),
      learning: null,
      retail: null,
    });
    await seedFeedCaches(page, '9990002', {
      leadflow: null,
      learning: learningSummaryFor('9990002', 'team_lead', 'this-month'),
      retail: testSummaryFor('9990002', 'team_lead', 'this-month'),
    }, 'this-month');
    await page.reload({ waitUntil: 'networkidle0' });
    await page.waitForFunction(() => document.body.textContent.includes('৳34,000'), { timeout: 5000 });
    await new Promise((r) => setTimeout(r, 300));
    // Due columns: stacked at 375 (Upcoming above Overdue),
    // side-by-side at 768 (Upcoming left, Overdue right).
    const dueLayout = await page.evaluate(() => {
      const section = document.querySelector('section[aria-label="Due premiums"], section[aria-label="বকেয়া প্রিমিয়াম"]');
      if (!section) return null;
      const heads = [...section.querySelectorAll('h4')].map((h) => {
        const r = h.getBoundingClientRect();
        return { text: h.textContent.trim(), top: r.top, left: r.left, right: r.right, bottom: r.bottom };
      });
      return {
        up: heads.find((h) => h.text === 'Upcoming dues' || h.text === 'আসন্ন বকেয়া') ?? null,
        over: heads.find((h) => h.text === 'Overdue' || h.text === 'মেয়াদোত্তীর্ণ') ?? null,
      };
    });
    if (width === 375) {
      check(
        'home live 375: due columns stacked (Upcoming above Overdue)',
        dueLayout?.up != null && dueLayout?.over != null && dueLayout.over.top >= dueLayout.up.bottom,
        JSON.stringify(dueLayout),
      );
    } else {
      check(
        'home live 768: due columns side-by-side (Upcoming left, Overdue right)',
        dueLayout?.up != null &&
          dueLayout?.over != null &&
          Math.abs(dueLayout.up.top - dueLayout.over.top) <= 2 &&
          dueLayout.up.left < dueLayout.over.left &&
          dueLayout.up.right < dueLayout.over.left,
        JSON.stringify(dueLayout),
      );
    }
    const ov = await overflowCheck(page);
    check(`home live ${width}: no horizontal overflow`, !ov.overflow, `scrollWidth=${ov.scrollWidth} innerWidth=${ov.innerWidth}`);
    await waitForSplashGone(page);
    await page.screenshot({ path: path.join(QA_DIR, `home-live-${width}.png`), fullPage: true });
    await ctx.close();
  }

  // ---- 21e. Empty live states (Employee): plain empty text, no demo figures ----
  // The empty summaries are seeded at :all (LeadFlow on Home), at
  // :this-month (Home's retail + learning feeds) and at :today
  // (Leads/Learning pages default to Today now).
  {
    const { ctx, page } = await newPage(browser, 1440);
    await login(page, '9990001');
    await page.waitForFunction(() => document.body.textContent.includes('Test Agent'), { timeout: 5000 });
    const emptyLeadflow = leadflowSummaryFor('9990001', 'employee');
    emptyLeadflow.empty = true;
    emptyLeadflow.emptyReason = 'no-leadflow-account';
    emptyLeadflow.followups = { overdue: 0, today: 0, upcoming: 0, all: 0 };
    emptyLeadflow.leads = { total: 0, open: 0, converted: 0, todayCollection: 0, createdInPeriod: 0, statusCounts: {} };
    const emptyLearning = learningSummaryFor('9990001', 'employee');
    emptyLearning.empty = true;
    emptyLearning.emptyReason = 'no-lms-record';
    emptyLearning.learning = { currentCourse: null, coursesEnrolled: 0, coursesCompleted: 0, certificates: 0, creditBalance: 0, enrolledInPeriod: 0, completedInPeriod: 0, creditsInPeriod: 0, coursesInProgress: 0 };
    const emptyRetail = {
      ...testSummaryFor('9990001', 'employee'),
      empty: true,
      emptyReason: 'no-rows',
      duePolicies: 0,
      duePremium: 0,
      duesThisWeek: { count: 0, amount: 0, weekStart: '2026-11-15', weekEnd: '2026-11-21' },
      dueRowsOverdue: [],
      dueRowsUpcoming: [],
    };
    await seedFeedCaches(page, '9990001', { leadflow: emptyLeadflow, learning: emptyLearning, retail: emptyRetail });
    await seedFeedCaches(page, '9990001', { leadflow: emptyLeadflow, learning: emptyLearning, retail: emptyRetail }, 'this-month');
    await seedFeedCaches(page, '9990001', { leadflow: emptyLeadflow, learning: emptyLearning, retail: emptyRetail }, 'today');
    await page.reload({ waitUntil: 'networkidle0' });
    await page.waitForFunction(() => document.body.textContent.includes('No follow-ups due today'), { timeout: 5000 });
    const cards = await page.evaluate(() => {
      const out = {};
      for (const section of document.querySelectorAll('section[aria-label]')) {
        if (!section.querySelector(':scope > span[aria-hidden].w-1')) continue; // direct child — a parent section (e.g. Your team) must not match via a nested card
        const title = section.getAttribute('aria-label');
        const empty = section.querySelector('p.text-base');
        out[title] = empty ? empty.textContent.trim() : section.querySelector('p.text-3xl')?.textContent.trim();
      }
      return out;
    });
    check('home empty live: follow-ups empty text', cards["Today's follow-ups"] === 'No follow-ups due today', JSON.stringify(cards));
    check('home empty live: dues this week empty text', cards['Dues this week'] === 'No premiums due this week', JSON.stringify(cards));
    check('home empty live: learning this month empty text', cards['Learning this month'] === 'No learning this month', JSON.stringify(cards));
    check('home empty live: no Sales overview cards (empty retail)', cards['Total policy sales'] === undefined && cards['Total FYCP'] === undefined, JSON.stringify(cards));
    const dueText = await page.evaluate(() => {
      const el = document.querySelector('section[aria-label="Due premiums"], section[aria-label="বকেয়া প্রিমিয়াম"]');
      return el ? el.textContent : '';
    });
    check('home empty live: due widget empty text', dueText.includes('No premiums due this month'), dueText.slice(0, 160));
    await clickNav(page, 'লিডস', 'Leads');
    await waitForSummaryReady(page);
    const leadsStrip = await page.evaluate(() => {
      const section = document.querySelector('section[aria-label="Summary"], section[aria-label="সারসংক্ষেপ"]');
      return section ? section.textContent : '';
    });
    check('leads empty live: zeros, no demo figures', leadsStrip.includes('0') && !leadsStrip.includes('The Art of Selling'), leadsStrip.slice(0, 200));
    await clickNav(page, 'লার্নিং', 'Learning');
    await waitForSummaryReady(page);
    const learningStrip = await page.evaluate(() => {
      const section = document.querySelector('section[aria-label="Summary"], section[aria-label="সারসংক্ষেপ"]');
      return section ? section.textContent : '';
    });
    check('learning empty live: no course in progress', learningStrip.includes('No course in progress'), learningStrip.slice(0, 200));
    await ctx.close();
  }

  // ---- 27. No-demo rule: real users never see fixture figures ----
  // (Mahadi 2026-11-20 — the demo code is deleted.) The incident:
  // Maliha Rahman (2026033, real employee, no retail code) logged
  // in, her retail fetch failed transiently, and the old Home fell
  // back to the demo fixture (dues 2 / ৳48,500, business ৳1,85,000).
  // (a) A real user with a FAILED retail fetch shows error + retry,
  // never fixture figures — on Home and on the Leads/Learning pages.
  // (b) A real user with an EMPTY retail feed (empty:true, no-code)
  // shows zeros + empty states, never fixture figures. (c) No 'demo'
  // text appears anywhere user-visible on any page for any session.
  {
    const { ctx, page } = await newPage(browser, 1440);
    await login(page, '2026033', 'employee', 'Maliha Rahman');
    await page.waitForFunction(() => document.body.textContent.includes('Maliha Rahman'), { timeout: 5000 });
    // No caches seeded and no proxy under file:// — every feed fails.
    // Wait for the Due widget itself to reach the error state.
    await page.waitForFunction(
      () => {
        const el = document.querySelector('section[aria-label="Due premiums"], section[aria-label="বকেয়া প্রিমিয়াম"]');
        return el && (el.textContent.includes('Could not load this data.') || el.textContent.includes('এই ডেটা লোড করা যায়নি।'));
      },
      { timeout: 10000 },
    );
    const homeBody = await page.evaluate(() => document.body.textContent);
    check(
      'no-demo (a) home failed fetch: error + retry, no Sales overview',
      homeBody.includes('Could not load this data.') &&
        homeBody.includes('Try again') &&
        !homeBody.includes('Total policy sales') &&
        !homeBody.includes('Total FYCP'),
      homeBody.slice(0, 200),
    );
    check(
      'no-demo (a) home failed fetch: no fixture figures anywhere',
      !homeBody.includes('48,500') && !homeBody.includes('185,000') && !homeBody.includes('1,85,000'),
      homeBody.slice(0, 200),
    );
    check('no-demo (a) home failed fetch: no demo text', !/demo|ডেমো/i.test(homeBody));
    await clickNav(page, 'লিডস', 'Leads');
    await page.waitForFunction(
      () =>
        document.body.textContent.includes('Could not load the data.') ||
        document.body.textContent.includes('ডেটা লোড করা যায়নি।'),
      { timeout: 10000 },
    );
    const leadsBody = await page.evaluate(() => document.body.textContent);
    check(
      'no-demo (a) leads failed fetch: error + retry, no fixture figures',
      leadsBody.includes('Could not load the data.') &&
        leadsBody.includes('Try again') &&
        !leadsBody.includes('48,500') &&
        !leadsBody.includes('185,000') &&
        !leadsBody.includes('1,85,000'),
      leadsBody.slice(0, 200),
    );
    check('no-demo (a) leads failed fetch: no demo text', !/demo|ডেমো/i.test(leadsBody));
    await clickNav(page, 'লার্নিং', 'Learning');
    await page.waitForFunction(
      () =>
        document.body.textContent.includes('Could not load the data.') ||
        document.body.textContent.includes('ডেটা লোড করা যায়নি।'),
      { timeout: 10000 },
    );
    const learningBody = await page.evaluate(() => document.body.textContent);
    check(
      'no-demo (a) learning failed fetch: error + retry, no fixture figures',
      learningBody.includes('Could not load the data.') &&
        learningBody.includes('Try again') &&
        !learningBody.includes('48,500') &&
        !learningBody.includes('185,000') &&
        !learningBody.includes('1,85,000'),
      learningBody.slice(0, 200),
    );
    check('no-demo (a) learning failed fetch: no demo text', !/demo|ডেমো/i.test(learningBody));
    await ctx.close();
  }
  {
    // (b) Empty retail feed for a real user: 2026033 has no fixture
    // rows, so the summarizer itself returns empty:true,
    // emptyReason 'no-code' with all zeros — exactly what the proxy
    // returns for her live. Seed it at :all and :this-month, with
    // empty LeadFlow/Learning summaries, and check the whole page
    // shows honest empty states.
    const { ctx, page } = await newPage(browser, 1440);
    await login(page, '2026033', 'employee', 'Maliha Rahman');
    await page.waitForFunction(() => document.body.textContent.includes('Maliha Rahman'), { timeout: 5000 });
    const emptyLeadflow = leadflowSummaryFor('2026033', 'employee');
    emptyLeadflow.empty = true;
    emptyLeadflow.emptyReason = 'no-leadflow-account';
    emptyLeadflow.followups = { overdue: 0, today: 0, upcoming: 0, all: 0 };
    emptyLeadflow.leads = { total: 0, open: 0, converted: 0, todayCollection: 0, createdInPeriod: 0, statusCounts: {} };
    const emptyLearning = learningSummaryFor('2026033', 'employee');
    emptyLearning.empty = true;
    emptyLearning.emptyReason = 'no-lms-record';
    emptyLearning.learning = { currentCourse: null, coursesEnrolled: 0, coursesCompleted: 0, certificates: 0, creditBalance: 0, enrolledInPeriod: 0, completedInPeriod: 0, creditsInPeriod: 0, coursesInProgress: 0 };
    const emptyRetail = testSummaryFor('2026033', 'employee', 'this-month');
    await seedFeedCaches(page, '2026033', { leadflow: emptyLeadflow, learning: emptyLearning, retail: emptyRetail });
    await seedFeedCaches(page, '2026033', { leadflow: emptyLeadflow, learning: emptyLearning, retail: emptyRetail }, 'this-month');
    await seedFeedCaches(page, '2026033', { leadflow: emptyLeadflow, learning: emptyLearning, retail: emptyRetail }, 'today');
    await page.reload({ waitUntil: 'networkidle0' });
    await page.waitForFunction(() => document.body.textContent.includes('No follow-ups due today'), { timeout: 5000 });
    const homeBody = await page.evaluate(() => document.body.textContent);
    check(
      'no-demo (b) home empty feed: plain empty texts, no Sales overview',
      homeBody.includes('No follow-ups due today') &&
        homeBody.includes('No premiums due this week') &&
        homeBody.includes('No learning this month') &&
        homeBody.includes('No premiums due this month') &&
        !homeBody.includes('Total policy sales') &&
        !homeBody.includes('Total FYCP'),
      homeBody.slice(0, 240),
    );
    check(
      'no-demo (b) home empty feed: no fixture figures anywhere',
      !homeBody.includes('48,500') && !homeBody.includes('185,000') && !homeBody.includes('1,85,000'),
      homeBody.slice(0, 200),
    );
    check('no-demo (b) home empty feed: no demo text', !/demo|ডেমো/i.test(homeBody));
    await clickNav(page, 'লিডস', 'Leads');
    await waitForSummaryReady(page);
    const leadsStrip = await page.evaluate(() => {
      const section = document.querySelector('section[aria-label="Summary"], section[aria-label="সারসংক্ষেপ"]');
      return section ? section.textContent : '';
    });
    check(
      'no-demo (b) leads empty feed: zeros, no fixture figures',
      leadsStrip.includes('0') &&
        !leadsStrip.includes('48,500') &&
        !leadsStrip.includes('185,000') &&
        !leadsStrip.includes('1,85,000'),
      leadsStrip.slice(0, 200),
    );
    await clickNav(page, 'লার্নিং', 'Learning');
    await waitForSummaryReady(page);
    const learningStrip = await page.evaluate(() => {
      const section = document.querySelector('section[aria-label="Summary"], section[aria-label="সারসংক্ষেপ"]');
      return section ? section.textContent : '';
    });
    check(
      'no-demo (b) learning empty feed: no course in progress, no fixture figures',
      learningStrip.includes('No course in progress') &&
        !learningStrip.includes('48,500') &&
        !learningStrip.includes('185,000'),
      learningStrip.slice(0, 200),
    );
    // (c) No 'demo' text on any remaining page for this session.
    await clickNav(page, 'ড্যাশবোর্ড', 'Dashboard');
    await waitForDashboardTerminal(page);
    check('no-demo (c) dashboard: no demo text', await noDemoText(page));
    await clickNav(page, 'ক্যালকুলেটর', 'Calculators');
    await page.waitForFunction(() => document.body.textContent.includes('PremiumPulse'), { timeout: 5000 });
    check('no-demo (c) calculators: no demo text', await noDemoText(page));
    await clickNav(page, 'প্রপোজাল', 'Proposals');
    await page.waitForFunction(() => document.body.textContent.includes('Proposals'), { timeout: 5000 });
    check('no-demo (c) proposals: no demo text', await noDemoText(page));
    await page.evaluate(() => {
      [...document.querySelectorAll('button')].find((b) => b.textContent.includes('প্রোফাইল') || b.textContent.includes('Profile'))?.click();
    });
    await page.waitForFunction(() => document.body.textContent.includes('Maliha Rahman'), { timeout: 5000 });
    check('no-demo (c) profile: no demo text', await noDemoText(page));
    await ctx.close();
  }

  // ---- 22. Real-auth login states (Phase 2) ----
  // The form is the real-login form: one identifier field (Employee
  // ID or email) + one credential field, with a forgot link out to
  // the Learning Hub. There is NO demo notice any more — there are no
  // demo accounts and no demo code at all — so the page must not
  // mention a demo ID anywhere. The server lockout surfaces via the
  // same alert (qa:auth-live covers the server side).
  for (const width of [375, 768, 1440]) {
    const { ctx, page } = await newPage(browser, width);
    await page.goto(BASE, { waitUntil: 'networkidle0' });
    await page.waitForFunction(() => !document.querySelector('[data-splash]'), { timeout: 5000 }).catch(() => {});
    await page.waitForSelector('#employee-id', { timeout: 10000 });
    const idLabel = await page.$eval('label[for="employee-id"]', (el) => el.textContent);
    const idPlaceholder = await page.$eval('#employee-id', (el) => el.placeholder);
    const forgotHref = await page
      .$eval('a[href*="login/forgot"]', (el) => el.href)
      .catch(() => '(no forgot link)');
    const demoNotice = await page.evaluate(() => document.body.textContent.includes('9990001'));
    check(`login real form ${width}: identifier label`, idLabel.includes('Employee ID or email'), idLabel);
    check(`login real form ${width}: identifier placeholder`, idPlaceholder.includes('2025019 or name@shantalife.com'), idPlaceholder);
    check(`login real form ${width}: forgot link to LH`, forgotHref.includes('shanta-life-learning-hub.vercel.app/login/forgot'), forgotHref);
    check(`login real form ${width}: NO test ID shown (no demo accounts)`, !demoNotice);
    // Typing an email switches the credential field to a password field.
    await page.type('#employee-id', 'staff@shantalife.com');
    await new Promise((r) => setTimeout(r, 200));
    const credPlaceholder = await page.$eval('#pin', (el) => el.placeholder);
    const credType = await page.$eval('#pin', (el) => el.type);
    check(`login real form ${width}: email identifier -> password placeholder`, credPlaceholder === 'Password' && credType === 'password', `${credPlaceholder} / ${credType}`);
    const ov = await overflowCheck(page);
    check(`login real form ${width}: no horizontal overflow`, !ov.overflow, `scrollWidth=${ov.scrollWidth} innerWidth=${ov.innerWidth}`);
    await waitForSplashGone(page);
    await page.screenshot({ path: path.join(QA_DIR, `login-real-${width}.png`), fullPage: true });
    await ctx.close();
  }

  // Error state: a 999xxxx attempt shows the not-configured message
  // (no demo route any more) — never a wrong-PIN message with
  // attempts left, which was the old demo-provider behaviour.
  {
    const { ctx, page } = await newPage(browser, 375);
    await page.goto(BASE, { waitUntil: 'networkidle0' });
    await page.waitForSelector('#employee-id', { timeout: 10000 });
    await page.type('#employee-id', '9990002');
    await page.type('#pin', '000000');
    await page.click('button[type="submit"]');
    await page.waitForSelector('[role="alert"]', { timeout: 5000 });
    const alert = await page.$eval('[role="alert"]', (el) => el.textContent);
    check(
      'login error state: 999xxxx attempt shows not-configured, no attempts-left',
      /not configured|কনফিগার করা হয়নি/i.test(alert) && !/attempts left|চেষ্টা বাকি/i.test(alert),
      alert,
    );
    const ov = await overflowCheck(page);
    check('login error state: no horizontal overflow', !ov.overflow, `scrollWidth=${ov.scrollWidth} innerWidth=${ov.innerWidth}`);
    await waitForSplashGone(page);
    await page.screenshot({ path: path.join(QA_DIR, 'login-error-375.png'), fullPage: true });
    await ctx.close();
  }

  // Repeated-error state: 5 wrong submissions at 375 px (same flow as
  // §3, phone width) — the message stays not-configured, never a
  // lock message (there is no client-side lockout any more).
  {
    const { ctx, page } = await newPage(browser, 375);
    await page.goto(BASE, { waitUntil: 'networkidle0' });
    for (let i = 0; i < 5; i++) {
      await page.waitForSelector('#employee-id');
      await page.evaluate(() => {
        document.querySelector('#employee-id').value = '';
        document.querySelector('#pin').value = '';
      });
      await page.type('#employee-id', '9990002');
      await page.type('#pin', '000000');
      await page.click('button[type="submit"]');
      await new Promise((r) => setTimeout(r, 400));
    }
    const alert = await page.$eval('[role="alert"]', (el) => el.textContent);
    check('login error-repeat state 375: still not-configured, never a lock message', /not configured|কনফিগার করা হয়নি/i.test(alert) && !/লক|lock/i.test(alert), alert);
    const ov = await overflowCheck(page);
    check('login error-repeat state 375: no horizontal overflow', !ov.overflow, `scrollWidth=${ov.scrollWidth} innerWidth=${ov.innerWidth}`);
    await waitForSplashGone(page);
    await page.screenshot({ path: path.join(QA_DIR, 'login-error-repeat-375.png'), fullPage: true });
    await ctx.close();
  }
  // ---- 23. Time-frame filter: dropdown + defaults + Custom range ----
  // Each data page at 375/768/1440: seed the caches, open the page,
  // confirm the default figures — This Month on the Dashboard (retail
  // data lags a day, so Today shows ৳0), Today on Leads and Learning
  // — select 'Last 3 months' from the dropdown, and confirm the
  // figures change to the 3m values while the snapshots stay put. The
  // Dashboard also exercises the Custom range: selecting Custom
  // reveals the date inputs; filling 2026-11-01..2026-11-20 returns
  // exactly the rows inside it (the this-month values); an invalid
  // range (to before from) shows the inline error and keeps the last
  // figures. The background refresh fails under file:// (no proxy) —
  // the pages fall back to the seeded cache, which is exactly the
  // path under test. Expected values are the hand-computed fixture
  // values (qa-*-live §2b/§5b).
  const readKpis = (page) =>
    page.evaluate(() => {
      const out = {};
      for (const section of document.querySelectorAll('section[aria-label]')) {
        const value = section.querySelector('p.text-3xl');
        if (value) out[section.getAttribute('aria-label')] = value.textContent.trim();
      }
      return out;
    });
  const readSummaryStats = (page, label) =>
    page.evaluate((lbl) => {
      const section = document.querySelector('section[aria-label="Summary"], section[aria-label="সারসংক্ষেপ"]');
      if (!section) return null;
      const out = [];
      for (const valueEl of section.querySelectorAll('p.text-2xl')) {
        const labelEl = valueEl.previousElementSibling;
        if (labelEl && labelEl.textContent.trim() === lbl) out.push(valueEl.textContent.trim());
      }
      return out;
    }, label);
  const readSummaryStatsWhere = (page, label, want) =>
    page.waitForFunction(
      (lbl, wanted) => {
        const section = document.querySelector('section[aria-label="Summary"], section[aria-label="সারসংক্ষেপ"]');
        if (!section) return false;
        const vals = [];
        for (const valueEl of section.querySelectorAll('p.text-2xl')) {
          const labelEl = valueEl.previousElementSibling;
          if (labelEl && labelEl.textContent.trim() === lbl) vals.push(valueEl.textContent.trim());
        }
        return JSON.stringify(vals) === JSON.stringify(wanted);
      },
      { timeout: 5000 },
      label,
      want,
    );
  for (const width of [375, 768, 1440]) {
    // Dashboard (Team Lead 9990002): this-month total ৳43,000, FYCP
    // ৳35,000, policies 1 (the Dashboard default); 3m total
    // ৳1,08,000, FYCP ৳1,00,000, policies 3; due ৳34,000 and
    // persistency 83.3% stay put. Custom 2026-11-01..2026-11-20 =
    // this-month: total ৳43,000, FYCP ৳35,000, policies 1.
    {
      const { ctx, page } = await newPage(browser, width);
      await login(page, '9990002');
      await page.waitForFunction(() => document.body.textContent.includes('Test Team Lead'), { timeout: 5000 });
      await seedFeedCaches(page, '9990002', { leadflow: null, learning: null, retail: testSummaryFor('9990002', 'team_lead', 'this-month') }, 'this-month');
      await seedFeedCaches(page, '9990002', { leadflow: null, learning: null, retail: testSummaryFor('9990002', 'team_lead', '3m') }, '3m');
      await seedFeedCaches(page, '9990002', { leadflow: null, learning: null, retail: testSummaryFor('9990002', 'team_lead', 'custom', { start: '2026-11-01', end: '2026-11-20' }) }, 'custom:2026-11-01:2026-11-20');
      await clickNav(page, 'ড্যাশবোর্ড', 'Dashboard');
      const dashPath = await waitForDashboardTerminal(page);
      check(`period dashboard ${width}: ready state renders`, dashPath === 'live', `path=${dashPath}`);
      const selectValue = () => page.$eval('#period-select', (el) => el.value);
      check(`period dashboard ${width}: dropdown defaults to This Month`, (await selectValue()) === 'this-month');
      const kpisThisMonth = await readKpis(page);
      check(`period dashboard ${width}: this-month total ৳43,000 + FYCP ৳35,000 + policies 1`, kpisThisMonth['Total premium received'] === '৳43,000' && kpisThisMonth.FYCP === '৳35,000' && kpisThisMonth.Policies === '1', JSON.stringify(kpisThisMonth));
      await page.select('#period-select', '3m');
      await page.waitForFunction(
        () => [...document.querySelectorAll('section[aria-label="Total premium received"] p.text-3xl')].some((el) => el.textContent.trim() === '৳1,08,000'),
        { timeout: 5000 },
      );
      const kpis3m = await readKpis(page);
      check(`period dashboard ${width}: 3m total ৳1,08,000 + FYCP ৳1,00,000 + policies 3`, kpis3m['Total premium received'] === '৳1,08,000' && kpis3m.FYCP === '৳1,00,000' && kpis3m.Policies === '3', JSON.stringify(kpis3m));
      check(`period dashboard ${width}: due ৳34,000 + persistency 83.3% unchanged`, kpis3m['Due premium — this month'] === '৳34,000' && kpis3m.Persistency === '83.3%', JSON.stringify(kpis3m));
      check(`period dashboard ${width}: dropdown value tracks 3m`, (await selectValue()) === '3m');
      const ov = await overflowCheck(page);
      check(`period dashboard ${width}: no horizontal overflow`, !ov.overflow, `scrollWidth=${ov.scrollWidth} innerWidth=${ov.innerWidth}`);
      await waitForSplashGone(page);
      await page.screenshot({ path: path.join(QA_DIR, `dashboard-period-3m-${width}.png`), fullPage: true });
      // Custom range: reveal the date inputs, fill the range, and
      // confirm exactly the rows inside it come back.
      await page.select('#period-select', 'custom');
      await page.waitForSelector('#period-custom-from', { timeout: 5000 });
      await setDateInput(page, '#period-custom-from', '2026-11-01');
      await setDateInput(page, '#period-custom-to', '2026-11-20');
      await page.waitForFunction(
        () => [...document.querySelectorAll('section[aria-label="Total premium received"] p.text-3xl')].some((el) => el.textContent.trim() === '৳43,000'),
        { timeout: 5000 },
      );
      const kpisCustom = await readKpis(page);
      check(`period dashboard ${width}: custom 11-01..11-20 total ৳43,000 + FYCP ৳35,000 + policies 1`, kpisCustom['Total premium received'] === '৳43,000' && kpisCustom.FYCP === '৳35,000' && kpisCustom.Policies === '1', JSON.stringify(kpisCustom));
      const customLabel = await page.evaluate(() => document.body.textContent.includes('2026-11-01 – 2026-11-20'));
      check(`period dashboard ${width}: custom range label shown`, customLabel);
      // Invalid range: to before from — the inline error shows and
      // the figures stay at the last valid values.
      await setDateInput(page, '#period-custom-to', '2026-10-01');
      await page.waitForFunction(
        () => [...document.querySelectorAll('p[role="alert"]')].some((el) => el.textContent.includes('valid date range')),
        { timeout: 5000 },
      );
      const kpisInvalid = await readKpis(page);
      check(`period dashboard ${width}: invalid range shows the error and keeps the figures`, kpisInvalid['Total premium received'] === '৳43,000', JSON.stringify(kpisInvalid));
      if (width === 375) {
        await waitForSplashGone(page);
        await page.screenshot({ path: path.join(QA_DIR, 'dashboard-period-custom-375.png'), fullPage: true });
      }
      await ctx.close();
    }
    // Leads (Team Lead 9990002): today new leads own 2 + team 1;
    // 3m own 5 + team 11; overdue 1, open 8/20, converted 1 stay put.
    {
      const { ctx, page } = await newPage(browser, width);
      await login(page, '9990002');
      await page.waitForFunction(() => document.body.textContent.includes('Test Team Lead'), { timeout: 5000 });
      await seedFeedCaches(page, '9990002', { leadflow: leadflowSummaryFor('9990002', 'team_lead', 'today'), learning: null, retail: null }, 'today');
      await seedFeedCaches(page, '9990002', { leadflow: leadflowSummaryFor('9990002', 'team_lead', '3m'), learning: null, retail: null }, '3m');
      await seedFeedCaches(page, '9990002', { leadflow: null, learning: null, retail: testSummaryFor('9990002', 'team_lead') }, 'all');
      await clickNav(page, 'লিডস', 'Leads');
      await waitForSummaryReady(page);
      check(`period leads ${width}: dropdown defaults to Today`, (await page.$eval('#period-select', (el) => el.value)) === 'today');
      check(`period leads ${width}: today new leads 2 own + 1 team`, JSON.stringify(await readSummaryStats(page, 'New leads')) === JSON.stringify(['2', '1']));
      await page.select('#period-select', '3m');
      await readSummaryStatsWhere(page, 'New leads', ['5', '11']);
      check(`period leads ${width}: 3m new leads 5 own + 11 team`, JSON.stringify(await readSummaryStats(page, 'New leads')) === JSON.stringify(['5', '11']));
      check(
        `period leads ${width}: overdue 1, open 8/20, converted 1 unchanged`,
        JSON.stringify(await readSummaryStats(page, 'Overdue follow-ups')) === JSON.stringify(['1']) &&
          JSON.stringify(await readSummaryStats(page, 'Open leads')) === JSON.stringify(['8', '20']) &&
          JSON.stringify(await readSummaryStats(page, 'Converted')) === JSON.stringify(['1']),
      );
      check(`period leads ${width}: dropdown value tracks 3m`, (await page.$eval('#period-select', (el) => el.value)) === '3m');
      const ov = await overflowCheck(page);
      check(`period leads ${width}: no horizontal overflow`, !ov.overflow, `scrollWidth=${ov.scrollWidth} innerWidth=${ov.innerWidth}`);
      await waitForSplashGone(page);
      await page.screenshot({ path: path.join(QA_DIR, `leads-period-3m-${width}.png`), fullPage: true });
      await ctx.close();
    }
    // Learning (Admin 9990004, org-wide): today enrolled 6,
    // completed 0, credits 140; 3m enrolled 12, completed 0, credits
    // 290; certificates 1 stays put.
    {
      const { ctx, page } = await newPage(browser, width);
      await login(page, '9990004');
      await page.waitForFunction(() => document.body.textContent.includes('Test Admin'), { timeout: 5000 });
      await seedFeedCaches(page, '9990004', { leadflow: null, learning: learningSummaryFor('9990004', 'admin', 'today'), retail: null }, 'today');
      await seedFeedCaches(page, '9990004', { leadflow: null, learning: learningSummaryFor('9990004', 'admin', '3m'), retail: null }, '3m');
      await clickNav(page, 'লার্নিং', 'Learning');
      await waitForSummaryReady(page);
      check(`period learning ${width}: dropdown defaults to Today`, (await page.$eval('#period-select', (el) => el.value)) === 'today');
      check(`period learning ${width}: today enrolled 6, completed 0, credits 140`, JSON.stringify(await readSummaryStats(page, 'Courses enrolled')) === JSON.stringify(['6']) && JSON.stringify(await readSummaryStats(page, 'Courses completed')) === JSON.stringify(['0']) && JSON.stringify(await readSummaryStats(page, 'Knowledge Credit')) === JSON.stringify(['140']));
      await page.select('#period-select', '3m');
      await readSummaryStatsWhere(page, 'Courses enrolled', ['12']);
      check(
        `period learning ${width}: 3m enrolled 12, completed 0, credits 290, certs 1`,
        JSON.stringify(await readSummaryStats(page, 'Courses enrolled')) === JSON.stringify(['12']) &&
          JSON.stringify(await readSummaryStats(page, 'Courses completed')) === JSON.stringify(['0']) &&
          JSON.stringify(await readSummaryStats(page, 'Knowledge Credit')) === JSON.stringify(['290']) &&
          JSON.stringify(await readSummaryStats(page, 'Certificates')) === JSON.stringify(['1']),
      );
      check(`period learning ${width}: dropdown value tracks 3m`, (await page.$eval('#period-select', (el) => el.value)) === '3m');
      const ov = await overflowCheck(page);
      check(`period learning ${width}: no horizontal overflow`, !ov.overflow, `scrollWidth=${ov.scrollWidth} innerWidth=${ov.innerWidth}`);
      await waitForSplashGone(page);
      await page.screenshot({ path: path.join(QA_DIR, `learning-period-3m-${width}.png`), fullPage: true });
      await ctx.close();
    }
  }

  // ---- 24. Demo removal: no DEMO badge in the header, for ANY session ----
  // The header badge is gone entirely (Mahadi 2026-11-20) — and with
  // the demo code deleted the same day, the Due widget's and the
  // Dashboard's DEMO badges are gone too. Both a 999xxxx test-user
  // session and a real-user session (2025019, admin) must show no
  // badge in the header.
  for (const [id, role, name] of [
    ['9990002', 'team_lead', 'Test Team Lead'],
    ['2025019', 'admin', 'Mahadi Hasan'],
  ]) {
    const { ctx, page } = await newPage(browser, 1440);
    await login(page, id, role, name);
    await page.waitForFunction((n) => document.body.textContent.includes(n), { timeout: 5000 }, name);
    const headerText = await page.evaluate(() => document.querySelector('header')?.textContent ?? '');
    check(`header ${id}: no DEMO badge`, !headerText.includes('DEMO DATA') && !headerText.includes('ডেমো ডেটা'), headerText.slice(0, 120));
    await ctx.close();
  }

  // ---- 25. Splash screen + Learning Hub-style login visuals ----
  // The splash shows on first load (branded: logo + Agent Hub) and
  // fades within ~1.5s; the login page has the LH-style photo panel
  // (1440), wave band (375) and animated card, with logo fallbacks
  // when the live assets cannot load (no external network here).
  for (const width of [375, 1440]) {
    const { ctx, page } = await newPage(browser, width);
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-splash]', { timeout: 5000 });
    const splashSeenAt = Date.now();
    check(`splash ${width}: present on first load`, true);
    await page.screenshot({ path: path.join(QA_DIR, `splash-${width}.png`), fullPage: true });
    await page.waitForFunction(() => !document.querySelector('[data-splash]'), { timeout: 5000 });
    const splashMs = Date.now() - splashSeenAt;
    // ~1s by design (700ms minimum + 300ms fade); 3s allows for the
    // screenshot time in between.
    check(`splash ${width}: gone shortly after appearing`, splashMs < 3000, `${splashMs}ms`);
    await page.waitForSelector('#employee-id', { timeout: 5000 });
    const cardAnimated = await page.evaluate(() => !!document.querySelector('.animate-hub-page'));
    check(`login visuals ${width}: card entrance animation class present`, cardAnimated);
    const accentPresent = await page.evaluate(() => !!document.querySelector('.animate-hub-accent'));
    check(`login visuals ${width}: accent bar present`, accentPresent);
    if (width === 1440) {
      const panelImg = await page.evaluate(() => !!document.querySelector('img[src*="field-training-1.jpg"]'));
      check('login visuals 1440: photo panel image element present', panelImg);
      // The live white logo cannot load here — the fallback mark must
      // take its place (the <img> unmounts on error).
      await page.waitForFunction(() => !document.querySelector('img[src*="logo-white.png"]'), { timeout: 5000 }).catch(() => {});
      const whiteLogoGone = await page.evaluate(() => !document.querySelector('img[src*="logo-white.png"]'));
      check('login visuals 1440: white logo falls back when it cannot load', whiteLogoGone);
      const panelHeadline = await page.evaluate(() => document.body.textContent.includes('From lead to sale — all in one place.'));
      check('login visuals 1440: panel headline present', panelHeadline);
      const panelBullets = await page.evaluate(() =>
        [
          'Every lead, from first call to closed sale',
          'Learning built for the field — courses, quizzes, certificates',
          'Your numbers, analysed — sales, dues, performance',
        ].every((s) => document.body.textContent.includes(s)),
      );
      check('login visuals 1440: lead-to-sale value bullets present', panelBullets);
      const oldPanelCopy = await page.evaluate(
        () =>
          document.body.textContent.includes('One login. Every field tool.') ||
          document.body.textContent.includes('Leads, learning & sales in one place') ||
          document.body.textContent.includes('Live data from your connected apps') ||
          document.body.textContent.includes('You see only your own data'),
      );
      check('login visuals 1440: old panel copy gone', !oldPanelCopy);
    } else {
      const wave = await page.evaluate(() => !!document.querySelector('svg[data-wave]'));
      check('login visuals 375: wave band present', wave);
      await page.waitForFunction(() => !document.querySelector('img[src*="logo-color.png"]'), { timeout: 5000 }).catch(() => {});
      const colorLogoGone = await page.evaluate(() => !document.querySelector('img[src*="logo-color.png"]'));
      check('login visuals 375: color logo falls back when it cannot load', colorLogoGone);
    }
    const ov = await overflowCheck(page);
    check(`login visuals ${width}: no horizontal overflow`, !ov.overflow, `scrollWidth=${ov.scrollWidth} innerWidth=${ov.innerWidth}`);
    await ctx.close();
  }

  // ---- 26. No sentence under any title (Mahadi 2026-11-20) ----
  // No sentence under ANY title — page titles AND section titles —
  // on every page: Home, Dashboard, Leads, Learning, Calculators,
  // Proposals, Profile. The titles themselves stay. Checked
  // structurally (no <p class="mt-1 ..."> directly after the h1 —
  // the subtitle's exact shape) and by text (none of the removed
  // strings appears anywhere on the page): the old page subtitles,
  // the section subtitles (team totals, "Everything opens in this
  // tab", leaders, Due Premium month-to-date), the demo/live notes,
  // "Live from …", Last synced, the Proposals callout, the console
  // note, the login subtitle + panel sub, and the reworded
  // loading/error strings. Card sub-values and scope labels are
  // kept — they are data, not title sentences.
  const REMOVED_SUBTITLES = [
    // Old page-title subtitles.
    'Here is your day at a glance.',
    'Live data from your connected apps.',
    'Live data from your connected apps',
    'Demo view for this role — real data arrives in a later milestone.',
    'Sales business, dues and persistency — scoped to what you can see.',
    'Your leads, follow-ups and reminders live in LeadFlow.',
    'Your courses, quizzes and certificates live in the Learning Hub.',
    'Premium, SDPP and income calculators.',
    'Proposal submission stays with the official agent portal (IT-owned).',
    // Section subtitles.
    'Team totals for your downline.',
    'Everything opens in this tab.',
    'By total premium · your direct reports',
    'By total premium · org-wide',
    'Due Premium is month-to-date',
    // Old Due widget heading (split into Upcoming / Overdue columns).
    'Recent dues',
    // Demo / live notes, badges, synced lines.
    'DEMO DATA',
    'Demo data — fictional figures for the preview.',
    'Demo data — live lead data arrives with the LeadFlow connection in a later milestone.',
    'Demo data — live learning data arrives with the Learning Hub connection in a later milestone.',
    'Demo data — live dues arrive with the Due & Lapse connection in a later milestone.',
    'Live lead data from LeadFlow.',
    'Live learning data from the Learning Hub.',
    'Live from LeadFlow',
    'Live from Learning Hub',
    'Live from Retail Sales Dashboard',
    'Live dues for this month from the Retail Sales Dashboard.',
    'Last synced',
    'Showing 5 of 31 dues',
    'Due this week',
    // Proposals callout + console note + login subtitle/panel sub.
    'The production portal link is not confirmed yet.',
    'Console in a later milestone',
    'One login for all your tools',
    'Leads, learning, calculators and sales — together in one place, with your data only.',
    // Reworded loading / error strings (the "live" wording is gone).
    'Loading live dashboard…',
    'Could not load the live dashboard.',
    'Loading live data…',
    'Could not load live data.',
    // Old login panel copy (replaced by the lead-to-sale copy).
    'One login. Every field tool.',
    'Leads, learning & sales in one place',
    'You see only your own data — and your team’s',
  ];
  const checkNoSubtitle = async (page, name, width) => {
    await page.waitForSelector('h1', { timeout: 5000 });
    const sub = await page.evaluate((removed) => {
      const h1 = document.querySelector('h1');
      const next = h1?.nextElementSibling;
      const subtitleEl = next?.tagName === 'P' && next.className.includes('mt-1');
      const body = document.body.textContent;
      return {
        h1: h1?.textContent?.trim() ?? null,
        subtitleEl: !!subtitleEl,
        found: removed.filter((s) => body.includes(s)),
      };
    }, REMOVED_SUBTITLES);
    check(
      `no subtitle ${name} ${width}: title present, no h1-adjacent subtitle, no removed text`,
      sub.h1 !== null && !sub.subtitleEl && sub.found.length === 0,
      JSON.stringify(sub),
    );
  };
  for (const width of [375, 1440]) {
    const { ctx, page } = await newPage(browser, width);
    await login(page, '9990002');
    await page.waitForFunction(() => document.body.textContent.includes('Test Team Lead'), { timeout: 5000 });
    await checkNoSubtitle(page, 'Home', width);
    await clickNav(page, 'ড্যাশবোর্ড', 'Dashboard');
    await checkNoSubtitle(page, 'Dashboard', width);
    await clickNav(page, 'লিডস', 'Leads');
    await checkNoSubtitle(page, 'Leads', width);
    await clickNav(page, 'লার্নিং', 'Learning');
    await checkNoSubtitle(page, 'Learning', width);
    await clickNav(page, 'ক্যালকুলেটর', 'Calculators');
    await checkNoSubtitle(page, 'Calculators', width);
    await clickNav(page, 'প্রপোজাল', 'Proposals');
    await checkNoSubtitle(page, 'Proposals', width);
    await page.evaluate(() => {
      [...document.querySelectorAll('button')].find((b) => b.textContent.includes('প্রোফাইল') || b.textContent.includes('Profile'))?.click();
    });
    await checkNoSubtitle(page, 'Profile', width);
    const ov = await overflowCheck(page);
    check(`no subtitle ${width}: no horizontal overflow on Profile`, !ov.overflow, `scrollWidth=${ov.scrollWidth} innerWidth=${ov.innerWidth}`);
    await ctx.close();
  }

  // ---- 28. Android app download promo (Mahadi 2026-11-21) ----
  // Gate (src/data/appDownload.ts): Android UA + web (not the native
  // app) + not dismissed. The native case is simulated by injecting
  // window.androidBridge before load — that is exactly the signal
  // Capacitor's isNativePlatform() reads (getPlatformId checks
  // win.androidBridge), so the app takes the same path it takes in
  // the real shell. The Download href is the Hub download route
  // (/api/download-apk — it redirects to the newest release APK) —
  // the same constant the login link uses.
  const ANDROID_UA =
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
  const IOS_UA =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
  const APK_URL = 'https://shanta-life-agent-hub.vercel.app/api/download-apk';
  const stubNativeBridge = (page) =>
    page.evaluateOnNewDocument(() => {
      window.androidBridge = { postMessage: () => {} };
    });
  // The popup appears 1.2s after Home mounts; the splash is gone by
  // ~1s — so 2s past the splash is safely past the trigger.
  const waitPastPromoTrigger = async (page) => {
    await waitForSplashGone(page);
    await new Promise((r) => setTimeout(r, 2000));
  };

  // Android, signed in: popup appears, links right, no overflow.
  {
    const { ctx, page, errors } = await newPage(browser, 375);
    await page.setUserAgent(ANDROID_UA);
    await login(page, '9990001');
    await page.waitForFunction(() => document.body.textContent.includes('Test Agent'), { timeout: 5000 });
    const seen = await page
      .waitForSelector('[data-android-promo]', { timeout: 5000 })
      .then(() => true)
      .catch(() => false);
    check('promo android 375: popup appears after splash', seen);
    const href = await page.$eval('[data-android-promo-download]', (el) => el.getAttribute('href')).catch(() => null);
    check('promo android 375: download href is the Hub download route', href === APK_URL, href ?? 'none');
    const target = await page.$eval('[data-android-promo-download]', (el) => el.getAttribute('target')).catch(() => null);
    check('promo android 375: download opens in a new tab', target === '_blank', target ?? 'none');
    const ov = await overflowCheck(page);
    check('promo android 375: no horizontal overflow', !ov.overflow, `scrollWidth=${ov.scrollWidth} innerWidth=${ov.innerWidth}`);
    await page.screenshot({ path: path.join(QA_DIR, 'android-promo-375.png') });
    const appErrors = errors.filter((e) => !e.startsWith('Failed to load resource'));
    check('promo android 375: no console errors', appErrors.length === 0, appErrors.join(' | '));
    // Close dismisses and persists across a reload.
    await page.click('[data-android-promo-close]');
    await page.waitForFunction(() => !document.querySelector('[data-android-promo]'), { timeout: 3000 });
    const flag = await page.evaluate(() => localStorage.getItem('hub-android-promo-dismissed-v1'));
    check('promo android: close dismisses and sets the dismissal flag', flag === '1', flag);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitPastPromoTrigger(page);
    const backAfterReload = await page.evaluate(() => !!document.querySelector('[data-android-promo]'));
    check('promo android: stays dismissed after reload', !backAfterReload);
    await ctx.close();
  }

  // Tapping Download also dismisses (fresh context — flag not set).
  {
    const { ctx, page } = await newPage(browser, 375);
    await page.setUserAgent(ANDROID_UA);
    await login(page, '9990001');
    await page.waitForFunction(() => document.body.textContent.includes('Test Agent'), { timeout: 5000 });
    await page.waitForSelector('[data-android-promo]', { timeout: 5000 });
    await page.click('[data-android-promo-download]');
    await page.waitForFunction(() => !document.querySelector('[data-android-promo]'), { timeout: 3000 });
    const flag = await page.evaluate(() => localStorage.getItem('hub-android-promo-dismissed-v1'));
    check('promo android: Download tap dismisses and sets the dismissal flag', flag === '1', flag);
    // The tap opens the APK URL in a new tab (no network here — it
    // just sits there); close it so the context is clean.
    for (const p of await ctx.pages()) {
      if (p !== page) await p.close().catch(() => {});
    }
    await ctx.close();
  }

  // Hidden: iOS, native shell, desktop.
  {
    const { ctx, page } = await newPage(browser, 375);
    await page.setUserAgent(IOS_UA);
    await login(page, '9990001');
    await page.waitForFunction(() => document.body.textContent.includes('Test Agent'), { timeout: 5000 });
    await waitPastPromoTrigger(page);
    const shown = await page.evaluate(() => !!document.querySelector('[data-android-promo]'));
    check('promo ios 375: hidden on iOS', !shown);
    await ctx.close();
  }
  {
    const { ctx, page, errors } = await newPage(browser, 375);
    await page.setUserAgent(ANDROID_UA);
    await stubNativeBridge(page);
    await login(page, '9990001');
    await page.waitForFunction(() => document.body.textContent.includes('Test Agent'), { timeout: 5000 });
    await waitPastPromoTrigger(page);
    const shown = await page.evaluate(() => !!document.querySelector('[data-android-promo]'));
    check('promo native 375: hidden inside the native app', !shown);
    const appErrors = errors.filter((e) => !e.startsWith('Failed to load resource'));
    check('promo native 375: no console errors', appErrors.length === 0, appErrors.join(' | '));
    await ctx.close();
  }
  {
    const { ctx, page } = await newPage(browser, 375);
    await login(page, '9990001');
    await page.waitForFunction(() => document.body.textContent.includes('Test Agent'), { timeout: 5000 });
    await waitPastPromoTrigger(page);
    const shown = await page.evaluate(() => !!document.querySelector('[data-android-promo]'));
    check('promo desktop 375: hidden on desktop', !shown);
    await ctx.close();
  }

  // BN strings with hub-lang=bn. The language is seeded via
  // evaluateOnNewDocument (before any app script runs, on every
  // navigation): setting it with a plain evaluate after goto is
  // racy — the app's i18n effect writes its mounted language back
  // to localStorage and can clobber the seed before the login
  // navigation (this failed intermittently as 346/347).
  {
    const { ctx, page } = await newPage(browser, 375);
    await page.setUserAgent(ANDROID_UA);
    await page.evaluateOnNewDocument(() => localStorage.setItem('hub-lang', 'bn'));
    await login(page, '9990001');
    await page.waitForFunction(() => document.body.textContent.includes('Test Agent'), { timeout: 5000 });
    const seen = await page
      .waitForSelector('[data-android-promo]', { timeout: 5000 })
      .then(() => true)
      .catch(() => false);
    const bnText = await page.evaluate(() => document.querySelector('[data-android-promo]')?.textContent ?? '');
    const htmlLang = await page.evaluate(() => document.documentElement.lang);
    check(
      'promo bn 375: Bangla title and body render',
      seen && bnText.includes('অ্যান্ড্রয়েড অ্যাপটি নিন') && bnText.includes('হোম স্ক্রিন থেকে এক ট্যাপে'),
      `lang=${htmlLang} ${bnText.slice(0, 120)}`,
    );
    await page.screenshot({ path: path.join(QA_DIR, 'android-promo-bn-375.png') });
    await ctx.close();
  }

  // Login page popup (Mahadi 2026-11-21): Android web visitors are
  // asked BEFORE they sign in, not only after. Same gate and same
  // dismissal flag as Home — dismissing on login hides it on Home too.
  {
    const { ctx, page, errors } = await newPage(browser, 375);
    await page.setUserAgent(ANDROID_UA);
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await waitForSplashGone(page);
    await page.waitForSelector('#employee-id', { timeout: 5000 });
    const seen = await page
      .waitForSelector('[data-android-promo]', { timeout: 5000 })
      .then(() => true)
      .catch(() => false);
    check('promo login android 375: popup appears before sign-in', seen);
    const href = await page.$eval('[data-android-promo-download]', (el) => el.getAttribute('href')).catch(() => null);
    check('promo login android 375: download href is the Hub download route', href === APK_URL, href ?? 'none');
    const ov = await overflowCheck(page);
    check('promo login android 375: no horizontal overflow', !ov.overflow, `scrollWidth=${ov.scrollWidth} innerWidth=${ov.innerWidth}`);
    await page.screenshot({ path: path.join(QA_DIR, 'login-promo-375.png') });
    const appErrors = errors.filter((e) => !e.startsWith('Failed to load resource'));
    check('promo login android 375: no console errors', appErrors.length === 0, appErrors.join(' | '));
    // Dismiss on login, then sign in — the popup must stay gone on Home.
    await page.click('[data-android-promo-close]');
    await page.waitForFunction(() => !document.querySelector('[data-android-promo]'), { timeout: 3000 });
    const flag = await page.evaluate(() => localStorage.getItem('hub-android-promo-dismissed-v1'));
    check('promo login android: close dismisses and sets the dismissal flag', flag === '1', flag);
    await login(page, '9990001');
    await page.waitForFunction(() => document.body.textContent.includes('Test Agent'), { timeout: 5000 });
    await waitPastPromoTrigger(page);
    const backOnHome = await page.evaluate(() => !!document.querySelector('[data-android-promo]'));
    check('promo login android: dismissing on login hides it on Home too', !backOnHome);
    await ctx.close();
  }
  {
    const { ctx, page } = await newPage(browser, 375);
    await page.setUserAgent(IOS_UA);
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await waitForSplashGone(page);
    await page.waitForSelector('#employee-id', { timeout: 5000 });
    await new Promise((r) => setTimeout(r, 2000));
    const shown = await page.evaluate(() => !!document.querySelector('[data-android-promo]'));
    check('promo login ios 375: hidden on iOS', !shown);
    await ctx.close();
  }

  // Login page link: Android only, same APK href.
  for (const [label, ua, native, expect] of [
    ['android', ANDROID_UA, false, true],
    ['ios', IOS_UA, false, false],
    ['native', ANDROID_UA, true, false],
    ['desktop', null, false, false],
  ]) {
    const { ctx, page } = await newPage(browser, 375);
    if (ua) await page.setUserAgent(ua);
    if (native) await stubNativeBridge(page);
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await waitForSplashGone(page);
    await page.waitForSelector('#employee-id', { timeout: 5000 });
    const link = await page.evaluate(() => {
      const a = document.querySelector('[data-android-download-link]');
      return a ? { href: a.getAttribute('href'), target: a.getAttribute('target') } : null;
    });
    if (expect) {
      check(`login link ${label}: present with the Hub download-route href`, link?.href === APK_URL, link?.href ?? 'none');
      check(`login link ${label}: opens in a new tab`, link?.target === '_blank', link?.target ?? 'none');
      await page.screenshot({ path: path.join(QA_DIR, 'login-android-375.png') });
    } else {
      check(`login link ${label}: absent`, link === null, link?.href ?? '');
    }
    await ctx.close();
  }

  // ---- 29. FCM push notifications (Mahadi 2026-11-21) ----
  // Pure routing through the REAL pushRouting module (bundled above).
  // Native push itself (permission, registration, tap delivery) cannot
  // run in headless Chrome — it needs the device build — so this
  // section proves the parts that CAN be proven here: topic names,
  // tap targets, the subscribe route's auth + graceful degradation,
  // and that the web bundle never pays for the plugin.
  {
    const { userPushTopic, resolvePushTarget } = pushRouting;
    const LF = 'https://lead-flow-jet.vercel.app';
    const LH = 'https://shanta-life-learning-hub.vercel.app';
    check("push topic: '2025019' → user-2025019", userPushTopic('2025019') === 'user-2025019', userPushTopic('2025019') ?? 'null');
    check("push topic: whitespace is trimmed", userPushTopic('  2025019  ') === 'user-2025019', userPushTopic('  2025019  ') ?? 'null');
    check('push topic: empty → null', userPushTopic('') === null);
    check('push topic: whitespace-only → null', userPushTopic('   ') === null);
    check("push topic: slash → null", userPushTopic('abc/def') === null);
    check("push topic: space → null", userPushTopic('user 1') === null);
    check('push topic: non-string → null', userPushTopic(123) === null);
    check('push route: leadflow → LeadFlow URL', resolvePushTarget({ source: 'leadflow' }) === LF, resolvePushTarget({ source: 'leadflow' }));
    check('push route: learning → Learning Hub URL', resolvePushTarget({ source: 'learning' }) === LH, resolvePushTarget({ source: 'learning' }));
    check('push route: module fallback (no source)', resolvePushTarget({ module: 'leadflow' }) === LF, resolvePushTarget({ module: 'leadflow' }));
    check("push route: 'learning-hub' alias", resolvePushTarget({ source: 'learning-hub' }) === LH, resolvePushTarget({ source: 'learning-hub' }));
    check('push route: relative route is appended', resolvePushTarget({ source: 'leadflow', route: '/workbench' }) === `${LF}/workbench`, resolvePushTarget({ source: 'leadflow', route: '/workbench' }));
    check('push route: route with query is appended', resolvePushTarget({ source: 'learning', route: '/courses/abc?x=1' }) === `${LH}/courses/abc?x=1`, resolvePushTarget({ source: 'learning', route: '/courses/abc?x=1' }));
    check('push route: absolute URL route is ignored', resolvePushTarget({ source: 'leadflow', route: 'https://evil.example.com/x' }) === LF, resolvePushTarget({ source: 'leadflow', route: 'https://evil.example.com/x' }));
    check('push route: protocol-relative route is ignored', resolvePushTarget({ source: 'leadflow', route: '//evil.example.com/x' }) === LF, resolvePushTarget({ source: 'leadflow', route: '//evil.example.com/x' }));
    check('push route: fragment is stripped from the route', resolvePushTarget({ source: 'leadflow', route: '/a#b' }) === `${LF}/a`, resolvePushTarget({ source: 'leadflow', route: '/a#b' }));
    check("push route: unknown source → Home '/'", resolvePushTarget({ source: 'unknown' }) === '/', resolvePushTarget({ source: 'unknown' }));
    check("push route: empty data → Home '/'", resolvePushTarget({}) === '/', resolvePushTarget({}));
    check("push route: null data → Home '/'", resolvePushTarget(null) === '/', resolvePushTarget(null));
  }

  // The subscribe route handler, imported directly (plain Node ESM —
  // no bundling needed). The Firebase project does not exist yet, so
  // no service account is configured in this process: the success
  // path is untestable here, and the 503 graceful-degradation path is
  // exactly what must hold until the project exists.
  {
    delete process.env.FIREBASE_SERVICE_ACCOUNT_B64;
    const { default: pushSubscribe } = await import(pathToFileURL(path.join(ROOT, 'api', 'push-subscribe.js')).href);
    const fakeRes = () => {
      const res = { statusCode: null, headers: {}, body: null };
      res.setHeader = (k, v) => { res.headers[k] = v; };
      res.status = (code) => { res.statusCode = code; return res; };
      res.json = (obj) => { res.body = obj; return res; };
      res.end = () => res;
      return res;
    };
    const validToken = await jwtNode.signSsoToken({ sub: '9990001', name: 'Test Agent', role: 'employee' }, privateB64);
    const authHeader = { authorization: `Bearer ${validToken}` };

    let res = fakeRes();
    await pushSubscribe({ method: 'POST', headers: {}, body: { token: 'fcm-token-123' } }, res);
    check('push-subscribe: no auth → 401', res.statusCode === 401, String(res.statusCode));

    res = fakeRes();
    await pushSubscribe({ method: 'POST', headers: { authorization: 'Bearer not-a-token' }, body: { token: 'fcm-token-123' } }, res);
    check('push-subscribe: bad token → 401', res.statusCode === 401, String(res.statusCode));

    res = fakeRes();
    await pushSubscribe({ method: 'POST', headers: authHeader, body: {} }, res);
    check('push-subscribe: valid JWT + missing FCM token → 400', res.statusCode === 400, String(res.statusCode));

    res = fakeRes();
    await pushSubscribe({ method: 'GET', headers: authHeader, body: {} }, res);
    check('push-subscribe: GET → 405', res.statusCode === 405, String(res.statusCode));

    res = fakeRes();
    await pushSubscribe({ method: 'POST', headers: authHeader, body: { token: 'fcm-token-123' } }, res);
    check(
      'push-subscribe: valid JWT + valid body, no service account → 503 push_not_configured',
      res.statusCode === 503 && res.body?.error === 'push_not_configured',
      `${res.statusCode} ${JSON.stringify(res.body)}`,
    );
  }

  // Bundle split (local QA only — HUB_QA_URL mode has no local dist):
  // the eager index chunk must not contain the plugin at all — the
  // dynamic import keeps it in a lazy chunk. The canary is the
  // plugin's registration call (`"PushNotifications",{}`): it exists
  // only in the plugin's registration chunk (push.ts references the
  // plugin by property name, never by that call), so its absence from
  // the index chunk + presence in some lazy chunk proves the split.
  // And in this harness there is no Capacitor runtime at all, so the
  // native guard is false.
  if (LOCAL_QA) {
    const assetFiles = fs.readdirSync(path.join(ROOT, 'dist', 'assets')).filter((f) => f.endsWith('.js'));
    const indexFile = assetFiles.find((f) => f.startsWith('index-'));
    const indexText = indexFile ? fs.readFileSync(path.join(ROOT, 'dist', 'assets', indexFile), 'utf8') : '';
    const lazyTexts = assetFiles
      .filter((f) => f !== indexFile)
      .map((f) => fs.readFileSync(path.join(ROOT, 'dist', 'assets', f), 'utf8'));
    check(
      "push bundle: eager index chunk has no '@capacitor/push-notifications' specifier",
      indexFile !== undefined && !indexText.includes('@capacitor/push-notifications'),
      indexFile ?? 'no index chunk',
    );
    check(
      'push bundle: eager index chunk has no plugin registration call ("PushNotifications",{})',
      indexFile !== undefined && !indexText.includes('"PushNotifications",{}'),
      indexFile ?? 'no index chunk',
    );
    check(
      'push bundle: a lazy chunk carries the plugin registration (dynamic import split it out)',
      lazyTexts.some((t) => t.includes('"PushNotifications",{}')),
      `${lazyTexts.length} lazy chunk(s)`,
    );
  }
  {
    // window.Capacitor IS defined in any browser (the core always
    // installs the global) — what the native guard actually checks is
    // isNativePlatform(), i.e. the native bridge's presence. That is
    // what this check asserts: the function exists and returns false.
    const { ctx, page } = await newPage(browser, 375);
    await login(page, '9990001');
    await page.waitForFunction(() => document.body.textContent.includes('Test Agent'), { timeout: 5000 });
    const probe = await page.evaluate(() => {
      const cap = window.Capacitor;
      if (!cap || typeof cap.isNativePlatform !== 'function') return 'missing';
      return cap.isNativePlatform() ? 'native' : 'web';
    });
    check('push web: Capacitor reports non-native in the browser harness (native guard is false)', probe === 'web', probe);
    await ctx.close();
  }
} finally {
  await browser.close();
  for (const dir of [jwtBundleDir, pushBundleDir, prodTmp, stubTmpDir]) {
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  }
}

summarizeAndExit(results.some((r) => !r.ok) ? 1 : 0);
