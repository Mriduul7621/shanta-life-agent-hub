/**
 * Milestone 3 QA — headless-Chrome checks for the Agent Hub.
 *
 * Usage: `npm run qa` — the script performs its own demo-enabled build
 * (HUB_BUILD_TARGET=qa + VITE_DEMO_AUTH=true, script-forced) so it passes
 * from a fresh clone. Plain `npm run build` still respects `.env` and
 * defaults to the production target (see vite.config.ts).
 *
 * Runs against the PRODUCTION build via file:// — the VM's Chrome build
 * hard-blocks loopback navigation (ERR_BLOCKED_BY_LOCAL_NETWORK_ACCESS_CHECKS;
 * the standard --disable-features flag does not lift it), so the dev server
 * cannot be driven by headless Chrome here. The app uses a relative Vite base
 * so the same build also runs from file:// and, later, from a Capacitor
 * webview. Override with HUB_QA_URL to point at a live server instead — in
 * that mode only the Milestone 1 browser checks run (the M2 checks need the
 * local QA build). The handoff test navigates same-tab to a temp file://
 * stub fixture, so it needs no loopback server at all.
 *
 * NOTE (Retail Dashboard): this VM's headless Chrome has no external network
 * and there is no /api/retail-data proxy under file://, so the Dashboard's
 * live fetch cannot succeed here — the dashboard QA below asserts the page
 * reaches a terminal state (live KPIs OR the error state with retry + the
 * retail-dashboard link) and records which path was taken. The ready state
 * is verified against a synthetic session cache seeded with the demo
 * fixture summary (computed by the Hub's own summarizer, api/_lib). The
 * live path itself is verified by `npm run qa:retail-live`, which runs
 * the Hub's own summarizer + proxy handler against the real retail
 * endpoint payload from Node.
 *
 * Checks (Milestone 1 — 33, unchanged):
 *  1. Login page loads with no console errors.
 *  2. All 4 demo roles can sign in; a JWT is issued with the documented claims.
 *  3. 5 wrong PINs lock the account (15-minute lockout message).
 *  4. 9990001 first-login forced PIN change works; the new PIN signs in after.
 *  5. Sign-out clears the session token.
 *  6. EN/BN switch changes UI strings.
 *  7. Role views differ (team section only for Team Lead / Manager; Admin sees
 *     the console placeholder on Profile).
 *  8. Screenshots: login + home + profile + dashboard at 375 / 768 / 1440 px,
 *     plus one home screenshot per role at 1440 px. Each shot also checks for
 *     horizontal overflow (scrollWidth > innerWidth). (Dashboard shots are
 *     Milestone 3 — 3 of its 22 checks.)
 *
 * Checks (Milestone 2 — 31):
 *  9. Key sanity: the signing private key matches the public key QA
 *     verifies with; the kid is the SHA-256(DER) derivation.
 * 10. The QA build itself succeeds (qa target, demo on, stub override).
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
 * 15. Production-target guard: a production build with demo auth FAILS, a
 *     production build with a signing key FAILS, and a clean production
 *     build (temp copy, no .env) succeeds with no demo users and sign-in
 *     failing closed.
 *
 * Checks (Retail Dashboard — 40):
 * 16. Dashboard page: heading is "Retail Sales Dashboard", reaches a
 *     terminal state (live KPIs, empty state or error state with retry),
 *     has a Refresh button, links to the Retail Sales Dashboard, and
 *     carries no link to the removed SCC tile.
 * 16b. Dashboard ready state (Team Lead): renders against a synthetic
 *     session cache seeded with the demo fixture summary — exact figures
 *     for all 6 KPIs, the Top team members leaderboard, the DEMO badge,
 *     the scope label, and the cached-while-refreshing banner.
 * 16c. Dashboard role views: Employee sees own data only (no leaderboard);
 *     Admin sees Top Business Executives + the Unassigned line + Org-wide;
 *     an empty scope shows the empty state with the no-code note and no
 *     KPI cards.
 * 17. Due-premium widget: present on Home with the DEMO badge + note and
 *     demo rows for Team Lead; "showing 5 of 31" for Manager team; empty
 *     state for Admin.
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
 *     Leads/Learning pages show a DEMO summary strip (exact demo figures)
 *     + a same-tab Go button and no ModuleTile; Calculators/Proposals
 *     pages are unchanged (tiles only, no summary, no Go button).
 * 20b. Leads/Learning pages at 375 px: no horizontal overflow, with
 *     screenshots (device gate; 1440 px shots are taken in §20).
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
// Retail Dashboard QA: the demo fixture summary is computed by the Hub's
// OWN summarizer (api/_lib — pure, no Node/browser APIs), so the seeded
// cache is exactly what the proxy would return for a demo user.
import { summarizeRetail } from '../api/_lib/retailSummary.js';
import { buildDemoPayload } from '../api/_lib/demoFixture.js';

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
// Key resolution. QA needs the private key that signs demo tokens and the
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

// ---- 10. QA's own demo-enabled build (local QA only) ----
if (LOCAL_QA) {
  const qaBuild = runBuild(ROOT, {
    ...process.env,
    HUB_BUILD_TARGET: 'qa',
    VITE_DEMO_AUTH: 'true',
    VITE_JWT_PRIVATE_KEY_B64: privateB64,
    VITE_MODULE_URL_OVERRIDES: JSON.stringify({ premiumpulse: STUB_URL }),
    ...extraBuildEnv,
  });
  check('qa build succeeds (HUB_BUILD_TARGET=qa, demo on, stub override)', qaBuild.status === 0, qaBuild.status === 0 ? '' : qaBuild.output.slice(-500));
  if (qaBuild.status !== 0) {
    console.log(qaBuild.output);
    summarizeAndExit(1);
  }
}

// ---- Bundle the app's jwt.ts for Node (negative-case tests use the REAL code) ----
let jwtNode = null;
let jwtBundleDir = null;
if (LOCAL_QA) {
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

async function login(page, id, pin) {
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await page.waitForSelector('#employee-id', { timeout: 10000 });
  await page.type('#employee-id', id);
  await page.type('#pin', pin);
  await page.click('button[type="submit"]');
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
      document.body.textContent.includes('লাইভ ড্যাশবোর্ড লোড করা যায়নি') ||
      document.body.textContent.includes('Could not load the live dashboard') ||
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
 * The demo fixture summary the proxy would return for a demo user — used
 * to seed the Dashboard's session cache (hub-retail-cache-v1) so the
 * ready state can be verified without the proxy. Values are the
 * hand-computed fixture expectations (see scripts/qa-retail-live.mjs).
 * The fixture scenario is PINNED to 2026-11-20: its due expectations
 * depend on instalment dates relative to the reference day, so pinning
 * keeps the seeded values deterministic whatever day the suite runs.
 */
const FIXTURE_TODAY = '2026-11-20';
function demoSummaryFor(employeeId, role) {
  const summary = summarizeRetail(buildDemoPayload(FIXTURE_TODAY), { employeeId, role }, FIXTURE_TODAY);
  summary.demo = true; // the proxy marks fixture summaries demo: true
  return summary;
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

// The issued token from the 9990002 login, reused by the RS256 checks.
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
    check('login page: no console errors', errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  // ---- 2. All 4 roles sign in; JWT claims ----
  const roleCases = [
    { id: '9990001', role: 'employee', name: 'Demo Agent', mustChange: true },
    { id: '9990002', role: 'team_lead', name: 'Demo Team Lead', mustChange: false },
    { id: '9990003', role: 'manager', name: 'Demo Manager', mustChange: false },
    { id: '9990004', role: 'admin', name: 'Demo Admin', mustChange: false },
  ];
  for (const c of roleCases) {
    const { ctx, page, errors } = await newPage(browser, 1440);
    await login(page, c.id, '123456');
    if (c.mustChange) {
      await page.waitForSelector('#new-pin', { timeout: 5000 });
      check(`login ${c.id}: forced PIN-change screen shown`, true);
      await page.type('#new-pin', '654321');
      await page.type('#confirm-pin', '654321');
      await page.click('button[type="submit"]');
    }
    await page.waitForFunction(
      () => document.body.textContent.includes('DEMO DATA') || document.body.textContent.includes('ডেমো ডেটা'),
      { timeout: 5000 },
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

  // ---- 3. Lockout after 5 wrong PINs ----
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
    check('lockout: 5 wrong PINs locks account', /লক|lock/i.test(alert), alert);
    await ctx.close();
  }

  // ---- 4. Must-change flow: new PIN works on next sign-in ----
  {
    const { ctx, page } = await newPage(browser, 1440);
    await login(page, '9990001', '123456');
    await page.waitForSelector('#new-pin', { timeout: 5000 });
    await page.type('#new-pin', '654321');
    await page.type('#confirm-pin', '654321');
    await page.click('button[type="submit"]');
    await page.waitForFunction(() => document.body.textContent.includes('Demo Agent'), { timeout: 5000 });
    // Sign out via Profile, then sign back in with the NEW pin.
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
    await login(page, '9990001', '654321');
    await page.waitForFunction(() => document.body.textContent.includes('Demo Agent'), { timeout: 5000 });
    const forceChangeGone = (await page.$('#new-pin')) === null;
    check('must-change: new PIN signs in without re-prompting', forceChangeGone);
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
    await login(page, '9990002', '123456');
    await page.waitForFunction(() => document.body.textContent.includes('Demo Team Lead'), { timeout: 5000 });
    const teamLeadHasTeam = await page.evaluate(() => document.body.textContent.includes('আপনার টিম') || document.body.textContent.includes('Your team'));
    check('team lead home: team section present', teamLeadHasTeam);
    await ctx.close();
  }
  {
    const { ctx, page } = await newPage(browser, 1440);
    await login(page, '9990001', '123456');
    await page.waitForSelector('#new-pin', { timeout: 5000 });
    await page.type('#new-pin', '654321');
    await page.type('#confirm-pin', '654321');
    await page.click('button[type="submit"]');
    await page.waitForFunction(() => document.body.textContent.includes('Demo Agent'), { timeout: 5000 });
    const employeeHasTeam = await page.evaluate(() => document.body.textContent.includes('আপনার টিম') || document.body.textContent.includes('Your team'));
    check('employee home: NO team section', !employeeHasTeam);
    await ctx.close();
  }
  {
    const { ctx, page } = await newPage(browser, 1440);
    await login(page, '9990004', '123456');
    await page.waitForFunction(() => document.body.textContent.includes('Demo Admin'), { timeout: 5000 });
    await page.evaluate(() => {
      [...document.querySelectorAll('button')].find((b) => b.textContent.includes('প্রোফাইল') || b.textContent.includes('Profile'))?.click();
    });
    await page.waitForFunction(() => document.body.textContent.includes('টি অ্যান্ড ডি কনসোল') || document.body.textContent.includes('T&D Console'), { timeout: 5000 });
    check('admin profile: console placeholder present', true);
    const emptyState = await page.evaluate(() => document.body.textContent.includes('কোনো ফলো-আপ নেই') || document.body.textContent.includes('No follow-ups'));
    await page.evaluate(() => {
      [...document.querySelectorAll('button')].find((b) => b.textContent.includes('হোম') || b.textContent.includes('Home'))?.click();
    });
    await new Promise((r) => setTimeout(r, 500));
    const adminEmpty = await page.evaluate(
      () => document.body.textContent.includes('আজ কোনো ফলো-আপ নেই') || document.body.textContent.includes('No follow-ups due today'),
    );
    check('admin home: zero state says so plainly (never-empty rule)', adminEmpty, `profile-empty-check=${emptyState}`);
    await ctx.close();
  }

  // ---- 7. Screenshots at 375 / 768 / 1440 + overflow checks ----
  for (const width of [375, 768, 1440]) {
    const { ctx, page } = await newPage(browser, width);
    // Login
    await page.goto(BASE, { waitUntil: 'networkidle0' });
    await new Promise((r) => setTimeout(r, 300));
    const loginOv = await overflowCheck(page);
    check(`screenshot login-${width}: no horizontal overflow`, !loginOv.overflow, `scrollWidth=${loginOv.scrollWidth} innerWidth=${loginOv.innerWidth}`);
    await page.screenshot({ path: path.join(QA_DIR, `login-${width}.png`), fullPage: true });
    // Home as Team Lead (richest view: own + team widgets)
    await login(page, '9990002', '123456');
    await page.waitForFunction(() => document.body.textContent.includes('Demo Team Lead'), { timeout: 5000 });
    await new Promise((r) => setTimeout(r, 300));
    const homeOv = await overflowCheck(page);
    check(`screenshot home-${width}: no horizontal overflow`, !homeOv.overflow, `scrollWidth=${homeOv.scrollWidth} innerWidth=${homeOv.innerWidth}`);
    await page.screenshot({ path: path.join(QA_DIR, `home-${width}.png`), fullPage: true });
    // Profile
    await page.evaluate(() => {
      [...document.querySelectorAll('button')].find((b) => b.textContent.includes('প্রোফাইল') || b.textContent.includes('Profile'))?.click();
    });
    await new Promise((r) => setTimeout(r, 500));
    const profOv = await overflowCheck(page);
    check(`screenshot profile-${width}: no horizontal overflow`, !profOv.overflow, `scrollWidth=${profOv.scrollWidth} innerWidth=${profOv.innerWidth}`);
    await page.screenshot({ path: path.join(QA_DIR, `profile-${width}.png`), fullPage: true });
    // Dashboard (M3) — terminal state (live or error), overflow, screenshot
    await clickNav(page, 'ড্যাশবোর্ড', 'Dashboard');
    const dashPath = await waitForDashboardTerminal(page);
    await new Promise((r) => setTimeout(r, 300));
    const dashOv = await overflowCheck(page);
    check(`screenshot dashboard-${width}: no horizontal overflow (${dashPath})`, !dashOv.overflow, `scrollWidth=${dashOv.scrollWidth} innerWidth=${dashOv.innerWidth}`);
    await page.screenshot({ path: path.join(QA_DIR, `dashboard-${width}.png`), fullPage: true });
    await ctx.close();
  }

  // ---- 8. One home screenshot per role at 1440 ----
  const roleShots = [
    { id: '9990001', pin: '123456', file: 'home-employee-1440.png', mustChange: true },
    { id: '9990003', pin: '123456', file: 'home-manager-1440.png', mustChange: false },
    { id: '9990004', pin: '123456', file: 'home-admin-1440.png', mustChange: false },
  ];
  for (const s of roleShots) {
    const { ctx, page } = await newPage(browser, 1440);
    await login(page, s.id, s.pin);
    if (s.mustChange) {
      await page.waitForSelector('#new-pin', { timeout: 5000 });
      await page.type('#new-pin', '654321');
      await page.type('#confirm-pin', '654321');
      await page.click('button[type="submit"]');
    }
    await page.waitForFunction(() => document.body.textContent.includes('Demo'), { timeout: 5000 });
    await new Promise((r) => setTimeout(r, 300));
    await page.screenshot({ path: path.join(QA_DIR, s.file), fullPage: true });
    console.log(`SHOT  ${s.file}`);
    await ctx.close();
  }

  // ---- 16. Dashboard page (retail): terminal state, retail link, refresh ----
  {
    const { ctx, page, errors } = await newPage(browser, 1440);
    await login(page, '9990002', '123456');
    await page.waitForFunction(() => document.body.textContent.includes('Demo Team Lead'), { timeout: 5000 });
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
  // Seeded with the demo fixture summary for 9990002 (Team Lead), computed
  // by the Hub's own summarizer — the exact values the proxy returns:
  // total ৳1,64,000 · FYCP ৳1,56,000 · policies 7 · due ৳34,000 (4 pol) ·
  // persistency 83.3% (5/6) · active 2 of 3 · leaders Demo Agent ৳67,000,
  // Demo FA Eleven ৳57,000, Demo FA Twelve ৳15,000 · DEMO badge · scope
  // "Own + team". The background refresh fails here (no proxy under
  // file://), so the cached-while-refreshing banner must also show.
  {
    const { ctx, page, errors } = await newPage(browser, 1440);
    await login(page, '9990002', '123456');
    await page.waitForFunction(() => document.body.textContent.includes('Demo Team Lead'), { timeout: 5000 });
    await page.evaluate(
      (cache) => sessionStorage.setItem('hub-retail-cache-v1', JSON.stringify(cache)),
      { summary: demoSummaryFor('9990002', 'team_lead'), employeeId: '9990002', syncedAt: Date.now() },
    );
    await clickNav(page, 'ড্যাশবোর্ড', 'Dashboard');
    const dashPath = await waitForDashboardTerminal(page);
    check('dashboard (synthetic cache): ready state renders', dashPath === 'live', `path=${dashPath}`);
    // Wait for the background refresh to fail so the banner is visible.
    await page.waitForFunction(
      () => document.body.textContent.includes('Refresh failed') || document.body.textContent.includes('রিফ্রেশ ব্যর্থ'),
      { timeout: 10000 },
    ).catch(() => {});
    const body = await page.evaluate(() => document.body.textContent);
    // KPI values read per card (WidgetCard renders <section aria-label={title}>),
    // so a figure is attributed to its card — not just present somewhere.
    const kpis = await page.evaluate(() => {
      const out = {};
      for (const section of document.querySelectorAll('section[aria-label]')) {
        const value = section.querySelector('p.text-3xl');
        if (value) out[section.getAttribute('aria-label')] = value.textContent.trim();
      }
      return out;
    });
    check('dashboard ready: total premium ৳1,64,000', kpis['Total premium received'] === '৳1,64,000', JSON.stringify(kpis));
    check('dashboard ready: FYCP ৳1,56,000 + policies 7', kpis.FYCP === '৳1,56,000' && kpis.Policies === '7', JSON.stringify(kpis));
    check('dashboard ready: due premium ৳34,000', kpis['Due premium — this month'] === '৳34,000', JSON.stringify(kpis));
    check('dashboard ready: persistency 83.3%', kpis.Persistency === '83.3%', JSON.stringify(kpis));
    check('dashboard ready: active FAs 2 of 3', kpis['Active field FAs'] === '2 of 3', JSON.stringify(kpis));
    check('dashboard ready: due 4 policies + persistency 5 of 6 inforce', body.includes('4 policies') && body.includes('5 of 6 inforce'));
    check('dashboard ready: deferred/renewal subline', body.includes('Deferred 3.0%') && body.includes('Renewal 4.9%'));
    check('dashboard ready: leaders ranked (Demo Agent, Eleven, Twelve)', body.includes('Demo Agent') && body.includes('Demo FA Eleven') && body.includes('Demo FA Twelve'));
    check('dashboard ready: DEMO badge + note', body.includes('DEMO DATA') && body.includes('Demo data — fictional figures'));
    check('dashboard ready: scope label Own + team', body.includes('Own + team'));
    check('dashboard ready: cached-while-refreshing banner', body.includes('Refresh failed') || body.includes('রিফ্রেশ ব্যর্থ'));
    const readyOv = await overflowCheck(page);
    check('dashboard ready: no horizontal overflow', !readyOv.overflow, `scrollWidth=${readyOv.scrollWidth} innerWidth=${readyOv.innerWidth}`);
    await page.screenshot({ path: path.join(QA_DIR, 'dashboard-ready-1440.png'), fullPage: true });
    const appErrors = errors.filter((e) => !e.startsWith('Failed to load resource'));
    check('dashboard ready: no console errors', appErrors.length === 0, appErrors.join(' | '));
    await ctx.close();
  }

  // ---- 16c. Dashboard role views: Employee, Admin, empty scope ----
  // Employee (9990001): own data only — total ৳67,000, persistency 100.0%,
  // scope "Own data", and NO leaderboard section at all.
  {
    const { ctx, page } = await newPage(browser, 1440);
    await login(page, '9990001', '123456');
    await page.waitForSelector('#new-pin', { timeout: 5000 });
    await page.type('#new-pin', '654321');
    await page.type('#confirm-pin', '654321');
    await page.click('button[type="submit"]');
    await page.waitForFunction(() => document.body.textContent.includes('Demo Agent'), { timeout: 5000 });
    await page.evaluate(
      (cache) => sessionStorage.setItem('hub-retail-cache-v1', JSON.stringify(cache)),
      { summary: demoSummaryFor('9990001', 'employee'), employeeId: '9990001', syncedAt: Date.now() },
    );
    await clickNav(page, 'ড্যাশবোর্ড', 'Dashboard');
    const dashPath = await waitForDashboardTerminal(page);
    check('dashboard (employee): ready state renders', dashPath === 'live', `path=${dashPath}`);
    const body = await page.evaluate(() => document.body.textContent);
    check('dashboard (employee): own total ৳67,000 + persistency 100.0%', body.includes('৳67,000') && body.includes('100.0%'));
    check('dashboard (employee): scope label Own data', body.includes('Own data'));
    check('dashboard (employee): no leaderboard section', !body.includes('Top team members') && !body.includes('Top Business Executives') && !body.includes('শীর্ষ টিম মেম্বার') && !body.includes('শীর্ষ বিজনেস এক্সিকিউটিভ'));
    await ctx.close();
  }
  // Admin (9990004): org-wide — Top Business Executives with Demo BE
  // ৳2,34,000, the Unassigned line ৳7,000, scope "Org-wide".
  {
    const { ctx, page } = await newPage(browser, 1440);
    await login(page, '9990004', '123456');
    await page.waitForFunction(() => document.body.textContent.includes('Demo Admin'), { timeout: 5000 });
    await page.evaluate(
      (cache) => sessionStorage.setItem('hub-retail-cache-v1', JSON.stringify(cache)),
      { summary: demoSummaryFor('9990004', 'admin'), employeeId: '9990004', syncedAt: Date.now() },
    );
    await clickNav(page, 'ড্যাশবোর্ড', 'Dashboard');
    const dashPath = await waitForDashboardTerminal(page);
    check('dashboard (admin): ready state renders', dashPath === 'live', `path=${dashPath}`);
    const body = await page.evaluate(() => document.body.textContent);
    check('dashboard (admin): Top Business Executives + Demo BE ৳2,34,000', body.includes('Top Business Executives') && body.includes('Demo BE') && body.includes('৳2,34,000'));
    check('dashboard (admin): Unassigned line ৳7,000', body.includes('Unassigned') && body.includes('৳7,000'));
    check('dashboard (admin): scope label Org-wide', body.includes('Org-wide'));
    await ctx.close();
  }
  // Empty scope: the empty state with the no-code note — and no KPI cards.
  {
    const { ctx, page } = await newPage(browser, 1440);
    await login(page, '9990001', '123456');
    await page.waitForSelector('#new-pin', { timeout: 5000 });
    await page.type('#new-pin', '654321');
    await page.type('#confirm-pin', '654321');
    await page.click('button[type="submit"]');
    await page.waitForFunction(() => document.body.textContent.includes('Demo Agent'), { timeout: 5000 });
    const emptySummary = demoSummaryFor('9990001', 'employee');
    emptySummary.empty = true;
    emptySummary.emptyReason = 'no-code';
    await page.evaluate(
      (cache) => sessionStorage.setItem('hub-retail-cache-v1', JSON.stringify(cache)),
      { summary: emptySummary, employeeId: '9990001', syncedAt: Date.now() },
    );
    await clickNav(page, 'ড্যাশবোর্ড', 'Dashboard');
    const dashPath = await waitForDashboardTerminal(page);
    check('dashboard (empty scope): empty state renders', dashPath === 'empty', `path=${dashPath}`);
    const body = await page.evaluate(() => document.body.textContent);
    check('dashboard (empty scope): no-code note', body.includes('No producer code is linked to this Employee ID'));
    check('dashboard (empty scope): no KPI cards', !body.includes('Total premium received') && !body.includes('মোট প্রাপ্ত প্রিমিয়াম'));
    await ctx.close();
  }
  // ---- 17. Due-premium widget (M3) ----
  {
    const { ctx, page } = await newPage(browser, 1440);
    await login(page, '9990002', '123456');
    await page.waitForFunction(() => document.body.textContent.includes('Demo Team Lead'), { timeout: 5000 });
    const widget = await page.evaluate(() => {
      const sections = [
        ...document.querySelectorAll(
          'section[aria-label="বকেয়া প্রিমিয়াম"], section[aria-label="Due premiums"]',
        ),
      ];
      return { count: sections.length, text: sections[0] ? sections[0].textContent : '' };
    });
    check('due widget: present on team-lead home (own + team)', widget.count === 2, `sections=${widget.count}`);
    check(
      'due widget: DEMO badge + note',
      (widget.text.includes('DEMO DATA') && widget.text.includes('live dues')) ||
        (widget.text.includes('ডেমো ডেটা') && widget.text.includes('লাইভ বকেয়া')),
      widget.text.slice(0, 120),
    );
    check('due widget: demo rows with DEMO- policies', /DEMO-\d+/.test(widget.text));
    await ctx.close();
  }
  {
    const { ctx, page } = await newPage(browser, 1440);
    await login(page, '9990003', '123456');
    await page.waitForFunction(() => document.body.textContent.includes('Demo Manager'), { timeout: 5000 });
    const showing = await page.evaluate(
      () =>
        document.body.textContent.includes('31টি বকেয়ার মধ্যে 5টি') ||
        document.body.textContent.includes('Showing 5 of 31 dues'),
    );
    check('due widget (manager team): "showing 5 of 31" line', showing);
    await ctx.close();
  }
  {
    const { ctx, page } = await newPage(browser, 1440);
    await login(page, '9990004', '123456');
    await page.waitForFunction(() => document.body.textContent.includes('Demo Admin'), { timeout: 5000 });
    const adminWidget = await page.evaluate(() => {
      const el = document.querySelector(
        'section[aria-label="বকেয়া প্রিমিয়াম"], section[aria-label="Due premiums"]',
      );
      return el ? el.textContent : '';
    });
    check(
      'due widget (admin): empty state says so plainly',
      adminWidget.includes('এই সপ্তাহে কোনো প্রিমিয়াম বকেয়া নেই') ||
        adminWidget.includes('No premiums due this week'),
      adminWidget.slice(0, 120),
    );
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
      name: 'Demo Team Lead',
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
      { sub: '9990002', name: 'Demo Team Lead', role: 'team_lead' },
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
      await login(page, '9990002', '123456');
      await page.waitForFunction(() => document.body.textContent.includes('Demo Team Lead'), { timeout: 5000 });

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
                (document.getElementById('user-chip')?.textContent ?? '').includes('Demo Team Lead'),
            )
            .catch(() => false);
          handoffCheck('handoff: stub shows hub header + user chip', !!hubHeader, status);
          const hashAfter = await page.evaluate(() => window.location.hash).catch(() => '(unreadable)');
          handoffCheck('handoff: fragment stripped from the stub URL', hashAfter === '', `hash=${hashAfter}`);
          const stubErrors = errors.slice(errorsBeforeClick);
          handoffCheck('handoff: stub page has no console errors', stubErrors.length === 0, stubErrors.join(' | '));

          // Back to Hub: same-tab navigation back to the Hub home, still signed in.
          await page.evaluate(() => document.getElementById('back-to-hub')?.click());
          await page.waitForFunction(() => document.body.textContent.includes('Demo Team Lead'), { timeout: 10000 });
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
  if (LOCAL_QA) {
    const failDemo = runBuild(ROOT, { ...process.env, HUB_BUILD_TARGET: 'production', VITE_DEMO_AUTH: 'true' });
    check(
      'guard: production build with demo auth FAILS',
      failDemo.status !== 0 && /VITE_DEMO_AUTH=true/.test(failDemo.output),
      `exit=${failDemo.status}`,
    );
    const failSigning = runBuild(ROOT, {
      ...process.env,
      HUB_BUILD_TARGET: 'production',
      VITE_DEMO_AUTH: 'false',
      VITE_JWT_PRIVATE_KEY_B64: privateB64,
    });
    check(
      'guard: production build with signing key FAILS',
      failSigning.status !== 0 && /signing variable/.test(failSigning.output),
      `exit=${failSigning.status}`,
    );

    // Clean production build in a temp copy (no .env — fresh-clone shape) +
    // fail-closed login check against it.
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
      if (k.startsWith('VITE_') || k === 'HUB_BUILD_TARGET') delete prodEnv[k];
    }
    prodEnv.HUB_BUILD_TARGET = 'production';
    const prodBuild = runBuild(prodTmp, prodEnv);
    check('production build: clean demo-off build succeeds', prodBuild.status === 0, prodBuild.status === 0 ? '' : prodBuild.output.slice(-400));
    if (prodBuild.status === 0) {
      const prodBase = `file://${path.join(prodTmp, 'dist', 'index.html')}`;
      const { ctx, page } = await newPage(browser, 1440);
      await page.goto(prodBase, { waitUntil: 'networkidle0' });
      const demoShown = await page.evaluate(() => document.body.textContent.includes('9990001'));
      check('production build: no demo users shown', !demoShown);
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
      check('production build: no demo users shown', false, 'production build failed');
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
      await login(page, '9990002', '123456');
      await page.waitForFunction(() => document.body.textContent.includes('Demo Team Lead'), { timeout: 5000 });
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
      await login(page, '9990002', '123456');
      await page.waitForFunction(() => document.body.textContent.includes('Demo Team Lead'), { timeout: 5000 });
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
  // tools" — no group sections. Leads/Learning pages: DEMO summary strip
  // + Go button, no ModuleTile. Calculators/Proposals pages: unchanged.
  {
    const { ctx, page } = await newPage(browser, 1440);
    await login(page, '9990002', '123456');
    await page.waitForFunction(() => document.body.textContent.includes('Demo Team Lead'), { timeout: 5000 });
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

    // Stat values by label inside the Summary strip (own first, team second).
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

    // Leads page (Team Lead 9990002): own 4 follow-ups / 1 due, team 12 / 8.
    await clickNav(page, 'লিডস', 'Leads');
    await page.waitForFunction(() => document.body.textContent.includes('Go to Lead Management') || document.body.textContent.includes('লিড ম্যানেজমেন্টে যান'), { timeout: 5000 });
    const leadsSummary = await summaryInfo();
    check(
      'leads page: DEMO summary strip with the LeadFlow note',
      !!leadsSummary && leadsSummary.includes('DEMO DATA') && leadsSummary.includes('live lead data arrives with the LeadFlow connection'),
      leadsSummary ? leadsSummary.slice(0, 160) : 'no summary strip',
    );
    check('leads page: follow-ups 4 own + 12 team', JSON.stringify(await readStats("Today's follow-ups")) === JSON.stringify(['4', '12']));
    check('leads page: dues 1 own + 8 team', JSON.stringify(await readStats('Dues this week')) === JSON.stringify(['1', '8']));
    const leadsGo = await goButton('Go to Lead Management', 'লিড ম্যানেজমেন্টে যান');
    check(
      'leads page: Go button links same-tab to LeadFlow',
      leadsGo?.href === 'https://lead-flow-jet.vercel.app' && !leadsGo.target,
      JSON.stringify(leadsGo),
    );
    check('leads page: no ModuleTile (Go button replaces it)', !(await hasTileNamed('LeadFlow')));

    // Learning page (Team Lead): own 80% + Art of Selling, team 45% + 5 members.
    await clickNav(page, 'লার্নিং', 'Learning');
    await page.waitForFunction(() => document.body.textContent.includes('Go to Learning') || document.body.textContent.includes('লার্নিং-এ যান'), { timeout: 5000 });
    const learningSummary = await summaryInfo();
    check(
      'learning page: DEMO summary strip with the Learning Hub note',
      !!learningSummary && learningSummary.includes('DEMO DATA') && learningSummary.includes('live learning data arrives with the Learning Hub connection'),
      learningSummary ? learningSummary.slice(0, 160) : 'no summary strip',
    );
    check('learning page: progress 80% own + 45% team', JSON.stringify(await readStats('Learning in progress')) === JSON.stringify(['80%', '45%']));
    check(
      'learning page: own course + team members line',
      !!learningSummary &&
        learningSummary.includes('The Art of Selling — Communication Masterclass') &&
        learningSummary.includes('5 team members learning in progress'),
      learningSummary ? learningSummary.slice(0, 240) : 'no summary strip',
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

    // Proposals page: unchanged — disabled tile + IT note, no summary, no Go button.
    await clickNav(page, 'প্রপোজাল', 'Proposals');
    await page.waitForFunction(() => document.body.textContent.includes('Proposals'), { timeout: 5000 });
    const proposalsOk = await page.evaluate(
      () =>
        [...document.querySelectorAll('h3')].some((h) => h.textContent === 'Proposals') &&
        document.body.textContent.includes('production portal link is not confirmed yet'),
    );
    check('proposals page: unchanged, disabled tile + IT note', proposalsOk);
    check(
      'proposals page: no summary strip, no Go button',
      (await summaryInfo()) === null && !(await goButton('Go to', 'যান')),
      'summary/go must be absent here',
    );
    // Screenshots of the two new data pages (device gate).
    await clickNav(page, 'লিডস', 'Leads');
    await page.waitForFunction(() => document.body.textContent.includes('Go to Lead Management') || document.body.textContent.includes('লিড ম্যানেজমেন্টে যান'), { timeout: 5000 });
    await new Promise((r) => setTimeout(r, 300));
    await page.screenshot({ path: path.join(QA_DIR, 'leads-1440.png'), fullPage: true });
    await clickNav(page, 'লার্নিং', 'Learning');
    await page.waitForFunction(() => document.body.textContent.includes('Go to Learning') || document.body.textContent.includes('লার্নিং-এ যান'), { timeout: 5000 });
    await new Promise((r) => setTimeout(r, 300));
    await page.screenshot({ path: path.join(QA_DIR, 'learning-1440.png'), fullPage: true });
    await ctx.close();
  }

  // ---- 20b. Leads/Learning pages at 375 px (device gate) ----
  {
    const { ctx, page } = await newPage(browser, 375);
    await login(page, '9990002', '123456');
    await page.waitForFunction(() => document.body.textContent.includes('Demo Team Lead'), { timeout: 5000 });
    await clickNav(page, 'লিডস', 'Leads');
    await page.waitForFunction(() => document.body.textContent.includes('Go to Lead Management') || document.body.textContent.includes('লিড ম্যানেজমেন্টে যান'), { timeout: 5000 });
    await new Promise((r) => setTimeout(r, 300));
    const leadsOv = await overflowCheck(page);
    check('screenshot leads-375: no horizontal overflow', !leadsOv.overflow, `scrollWidth=${leadsOv.scrollWidth} innerWidth=${leadsOv.innerWidth}`);
    await page.screenshot({ path: path.join(QA_DIR, 'leads-375.png'), fullPage: true });
    await clickNav(page, 'লার্নিং', 'Learning');
    await page.waitForFunction(() => document.body.textContent.includes('Go to Learning') || document.body.textContent.includes('লার্নিং-এ যান'), { timeout: 5000 });
    await new Promise((r) => setTimeout(r, 300));
    const learningOv = await overflowCheck(page);
    check('screenshot learning-375: no horizontal overflow', !learningOv.overflow, `scrollWidth=${learningOv.scrollWidth} innerWidth=${learningOv.innerWidth}`);
    await page.screenshot({ path: path.join(QA_DIR, 'learning-375.png'), fullPage: true });
    await ctx.close();
  }
} finally {
  await browser.close();
  for (const dir of [jwtBundleDir, prodTmp, stubTmpDir]) {
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  }
}

summarizeAndExit(results.some((r) => !r.ok) ? 1 : 0);
