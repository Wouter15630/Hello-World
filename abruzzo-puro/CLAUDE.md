# Conventions for this project

Read before changing anything, so decisions already made are not relitigated.

## What this is
A single self-contained `dist/index.html` guest guide. One job: get a guest, standing in
the kitchen with patchy signal, into the car with directions in under 30 seconds. Every
feature serves that. If a change does not, don't add it.

## Hard rules
- **One output file.** Everything (data, photos as base64 webp, CSS, JS) is inlined into
  `dist/index.html`. No framework, no bundler, no runtime dependencies.
- **No runtime network calls, ever.** The page must work fully offline once loaded. Only
  the Google Maps links and the web-fonts may touch the network. No keys in the page.
- **Mobile first**, one-handed. Desktop is secondary.
- **Under 1.5 MB** total; aim for ~1 MB. Photos are the only heavy thing — keep webp at
  quality ~68 and don't add images that don't earn their weight.

## Data model (split by change-rate)
- `data/places.seed.json` — **source of truth, hand-curated.** ids, categories, names,
  English `sub`/`note`/`flag`, coordinates, place_id, Maps links.
- `data/places.live.json` — **generated + committed.** rating, votes, price, phone, hours,
  businessStatus, `checkedAt`. Refreshed weekly from Google Places (New) or left as the
  committed snapshot.
- `data/routes.json` — **generated + committed.** km / minutes / bearing from the house,
  from OSRM. Only recomputed when `config.json`'s house coordinate changes.
- Merge is by `id` in `scripts/build.mjs`.
- Hours are **Monday-first**, minutes from midnight; an interval past midnight has 1440
  added to its end (e.g. `[1080,1500]` = 18:00→01:00). `null` = unknown, `[]` = closed.

## "Open now"
Lives in `scripts/opennow.mjs` (pure, tested, inlined into the page verbatim — the build
strips the `export` keywords). It is the most load-bearing logic here. Rules that bite:
- Day index is Monday-first: `dayIndex = (new Date().getDay() + 6) % 7`.
- Always Europe/Rome, never the device timezone.
- Midnight rollover: check today's intervals AND whether yesterday's spilled past 1440.
- "hours unknown" is an honest state (12 places have no hours). Never guess.
Change this only with the unit test (`npm test`) green.

## The traps (already handled — don't reintroduce)
1. Filter handlers are scoped to `.bar .chip` only. Dots and cards use `data-id`, never a
   bound filter target. Only filter chips carry `data-cat` as an event target.
2. No `SVGElement.click()`. Dot activation is a shared `activateDot()` called by both the
   click and the keydown listeners.
3. SVG classes are namespaced `bussola-*` so `.card` matches only the 47 article cards.
4. The compass plots 45 dots: every place except `sergio` (no coordinate) and `olivieri`
   (at the house, 0 min). Rule: `brg != null && min != null && min > 0`.

## Design
Palette and fonts are sampled from the original PDF (see `scripts/build.mjs` `:root`).
Bodoni Moda (display), Poppins (body), DM Mono (data). Restraint everywhere; the compass
("La Bussola") is the one bold element. Cards without a photo get a Bodoni initial tile.
Content and function must never depend on the fonts arriving — fallback stacks cover offline.

## i18n
English is the source (in the seed). `i18n/{nl,de,it}.json` mirror `en.json` and add a
`places` map of translated `sub`/`note`/`flag`. Never translate place names, town names,
or street names. Persist the choice in `localStorage` wrapped in try/catch.

## Photos
`scripts/photos.mjs` writes `data/photos.manifest.json` (committed) — that is what the
build reads, so the build never depends on live Wikimedia. Owner photos live in
`photos/owner/<id>.jpg`. Commons images are curated by exact filename with attribution in
`photos/commons/credits.json`. Do **not** cache Google Places photos (their terms forbid it).

## Verify before shipping
`npm test` (unit) and `npm run smoke` (Playwright) must both pass. The weekly Action
commits a rebuilt page only when the smoke test passes.
