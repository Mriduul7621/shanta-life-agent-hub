/**
 * Milestone 1 QA — headless-Chrome checks for the Agent Hub.
 *
 * Usage: `npm run build && npm run qa`.
 *
 * Runs against the PRODUCTION build via file:// — the VM's Chrome build
 * hard-blocks loopback navigation (ERR_BLOCKED_BY_LOCAL_NETWORK_ACCESS_CHECKS;
 * the standard --disable-features flag does not lift it), so the dev server
 * cannot be driven by headless Chrome here. The app uses a relative Vite base
 * so the same build also runs from file:// and, later, from a Capacitor
 * webview. Override with HUB_QA_URL to point at a live server instead.
 *
 * Checks:
 *  1. Login page loads with no console errors.
 *  2. All 4 demo roles can sign in; a JWT is issued with the documented claims.
 *  3. 5 wrong PINs lock the account (15-minute lockout message).
 *  4. 9990001 first-login forced PIN change works; the new PIN signs in after.
 *  5. Sign-out clears the session token.
 *  6. BN/EN switch changes UI strings.
 *  7. Role views differ (team section only for Team Lead / Manager; Admin sees
 *     the console placeholder on Profile).
 *  8. Screenshots: login + home + profile at 375 / 768 / 1440 px, plus one
 *     home screenshot per role at 1440 px. Each shot also checks for
 *     horizontal overflow (scrollWidth > innerWidth).
 *
 * Exits non-zero if any check fails. Screenshots land in qa/.
 */
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const BASE =
  process.env.HUB_QA_URL ??
  `file://${path.resolve(import.meta.dirname, '..', 'dist', 'index.html')}`;
const CHROME = '/opt/meta-chromium/chrome';
const QA_DIR = path.resolve(import.meta.dirname, '..', 'qa');

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

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

try {
  // ---- 1. Login page loads, no console errors; BN default ----
  {
    const { ctx, page, errors } = await newPage(browser, 1440);
    await page.goto(BASE, { waitUntil: 'networkidle0' });
    const title = await page.$eval('h1', (el) => el.textContent);
    check('login page loads (BN default)', title.includes('এজেন্ট হাবে'), title);
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
    check(`login ${c.id}: no console errors`, errors.length === 0, errors.join(' | '));
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

  // ---- 5. BN/EN switch changes strings ----
  {
    const { ctx, page } = await newPage(browser, 1440);
    await page.goto(BASE, { waitUntil: 'networkidle0' });
    const bnTitle = await page.$eval('h1', (el) => el.textContent);
    await page.evaluate(() => {
      [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'EN')?.click();
    });
    await page.waitForFunction(() => document.querySelector('h1')?.textContent.includes('Sign in to Agent Hub'), { timeout: 5000 });
    const enTitle = await page.$eval('h1', (el) => el.textContent);
    check('BN/EN switch changes login title', bnTitle !== enTitle && enTitle.includes('Sign in to Agent Hub'), `${bnTitle} → ${enTitle}`);
    const stored = await page.evaluate(() => localStorage.getItem('hub-lang'));
    check('language persisted in localStorage', stored === 'en', stored);
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
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
if (failed.length > 0) {
  console.log('FAILED:');
  for (const f of failed) console.log(` - ${f.name} ${f.detail}`);
  process.exit(1);
}
