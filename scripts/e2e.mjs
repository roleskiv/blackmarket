/**
 * Browser end-to-end check of the built client (npm run build first).
 *
 *   npm run e2e
 *
 * Serves dist/ with `vite preview`, drives the real game in headless Chromium
 * and fails on any console error, a balance that does not reconcile with the
 * round history, or a feature that does not run to the end. Needs Playwright
 * with Chromium available (npx playwright install chromium).
 */
import { preview } from 'vite';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const server = await preview({ preview: { port: 4179, strictPort: false }, logLevel: 'silent' });
const base = server.resolvedUrls.local[0];
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const failures = [];
const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failures.push(what);
};

async function open(viewport, query) {
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base + query);
  await page.waitForSelector('#enter:not([hidden])', { timeout: 30_000 });
  await page.click('#enter');
  await page.waitForSelector('[data-id=spin][data-mode=spin]', { timeout: 30_000 });
  // Headless rendering is slow: run the presentation faster than real time.
  await page.evaluate(() => (window.__bm.scene.timeScale = 6));
  return { page, errors };
}
const idle = (page) => page.waitForSelector('[data-id=spin][data-mode=spin]', { timeout: 240_000 });
const state = (page) => page.evaluate(() => ({ balance: window.__bm.game.balance, bet: window.__bm.game.bet }));

try {
  // 1. Desktop: spins reconcile with the round history.
  {
    const { page, errors } = await open({ width: 1280, height: 720 }, '?seed=11');
    const before = await state(page);
    const spins = 6;
    for (let i = 0; i < spins; i++) {
      await page.keyboard.press('Space');
      await page.waitForSelector('[data-id=spin]:not([data-mode=spin])', { timeout: 10_000 });
      await idle(page);
    }
    const after = await state(page);
    const history = await page.evaluate(() => window.__bm.game.service.history(50));
    const net = history.reduce((s, r) => s + r.win - r.stake, 0);
    check(history.length === spins, `history holds ${spins} rounds`);
    check(history.every((r) => r.status === 'settled' && r.presented), 'every round settled and acknowledged');
    check(after.balance === before.balance + net, 'balance reconciles with history');
    check(errors.length === 0, `no console errors on desktop ${errors.slice(0, 2).join(' | ')}`);
    await page.close();
  }

  // 2. Forced Vault trigger: the feature runs to the end and pays what the server said.
  {
    const { page, errors } = await open({ width: 1280, height: 720 }, '?seed=5');
    const before = await state(page);
    await page.evaluate(() => {
      const SCATTER = 13;
      const strips = window.__bm.session.game.strips.base;
      // Stop each of the first three reels with a scatter on the top row.
      const stops = strips.map((s, i) => (i < 3 ? s.indexOf(SCATTER) : 0));
      window.__bm.force(stops);
    });
    await page.keyboard.press('Space');
    await idle(page);
    const [last] = await page.evaluate(() => window.__bm.game.service.history(1));
    const after = await state(page);
    check(last.outcome.steps.length > 10, `Vault feature ran (${last.outcome.steps.length - 1} free spins)`);
    check(after.balance === before.balance - last.stake + last.win, 'feature win credited exactly');
    check(errors.length === 0, `no console errors in feature ${errors.slice(0, 2).join(' | ')}`);
    await page.close();
  }

  // 3. Phone portrait: loads, spins, opens the paytable.
  {
    const { page, errors } = await open({ width: 390, height: 844 }, '?seed=3');
    await page.click('[data-id=spin]');
    await idle(page);
    await page.click('[data-id=menu]');
    await page.waitForSelector('#dialogs [role=dialog]', { timeout: 10_000 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    check(!overflow, 'portrait layout has no horizontal overflow');
    check(errors.length === 0, `no console errors on phone ${errors.slice(0, 2).join(' | ')}`);
    await page.close();
  }
} finally {
  await browser.close();
  await new Promise((r) => server.httpServer.close(r));
}

if (failures.length) {
  console.error(`\n${failures.length} check(s) failed`);
  process.exit(1);
}
console.log('\nAll browser checks passed');
