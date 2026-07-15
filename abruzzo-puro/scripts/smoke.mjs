// smoke.mjs — Playwright checks for the built page. Exits non-zero on any failure
// so the GitHub Action only commits a page that passes.
import { chromium } from 'playwright';
import { globSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const URL = pathToFileURL(join(root, 'dist', 'index.html')).href;

// Prefer a pre-installed Chromium (its build may not match the npm package version).
function launchOpts() {
  const exes = globSync('/opt/pw-browsers/chromium-*/chrome-linux/chrome');
  return exes.length ? { executablePath: exes[0] } : {};
}

let failures = 0;
const ok = (name, cond, extra = '') => { console.log(`${cond ? '  ok  ' : ' FAIL '} ${name}${extra ? ' — ' + extra : ''}`); if (!cond) failures++; };

// Ignore purely-network resource failures (e.g. Google Fonts blocked offline);
// those are not code defects and the page is designed to degrade to fallbacks.
function attachErrorCapture(page, bag) {
  page.on('pageerror', (e) => bag.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (/ERR_|net::|Failed to load resource|status of 4|status of 5/.test(t)) return; // network, not code
    bag.push('console: ' + t);
  });
}

async function main() {
  const browser = await chromium.launch(launchOpts());

  // ---- Page 1: load, structure, no JS errors, filters, links, i18n ----
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    attachErrorCapture(page, errors);
    await page.goto(URL, { waitUntil: 'load' });
    await page.waitForSelector('.card');

    ok('no page/JS errors on load', errors.length === 0, errors.join(' | '));

    const cards = await page.$$eval('.card', (n) => n.length);
    ok('exactly 47 cards render', cards === 47, `got ${cards}`);

    const dots = await page.$$eval('.bussola-dot', (n) => n.length);
    ok('exactly 45 compass dots (2 have no coordinate)', dots === 45, `got ${dots}`);

    const count0 = await page.$eval('#count', (n) => n.textContent.trim());
    ok('counter reads "47 of 47" on load', count0 === '47 of 47', `got "${count0}"`);

    // Clicking a compass dot must NOT change the filter counter (trap 12.1).
    await page.click('.bussola-dot');
    const countAfterDot = await page.$eval('#count', (n) => n.textContent.trim());
    ok('clicking a dot does not change the counter', countAfterDot === count0, `got "${countAfterDot}"`);

    // Keyboard Enter on a focused dot updates the readout.
    await page.$eval('.bussola-dot', (d) => d.focus());
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
    const readoutName = await page.$eval('#readout .rdo-name', (n) => n.textContent.trim()).catch(() => '');
    ok('keyboard Enter on a dot updates the readout', readoutName.length > 0, `readout "${readoutName}"`);

    // "Open now" + "≤20 min" narrows, and both can be cleared.
    await page.click('#f-open');
    await page.click('#f-20');
    await page.waitForTimeout(60);
    const narrowed = await page.$eval('#count', (n) => n.textContent.trim());
    ok('Open now + ≤20 min narrows the counter', narrowed !== '47 of 47', `got "${narrowed}"`);
    await page.click('#f-open');
    await page.click('#f-20');
    await page.waitForTimeout(60);
    const cleared = await page.$eval('#count', (n) => n.textContent.trim());
    ok('both filters can be cleared back to 47 of 47', cleared === '47 of 47', `got "${cleared}"`);

    // Every action link is a real https:// or tel:// URL, none empty.
    const links = await page.$$eval('.card .actions a', (as) => as.map((a) => a.getAttribute('href') || ''));
    const badLinks = links.filter((h) => !/^https:\/\//.test(h) && !/^tel:/.test(h));
    ok('every action link is a real https:// or tel:// URL', badLinks.length === 0 && links.length > 0, `${badLinks.length} bad of ${links.length}`);

    // Language switch: NL/DE/IT change visible copy, place names stay intact.
    const enOpen = await page.$eval('#f-open', (n) => n.textContent.trim());
    for (const [lng, expect] of [['nl', 'Nu open'], ['de', 'Jetzt offen'], ['it', 'Aperto ora']]) {
      await page.click(`.lang[data-lang="${lng}"]`);
      await page.waitForTimeout(80);
      const openTxt = await page.$eval('#f-open', (n) => n.textContent.trim());
      const nameIntact = await page.$$eval('.card-name', (ns) => ns.some((n) => n.textContent.includes('Trabocco Punta Cavalluccio')));
      ok(`switch to ${lng.toUpperCase()} changes copy`, openTxt !== enOpen && openTxt.length > 0, `"${openTxt}"`);
      ok(`${lng.toUpperCase()} keeps place names intact`, nameIntact, 'Trabocco Punta Cavalluccio present');
    }
    await page.close();
  }

  // ---- Page 2: frozen clock → known open/closed/unknown states ----
  {
    const page = await browser.newPage();
    await page.clock.install({ time: new Date('2025-07-09T18:30:00Z') }); // Wed 20:30 Rome (CEST)
    await page.goto(URL, { waitUntil: 'load' });
    await page.waitForSelector('#card-siparjum');
    const cls = (id) => page.$eval(`#card-${id} [data-role=state]`, (n) => n.className);
    const siparjum = await cls('siparjum'); // Tue–Sat 20:00–23:00 → open at 20:30 Wed
    ok('frozen clock: Siparjum is open at Wed 20:30', /\bopen\b/.test(siparjum), siparjum);
    const collinetta = await cls('collinetta'); // Thu–Sun only → closed on Wed
    ok('frozen clock: La Collinetta is closed on Wed', /\bclosed\b/.test(collinetta), collinetta);
    const lago = await cls('lago'); // hours null → unknown
    ok('frozen clock: Lago di Bomba hours unknown', /\bunknown\b/.test(lago), lago);
    const belvedere = await cls('belvedere'); // 24h → open
    ok('frozen clock: Belvedere (24h) is open', /\bopen\b/.test(belvedere), belvedere);
    await page.close();
  }

  await browser.close();
  console.log(`\n${failures === 0 ? 'PASS' : 'FAIL'} — ${failures} failure(s)`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error('smoke crashed:', e); process.exit(1); });
