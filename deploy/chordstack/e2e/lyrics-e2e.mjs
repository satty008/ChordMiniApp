// Lyrics feature end-to-end check against a running ChordMini (default: a local build on :3000).
// setup:  npm i playwright && npx playwright install chromium
// usage:  OUT=./shots node lyrics-e2e.mjs [baseUrl]
// Needs a saved analysis for VIDEO (PQZ6h49kBIc, a Hindi cover): ChordMini offers "Open cached results" for it,
// otherwise the test runs the analysis first (a few minutes). Run it alone; the backend has 2 workers.
import fs from 'node:fs';
import os from 'node:os';
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://localhost:3000';
const OUT = process.env.OUT || os.tmpdir();
const VIDEO = 'PQZ6h49kBIc';
const TITLE = 'Mere Samne Wali Khidki Mein | Karan Nawani | Ukulele Cover | Padosan | Kishore Kumar';
const URL = `${BASE}/analyze/${VIDEO}?title=${encodeURIComponent(TITLE)}&duration=185`;

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`); ok ? pass++ : fail++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => { if (!/Invalid or unexpected token/.test(e.message)) errors.push(e.message.slice(0, 160)); });

const toggle = () => page.getByRole('button', { name: 'Toggle beat grid lyrics' });
const dialog = () => page.getByRole('dialog', { name: 'Lyrics search' });
const banner = (text) => dialog().getByRole('status').filter({ hasText: text });
const offsetValue = async () => (await dialog().getByRole('group', { name: 'Lyrics timing' }).locator('[aria-live=polite]').innerText()).trim();
const bodyText = () => page.evaluate(() => document.body.innerText);

/** Load the analyze page and get to the results grid (ChordMini asks to open cached results after every load). */
async function openAnalysis() {
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  const results = page.getByText('Beat & Chord Map').first();
  const run = page.getByRole('button', { name: 'Run analysis' });
  const cached = page.getByRole('button', { name: 'Open cached results' });
  await Promise.race([results.waitFor({ timeout: 60000 }), run.waitFor({ timeout: 60000 }), cached.waitFor({ timeout: 60000 })]).catch(() => {});
  if (await cached.isVisible().catch(() => false)) {
    await cached.click();
    await results.waitFor({ timeout: 60000 });
  } else if (await run.isVisible().catch(() => false)) {
    console.log('  (no cached analysis: running it, this takes a few minutes)');
    await run.click();
    await results.waitFor({ timeout: 420000 });
  }
  await sleep(1500);
}

/** The lyrics button toggles: with lyrics showing, the first click hides them. Click until the dialog is open. */
async function openDialog() {
  for (let i = 0; i < 3; i++) {
    if (await dialog().isVisible().catch(() => false)) return;
    await toggle().click();
    await sleep(1000);
  }
}

/** Press a timing button and wait until the displayed offset changes, like a person watching the number. */
async function nudge(name) {
  const before = await offsetValue();
  await dialog().getByRole('button', { name }).click();
  for (let i = 0; i < 40; i++) { if ((await offsetValue()) !== before) return; await sleep(150); }
}
const LATER = 'Show lyrics half a second later';
const EARLIER = 'Show lyrics 1 second earlier';

await openAnalysis();
check('analysis results are shown', await page.getByText('Beat & Chord Map').first().isVisible());

// ---- 1. automatic apply for a cover (title matches, duration differs)
await openDialog();
const appliedAuto = await banner('Lyrics applied').waitFor({ timeout: 40000 }).then(() => true).catch(() => false);
check('1. synced lyrics applied automatically for the cover', appliedAuto);
if (appliedAuto) {
  const text = (await banner('Lyrics applied').innerText()).replace(/\s+/g, ' ');
  console.log('     banner:', text.slice(0, 230));
  check('1. banner names the matched song', /Mere Samne Wali Khidki Mein/i.test(text));
  check('1. banner flags timing from a different recording', /different recording/i.test(text));
  await sleep(1500);
  check('1. the lyrics are drawn on the beat grid', /मेरे सामने|खिड़की|चाँद/.test(await bodyText()));
}
await page.screenshot({ path: `${OUT}/lyrics-1-auto.png` });

// ---- 2. timing buttons
if (appliedAuto) {
  await nudge(LATER); await nudge(LATER);
  check('2. two +0.5 clicks show +1.0 s', (await offsetValue()) === '+1.0 s', await offsetValue());
  await nudge(EARLIER); await nudge(EARLIER);
  check('2. two -1 clicks show −1.0 s', (await offsetValue()) === '−1.0 s', await offsetValue());
  await dialog().getByRole('button', { name: 'Reset lyrics timing' }).click();
  await sleep(800);
  check('2. reset returns to 0 s', (await offsetValue()) === '0 s', await offsetValue());
  await nudge(LATER); await nudge(LATER); await nudge(LATER);       // +1.5 s on the LRCLIB lyrics
  check('2. +1.5 s set', (await offsetValue()) === '+1.5 s', await offsetValue());
}

// ---- 3. own lyrics: pasted, timed (replaces the LRCLIB lyrics)
const LRC = '[00:01.00]Hello from my own lyrics\n[00:04.00]Second timed line here\n[00:08.00]Third line of the test';
await dialog().getByText('Use your own lyrics').click();
await dialog().getByLabel('Pasted lyrics').fill(LRC);
await dialog().getByRole('button', { name: 'Use these lyrics' }).click();
check('3. pasted LRC is applied (banner says "Pasted lyrics")', await banner('Pasted lyrics').waitFor({ timeout: 20000 }).then(() => true).catch(() => false));
check('3. timing controls stay available for pasted timed lyrics', await dialog().getByRole('group', { name: 'Lyrics timing' }).isVisible().catch(() => false));
check('3. the pasted lyrics start at their own offset (0 s)', (await offsetValue().catch(() => '?')) === '0 s', await offsetValue().catch(() => '?'));
await sleep(1500);
check('3. pasted lines appear on the beat grid', /Hello from my own lyrics|Second timed line|Third line of the test/.test(await bodyText()));
await page.screenshot({ path: `${OUT}/lyrics-3-pasted.png` });
await nudge(LATER); await nudge(LATER);                              // +1.0 s on the pasted lyrics (its own offset)

// ---- 4. persistence: reload, lyrics come back without searching
await openAnalysis();
await sleep(1500);
check('4. own lyrics are restored after a reload', /Hello from my own lyrics|Second timed line|Third line of the test/.test(await bodyText()));
await openDialog();
check('4. the restored lyrics are listed as applied', await banner('Pasted lyrics').waitFor({ timeout: 15000 }).then(() => true).catch(() => false));
check('4. the timing offset was remembered (+1.0 s)', (await offsetValue().catch(() => '?')) === '+1.0 s', await offsetValue().catch(() => '?'));

// ---- 5. plain text (no timestamps) goes to the plain-lyrics view
await dialog().getByText('Use your own lyrics').click();
await dialog().getByLabel('Pasted lyrics').fill('Plain line one\nPlain line two\nPlain line three');
await dialog().getByRole('button', { name: 'Use these lyrics' }).click();
await sleep(2500);
check('5. plain lyrics are shown', /Plain line one/.test(await bodyText()));
check('5. no timing controls for plain lyrics', !(await dialog().getByRole('group', { name: 'Lyrics timing' }).isVisible().catch(() => false)));
await page.screenshot({ path: `${OUT}/lyrics-5-plain.png` });

// ---- 6. upload a .lrc file (Malayalam + Hindi text, BOM, CRLF, metadata tag)
const file = `${OUT}/test-upload.lrc`;
fs.writeFileSync(file, '﻿[ar:Tester]\r\n[00:02.00]മെല്ലെ മെല്ലെ\r\n[00:05.00]मेरे सामने\r\n[00:09.00]end of file test\r\n');
await dialog().locator('input[type=file]').setInputFiles(file);
check('6. .lrc upload is applied under its file name', await banner('test-upload.lrc').waitFor({ timeout: 20000 }).then(() => true).catch(() => false));
await sleep(2000);
check('6. non-Latin lyrics render', /മെല്ലെ|मेरे सामने/.test(await bodyText()));

// ---- 7. bad input is rejected with a message
await dialog().getByLabel('Pasted lyrics').fill('[ar:Only]\n[ti:Metadata]');
await dialog().getByRole('button', { name: 'Use these lyrics' }).click();
check('7. metadata-only text is rejected with a message', await dialog().getByRole('alert').filter({ hasText: 'No lyrics found' }).waitFor({ timeout: 8000 }).then(() => true).catch(() => false));
check('7. the previous lyrics stay applied after a rejected paste', await banner('test-upload.lrc').isVisible().catch(() => false));

// ---- 8. remove
await dialog().getByRole('button', { name: 'Remove the applied lyrics' }).click();
await sleep(1500);
check('8. Remove clears the applied lyrics', !(await banner('Lyrics applied').isVisible().catch(() => false)));
await openAnalysis();
await sleep(1500);
check('8. removed lyrics do not come back after a reload', !/end of file test|Hello from my own lyrics/.test(await bodyText()));

console.log(errors.length ? `\npage errors:\n  ${[...new Set(errors)].join('\n  ')}` : '\nno page errors');
console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
