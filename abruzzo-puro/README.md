# Abruzzo Puro — the guest guide

One web page that replaces the old PDF. It tells a guest, in under thirty seconds,
**where to go today and where to eat tonight** — with live "open now" status, real
driving times from the house, ratings, warnings, and one-tap navigation.

- **One file.** The whole guide is `dist/index.html`. Photos, data, styling and code
  are all inside it. Open it from a USB stick, email it, or host it anywhere.
- **Works with no signal.** Once the page has loaded, everything keeps working offline —
  the Sangro valley has dead zones. Only the map links and the web-fonts need the internet.
- **No costs, no tracking, no accounts.** The page never calls any service while a guest
  uses it. There are no keys inside it.
- **Four languages.** Dutch, English, German, Italian. It picks the phone's language and
  remembers a manual choice.

---

## How it is put together (the short version)

Information is split by how often it changes:

| Changes… | Lives in | Refreshed |
|---|---|---|
| by the minute — "open now" | computed on the guest's phone | never needs refreshing |
| by the week — ratings, hours, phone, price | `data/places.live.json` | at build time (optional) |
| never — which places, the notes, distances, photos | `data/places.seed.json` etc. | by hand |

So the page can show live-looking ratings and opening hours **without any paid API in the
page itself**. A weekly job can refresh the weekly data; if you never set that up, the page
simply shows the date it was last checked and works exactly the same.

---

## Publish it

The deliverable is a single file, so hosting is trivial. Pick whichever is easiest:

- **Send the file.** Email or message `dist/index.html`. It opens on any phone or laptop.
- **Drop it on a free static host.** Drag `dist/index.html` onto [Netlify Drop](https://app.netlify.com/drop),
  or put it in any web space / S3 bucket / GitHub Pages folder. No build step is needed on the host.
- **Print the link or a QR code** and leave it in the house.

That's it — there is nothing to install and no server to run.

---

## Everyday changes (no coding needed beyond editing a text file)

Everything below is done in this folder, then `npm run build` to regenerate the page.
You need [Node.js](https://nodejs.org) installed once.

```bash
npm install       # first time only
npm run build     # regenerate dist/index.html
```

### Add, change or remove a place
Edit **`data/places.seed.json`**. Each place has a short `id`, a `cat` (`see`, `lunch`,
`dinner` or `easy`), a `name`, a `sub` (the town or a one-line description), a `note`,
an optional `flag` (a warning, e.g. "Closed Monday"), and its Google Maps links.
Then translate the new `sub`/`note`/`flag` in `i18n/nl.json`, `de.json`, `it.json`
(English stays in the seed). Run `npm run build`.

### Move the house to the real address
Open **`config.json`** and change the `house` `lat` and `lng` to the actual house.
Then:

```bash
npm run refresh:routes   # recomputes all 47 driving times & directions
npm run build
```

That one coordinate is the only thing to change — everything else follows.

### Drop in your own photos
Put a JPG in **`photos/owner/`** named after the place's `id` — e.g. `soffio.jpg`,
or `hero.jpg` for the big top image. Run `npm run photos` then `npm run build`.
Your photo replaces whatever was there. You should be the ones shooting these.

### Refresh ratings & opening hours (optional, needs a Google key)
Without a key, the guide keeps the last committed snapshot and shows "last checked on …".
With a key you can pull fresh numbers:

```bash
export GOOGLE_PLACES_KEY=your-key
npm run refresh          # updates data + rebuilds
```

The key lives only on your machine (or in a repository secret named `GOOGLE_PLACES_KEY`
for the weekly job). It never goes into the page. A refresh failure never breaks the page —
it just keeps the last good data.

---

## Fill in the blanks

`config.json` has a few `TODO:` placeholders — the host's name and phone, the Wi-Fi
network and password, and the nearest fuel/cash machine. Replace them with the real
details and rebuild. The page shows a gentle "ask your host" until you do; it never
invents a phone number or a password.

---

## Commands

| Command | What it does |
|---|---|
| `npm run build` | Regenerate `dist/index.html` from all the data. |
| `npm run refresh` | Refresh ratings/hours (needs a key) then rebuild. |
| `npm run refresh:routes` | Recompute driving times after moving the house. |
| `npm run photos` | Rebuild the inlined photo set (owner + Wikimedia). |
| `npm test` | Test the "open now" logic. |
| `npm run smoke` | Load the built page in a browser and check it end-to-end. |

The weekly refresh runs automatically via `.github/workflows/refresh.yml` and only
commits a new page when the smoke test passes.

See **CORRECTIONS.md** for what the original PDF got wrong, and **CLAUDE.md** for the
conventions behind the build.
