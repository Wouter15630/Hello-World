// Dev helper: split the researched source JSON into the three committed data files.
// Run once (or whenever the source changes): `node scripts/split-seed.mjs`.
// SOURCE OF TRUTH for the split is data/_source.json (the delivered research dump).
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = JSON.parse(readFileSync(join(root, 'data', '_source.json'), 'utf8'));

// Pull lat/lng/place_id out of the Google Maps "search" URL.
function parseMaps(url) {
  if (!url) return { lat: null, lng: null, placeId: null };
  const q = /[?&]query=([-\d.]+),([-\d.]+)/.exec(url);
  const p = /[?&]query_place_id=([^&]+)/.exec(url);
  return {
    lat: q ? Number(q[1]) : null,
    lng: q ? Number(q[2]) : null,
    placeId: p ? decodeURIComponent(p[1]) : null,
  };
}

const seed = { base: src.base, source: src.source, places: [] };
const live = { checkedAt: new Date('2025-07-01T00:00:00Z').toISOString(), places: {} };
const routes = { base: src.base, routes: {} };

for (const p of src.places) {
  const { lat, lng, placeId } = parseMaps(p.maps);
  // Curated, never touched by the API:
  seed.places.push({
    id: p.id,
    cat: p.cat,
    name: p.name,
    sub: p.sub,
    note: p.note,
    flag: p.flag,
    pdf: p.pdf,
    lat, lng,
    placeId,
    maps: p.maps,
    nav: p.nav,
  });
  // Refreshed weekly from Places API:
  live.places[p.id] = {
    rating: p.rating,
    votes: p.votes,
    price: p.price,
    phone: p.phone,
    hours: p.hours,
    businessStatus: 'OPERATIONAL',
  };
  // Refreshed from OSRM only when the house coordinate changes:
  routes.routes[p.id] = { km: p.km, min: p.min, brg: p.brg };
}

const w = (name, obj) => writeFileSync(join(root, 'data', name), JSON.stringify(obj, null, 1) + '\n');
w('places.seed.json', seed);
w('places.live.json', live);
w('routes.json', routes);
console.log(`Wrote ${seed.places.length} places → seed / live / routes`);
