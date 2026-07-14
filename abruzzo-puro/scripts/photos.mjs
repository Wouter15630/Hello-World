// photos.mjs — build the inlined photo manifest.
//
//  owner  : photos/owner/<slot>.jpg  (the owners' own shots, lifted from the PDF;
//           drop a new <id>.jpg here and it is picked up by filename)
//  commons: fetched from Wikimedia Commons at build time, freely licensed, cached
//           in photos/commons/, credited in photos/commons/credits.json
//
// Output: data/photos.manifest.json  { slot: "data:image/webp;base64,..." }
//         photos/commons/credits.json { slot: {author,license,licenseUrl,source,title} }
//
// Google Places photos are deliberately NOT used: their terms forbid caching them.
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename } from 'node:path';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ownerDir = join(root, 'photos', 'owner');
const commonsDir = join(root, 'photos', 'commons');
mkdirSync(commonsDir, { recursive: true });

const HERO = { w: 1500, h: 900 };
const CARD = { w: 620, h: 420 };
const Q = 68;

// Commons targets: slot -> exact Commons file title. Curated by hand so every
// image is relevant and correctly attributed; the fetched original is cached in
// photos/commons/ and only re-downloaded if the cache is missing.
const COMMONS = [
  ['_hero', 'Panoramica di Pennadomo e lago di Bomba da Cima Fumosa.jpg'],
  ['belvedere', 'Colledimezzo - Flickr - kruder396.jpg'],
  ['costa', 'La Costa Dei Trabocchi - panoramio.jpg'],
  ['cavalluccio', 'Trabocco Punta Cavalluccio al tramonto.jpg'],
  ['vasto', 'Vasto - panoramio (4).jpg'],
  ['aremogna', 'Piano Aremogna.jpg'],
  ['blockhaus', 'Blockhaus Parco nazionale della Majella 2010-by-RaBoe-13.jpg'],
  ['sulmona', 'Sulmona Market Abruzzo Italy 0005.jpg'],
  ['trefrati', 'Fontana Maggiore (Pescocostanzo) 01.jpg'],
  ['villamaiella', 'Guardiagrele Santa Maria Maggiore Occidentale.jpg'],
  ['inarte', 'Lanciano, chiesa di San Francesco 03.jpg'],
  ['santamaria', 'Casa Caracciolo, Villa Santa Maria.JPG'],
  ['pecoramatta', 'Arrosticini abruzzesi 01.jpg'],
  ['roccaraso', 'Il centro fiorito di Roccaraso.jpg'],
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stripHtml = (s) => (s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const BAD_TITLE = /(map|mappa|stemma|coat of arms|flag|logo|diagram|locator|gonfalone|\.svg)/i;
const FREE = /(cc0|public domain|cc[ -]?by(?![ -]?(nc|nd))|attribution[- ]share|share[- ]?alike)/i;

const UA = 'AbruzzoPuroGuide/1.0 (static guest guide; contact host)';
// Wikimedia rate-limits bursts. Retry 429/5xx with exponential backoff.
async function fetchRetry(url, tries = 5) {
  for (let i = 0; i < tries; i++) {
    const r = await fetch(url, { headers: { 'User-Agent': UA } });
    if (r.ok) return r;
    if (r.status === 429 || r.status >= 500) { await sleep(1200 * (i + 1)); continue; }
    throw new Error(`HTTP ${r.status}`);
  }
  throw new Error('HTTP 429 (gave up after retries)');
}
async function j(url) { return (await fetchRetry(url)).json(); }

// Look a file up by its exact Commons title and return its imageinfo.
async function findCommons(title) {
  const api = 'https://commons.wikimedia.org/w/api.php';
  const url = `${api}?action=query&format=json&titles=${encodeURIComponent('File:' + title)}&prop=imageinfo&iiprop=url|extmetadata|mime|size`;
  const data = await j(url);
  const page = Object.values(data?.query?.pages || {})[0];
  const info = page?.imageinfo?.[0];
  if (!info || page.missing !== undefined) return null;
  const lic = stripHtml(info.extmetadata?.LicenseShortName?.value);
  if (!FREE.test(lic)) throw new Error(`license "${lic}" is not clearly free`);
  return { p: { title: 'File:' + title }, info };
}

async function download(url, dest) {
  const r = await fetchRetry(url);
  const buf = Buffer.from(await r.arrayBuffer());
  writeFileSync(dest, buf);
  return buf;
}

async function toWebp(input, { w, h }) {
  const out = await sharp(input).rotate().resize(w, h, { fit: 'cover', position: sharp.strategy.attention }).webp({ quality: Q }).toBuffer();
  return 'data:image/webp;base64,' + out.toString('base64');
}

async function main() {
  const manifest = {};
  const credits = {};
  let bytes = 0;
  // Reuse a previously cached original + credit when present (offline re-runs).
  let prevCredits = {};
  try { prevCredits = JSON.parse(readFileSync(join(commonsDir, 'credits.json'), 'utf8')); } catch {}

  // 1) Owner photos (by filename = slot id). hero.jpg would win the hero slot.
  for (const f of existsSync(ownerDir) ? readdirSync(ownerDir) : []) {
    if (!/\.(jpe?g|png|webp)$/i.test(f) || f.startsWith('_')) continue;
    const slot = basename(f).replace(/\.(jpe?g|png|webp)$/i, '');
    const dims = slot === 'hero' || slot === '_hero' ? HERO : CARD;
    try {
      manifest[slot === 'hero' ? '_hero' : slot] = await toWebp(join(ownerDir, f), dims);
      bytes += manifest[slot === 'hero' ? '_hero' : slot].length;
      console.log(`[photos] owner  ${slot}`);
    } catch (e) { console.error(`[photos] owner ${slot} failed: ${e.message}`); }
  }

  // 2) Commons photos (skip any slot already filled by an owner photo).
  for (const [slot, title] of COMMONS) {
    if (manifest[slot]) { console.log(`[photos] commons ${slot} skipped (owner photo present)`); continue; }
    const cacheFile = join(commonsDir, slot + '.jpg');
    // Offline reuse: cached original + known credit for the same title.
    if (existsSync(cacheFile) && prevCredits[slot]?.title === title) {
      try {
        manifest[slot] = await toWebp(readFileSync(cacheFile), slot === '_hero' ? HERO : CARD);
        bytes += manifest[slot].length;
        credits[slot] = prevCredits[slot];
        console.log(`[photos] commons ${slot}  (cached) ${title}`);
        continue;
      } catch { /* fall through to re-fetch */ }
    }
    try {
      const hit = await findCommons(title);
      if (!hit) { console.warn(`[photos] commons ${slot}: "${title}" not found — tile fallback`); await sleep(1200); continue; }
      const info = hit.info, ex = info.extmetadata || {};
      const buf = await download(info.url, cacheFile);
      manifest[slot] = await toWebp(buf, slot === '_hero' ? HERO : CARD);
      bytes += manifest[slot].length;
      credits[slot] = {
        title: title,
        author: stripHtml(ex.Artist?.value) || 'Wikimedia Commons contributor',
        license: stripHtml(ex.LicenseShortName?.value) || 'See source',
        licenseUrl: ex.LicenseUrl?.value || '',
        source: info.descriptionurl || info.url,
      };
      console.log(`[photos] commons ${slot}  <- ${title}  [${credits[slot].license}]`);
    } catch (e) {
      console.error(`[photos] commons ${slot} failed (${e.message}) — tile fallback`);
    }
    await sleep(1500); // be gentle with the Commons API
  }

  writeFileSync(join(root, 'data', 'photos.manifest.json'), JSON.stringify(manifest));
  writeFileSync(join(commonsDir, 'credits.json'), JSON.stringify(credits, null, 2) + '\n');
  const n = Object.keys(manifest).length;
  console.log(`[photos] ${n} images · ${(bytes / 1024 / 1.37 / 1024).toFixed(2)} MB (approx webp) · manifest written`);
}

main().catch((e) => { console.error('[photos] fatal:', e); process.exit(1); });
