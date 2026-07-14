// refresh-routes.mjs — driving km + minutes + true bearing from the house.
// OSRM public demo server (free, keyless). It is a courtesy service:
// sleep 250ms between calls, only re-run when the house coordinate changes.
//
// The house coordinate lives in config.json. Change it there, then:
//   npm run refresh:routes
// recomputes all 47 driving times. Nothing else to touch.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = join(root, 'data');
const readJSON = (p) => JSON.parse(readFileSync(p, 'utf8'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// True bearing (degrees, 0 = north) from house to point.
function bearing(lat1, lng1, lat2, lng2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const φ1 = toRad(lat1), φ2 = toRad(lat2), Δλ = toRad(lng2 - lng1);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

async function osrm(house, p) {
  const url = `https://router.project-osrm.org/route/v1/driving/${house.lng},${house.lat};${p.lng},${p.lat}?overview=false`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const j = await res.json();
  const r = j.routes?.[0];
  if (!r) throw new Error('no route');
  return { km: Math.round(r.distance / 100) / 10, min: Math.round(r.duration / 60) };
}

async function main() {
  const config = readJSON(join(root, 'config.json'));
  const seed = readJSON(join(dataDir, 'places.seed.json'));
  const house = { lat: config.house.lat, lng: config.house.lng };
  let routes;
  try { routes = readJSON(join(dataDir, 'routes.json')); } catch { routes = { base: null, routes: {} }; }

  const same = routes.base && routes.base.lat === house.lat && routes.base.lng === house.lng;
  const complete = seed.places.every((p) => p.lat == null || routes.routes[p.id]);
  if (same && complete && process.argv[2] !== '--force') {
    console.log('[refresh-routes] house coordinate unchanged and routes complete — nothing to do.');
    return;
  }

  const out = { base: { name: config.house.name, ...house }, routes: {} };
  let ok = 0, failed = 0;
  for (const p of seed.places) {
    if (p.lat == null || p.lng == null) { continue; } // sergio: no coordinate
    try {
      const { km, min } = await osrm(house, p);
      out.routes[p.id] = { km, min, brg: Math.round(bearing(house.lat, house.lng, p.lat, p.lng) * 10) / 10 };
      ok++;
      await sleep(250);
    } catch (err) {
      failed++;
      // Keep the previous value for this place rather than dropping it.
      out.routes[p.id] = routes.routes[p.id] || null;
      console.error(`[refresh-routes] ${p.id} FAILED, keeping previous: ${err.message}`);
    }
  }
  writeFileSync(join(dataDir, 'routes.json'), JSON.stringify(out, null, 1) + '\n');
  console.log(`[refresh-routes] ${ok} routed · ${failed} failed · base ${house.lat},${house.lng}`);
}

main().catch((e) => { console.error('[refresh-routes] fatal:', e); process.exit(0); });
