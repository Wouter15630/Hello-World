// refresh-places.mjs — pull fresh ratings / hours / phone / price at BUILD time.
// Places API (New): GET https://places.googleapis.com/v1/places/{placeId}
//
//  - Auth via X-Goog-Api-Key header (NEVER a query parameter).
//  - Strict X-Goog-FieldMask: only the fields we render. Every extra field
//    bumps the SKU tier. Verify the field->SKU mapping against Google's live
//    docs before widening this mask (pricing changed in 2025).
//  - Without GOOGLE_PLACES_KEY: no-op. The committed places.live.json is used.
//  - On ANY per-place failure: keep the previous value. Never null over good data.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = join(root, 'data');
const KEY = process.env.GOOGLE_PLACES_KEY;

const FIELD_MASK =
  'id,displayName,rating,userRatingCount,regularOpeningHours,nationalPhoneNumber,priceLevel,businessStatus';

const PRICE = {
  PRICE_LEVEL_FREE: 0,
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const readJSON = (f) => JSON.parse(readFileSync(join(dataDir, f), 'utf8'));

// Google periods (Sunday-first day, {hour,minute}) -> our Monday-first minute intervals.
function parseHours(regular) {
  if (!regular || !Array.isArray(regular.periods)) return null; // unknown
  // 24/7 shortcut: a single period that opens and never closes.
  if (regular.periods.length === 1 && regular.periods[0].open && !regular.periods[0].close) {
    return Array.from({ length: 7 }, () => [[0, 1440]]);
  }
  const week = Array.from({ length: 7 }, () => []); // present => default closed, then fill
  for (const p of regular.periods) {
    if (!p.open) continue;
    const gOpenDay = p.open.day ?? 0;
    const monIdx = (gOpenDay + 6) % 7;
    const openMin = (p.open.hour ?? 0) * 60 + (p.open.minute ?? 0);
    let endMin;
    if (!p.close) {
      endMin = 1440;
    } else {
      const dayDiff = (((p.close.day ?? gOpenDay) - gOpenDay) + 7) % 7;
      endMin = (p.close.hour ?? 0) * 60 + (p.close.minute ?? 0) + dayDiff * 1440;
      if (endMin <= openMin) endMin += 1440; // defensive: overnight not flagged by day
    }
    week[monIdx].push([openMin, endMin]);
  }
  for (const day of week) day.sort((a, b) => a[0] - b[0]);
  return week;
}

async function fetchPlace(placeId) {
  const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
    headers: { 'X-Goog-Api-Key': KEY, 'X-Goog-FieldMask': FIELD_MASK },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${await res.text().catch(() => '')}`.slice(0, 200));
  return res.json();
}

async function main() {
  const seed = readJSON('places.seed.json');
  const prev = readJSON('places.live.json');
  const out = { checkedAt: prev.checkedAt, places: { ...prev.places } };

  if (!KEY) {
    console.log('[refresh-places] GOOGLE_PLACES_KEY not set — skipping refresh, keeping committed snapshot.');
    return;
  }

  let calls = 0, updated = 0, failed = 0, permClosed = 0;
  for (const place of seed.places) {
    if (!place.placeId) continue;
    try {
      calls++;
      const d = await fetchPlace(place.placeId);
      const status = d.businessStatus || 'OPERATIONAL';
      if (status === 'CLOSED_PERMANENTLY') permClosed++;
      out.places[place.id] = {
        rating: d.rating ?? null,
        votes: d.userRatingCount ?? null,
        price: d.priceLevel != null && d.priceLevel in PRICE ? PRICE[d.priceLevel] : (prev.places[place.id]?.price ?? null),
        phone: d.nationalPhoneNumber ?? (prev.places[place.id]?.phone ?? null),
        hours: d.regularOpeningHours ? parseHours(d.regularOpeningHours) : (prev.places[place.id]?.hours ?? null),
        businessStatus: status,
      };
      updated++;
      await sleep(120); // courtesy, not a load test
    } catch (err) {
      failed++;
      console.error(`[refresh-places] ${place.id} (${place.name}) FAILED, keeping previous: ${err.message}`);
      out.places[place.id] = prev.places[place.id]; // never overwrite good data with null
    }
  }

  out.checkedAt = new Date().toISOString();
  writeFileSync(join(dataDir, 'places.live.json'), JSON.stringify(out, null, 1) + '\n');
  console.log(`[refresh-places] ${calls} Place Details calls · ${updated} updated · ${failed} failed · ${permClosed} permanently closed · checkedAt ${out.checkedAt}`);
}

main().catch((e) => {
  // Never let a refresh failure break the build: log loudly, leave snapshot intact.
  console.error('[refresh-places] fatal error, committed snapshot left untouched:', e);
  process.exit(0);
});
