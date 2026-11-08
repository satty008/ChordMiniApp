// Browser end-to-end probe: loads a page headless, optionally clicks a button, and prints
// console errors, failed requests and API calls. Catches failures the server logs can't see.
// setup:  npm i playwright && npx playwright install chromium
// usage:  CLICK='Run analysis' node probe.mjs https://HOST/analyze/VIDEOID 150 out.png
import { chromium } from 'playwright';
const [url, secs = '100', shot] = process.argv.slice(2);
const t0 = Date.now(); const ts = () => ((Date.now() - t0) / 1000).toFixed(1).padStart(6) + 's';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
const out = [];
page.on('console', (m) => { if (['error', 'warning'].includes(m.type()) || /analy|beat|chord|error|fail/i.test(m.text())) out.push(`${ts()} console.${m.type()}: ${m.text().slice(0, 260)}`); });
page.on('pageerror', (e) => out.push(`${ts()} PAGEERROR: ${String(e.message).slice(0, 260)}`));
page.on('requestfailed', (r) => out.push(`${ts()} REQFAILED: ${r.method()} ${r.url().slice(0, 140)} :: ${r.failure()?.errorText}`));
page.on('response', (r) => { const u = r.url(); if (/\/api\/|identitytoolkit/.test(u) && !/_next\/static/.test(u)) out.push(`${ts()} ${r.status()} ${r.request().method().padEnd(4)} ${u.replace('https://chordmini.debugndeadlift.duckdns.org', '').slice(0, 150)}`); });
await page.goto(url, { waitUntil: 'domcontentloaded' });
if (process.env.CLICK) {
  await page.waitForTimeout(12000);
  out.push(`${ts()} >>> clicking "${process.env.CLICK}"`);
  await page.getByRole('button', { name: process.env.CLICK }).first().click({ timeout: 20000 });
}
await page.waitForTimeout(Number(secs) * 1000);
console.log(out.join('\n'));
console.log('\n=== PAGE TEXT (first 700) ===\n' + (await page.evaluate(() => document.body.innerText)).slice(0, 700));
if (shot) { await page.screenshot({ path: shot, fullPage: false }); console.log('\nscreenshot ->', shot); }
await browser.close();
