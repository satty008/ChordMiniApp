// Browser end-to-end probe: loads a page headless, optionally clicks a button, and prints
// console errors, failed requests and API calls. Catches failures the server logs can't see.
// setup:  npm i playwright && npx playwright install chromium
// usage:  CLICK='Run analysis' UNTIL_GONE='Detecting Beats' node probe.mjs https://HOST/analyze/VIDEOID 420 out.png
//   CLICK       button to press after load (prints the buttons it can see if not found)
//   UNTIL_GONE  stop as soon as this text appears and then disappears (else waits the full seconds)
// Run it alone: the backend has 2 workers, so a concurrent analysis makes both slower.
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
  try { await page.getByRole('button', { name: process.env.CLICK }).first().click({ timeout: 20000 }); }
  catch { out.push(`${ts()} >>> button "${process.env.CLICK}" not found; buttons: ` + (await page.getByRole('button').allInnerTexts()).map((t) => t.trim()).filter(Boolean).slice(0, 14).join(' | ')); }
}
if (process.env.UNTIL_GONE) {
  // event-driven wait: stop as soon as the given text appears and then disappears (or after `secs`)
  const deadline = Date.now() + Number(secs) * 1000; let seen = false, gone = 0;
  while (Date.now() < deadline) {
    const txt = await page.evaluate(() => document.body.innerText).catch(() => '');
    if (txt.includes(process.env.UNTIL_GONE)) { seen = true; gone = 0; } else if (seen && ++gone >= 2) { out.push(`${ts()} >>> "${process.env.UNTIL_GONE}" is gone: analysis stage finished`); break; }
    await page.waitForTimeout(3000);
  }
  if (Date.now() >= deadline) out.push(`${ts()} >>> TIMED OUT waiting for "${process.env.UNTIL_GONE}" to go away`);
} else {
  await page.waitForTimeout(Number(secs) * 1000);
}
console.log(out.join('\n'));
console.log('\n=== PAGE TEXT (first 700) ===\n' + (await page.evaluate(() => document.body.innerText)).slice(0, 1600));
if (shot) { await page.screenshot({ path: shot, fullPage: false }); console.log('\nscreenshot ->', shot); }
await browser.close();
