# CLAUDE.md

This file provides guidance to AI assistants working with this repository.

## Repository Overview

This is a small, static educational web project created in 2017 as a JavaScript learning exercise. It demonstrates fundamental JavaScript concepts (loops, conditionals, functions, arrays, random number generation) within a basic HTML/CSS frontend.

There is no build system, package manager, test framework, or CI/CD pipeline.

## Project Structure

```
Hello-World/
├── CLAUDE.md               # This file
├── README.md               # Minimal project description
└── Javascript/             # Main project directory
    ├── index.html          # Entry point (single HTML page)
    ├── css/
    │   ├── style.css       # All project styles (52 lines)
    │   └── background.jpg  # Background image asset
    ├── img/                # Card and city image assets
    │   ├── Card_Club.png
    │   ├── Card_Diamond.png
    │   ├── Card_Heart.png
    │   ├── Card_Spade.png
    │   ├── city.jpeg
    │   └── city.jpg
    └── js/
        ├── script.js              # All application logic (166 lines)
        └── jquery-3.1.1.min.js   # jQuery library (vendored)
```

## Key Files

### `Javascript/index.html`
Single-page HTML entry point. Loads `css/style.css` and both JS files. Contains a container with a header and output section for displaying results from JavaScript functions.

### `Javascript/js/script.js`
All application JavaScript. Key functions:
- Random number generator — outputs 5 random numbers between 0–99
- Morning alarm tracker — displays 3 preset alarm times
- `youNeedCoffee()` — coffee break toggle indicator
- `getCards()` — card-drawing game that randomly picks cards until a Spade is drawn
- `apples()` — basic string concatenation test
- Switch statement demo for grocery items

The file contains commented-out code from earlier learning stages; this is intentional and part of the learning record.

### `Javascript/css/style.css`
Minimal stylesheet:
- Universal text centering
- Background image (full-viewport, no-repeat)
- Header font (Roboto, 50px, weight 200)
- `.fonts` class (red, 20px, Roboto)
- Ghost button style with hover opacity effect
- `hr` max-width of 600px

## Development Workflow

### Running Locally
No build step required. Open `Javascript/index.html` directly in a browser:

```bash
# From the repo root
open Javascript/index.html
# or
xdg-open Javascript/index.html
```

Alternatively, serve it with any static file server:

```bash
npx serve Javascript/
# or
python3 -m http.server 8080 --directory Javascript/
```

### Making Changes
1. Edit files directly — `script.js`, `style.css`, or `index.html`.
2. Reload the browser to see changes (no compilation or bundling needed).
3. jQuery 3.1.1 is vendored in `js/jquery-3.1.1.min.js`; do not modify it.

### No Tests / No Linter
There is no test suite and no linter configuration. Manual browser testing is the only verification method.

## Dependencies

| Dependency | Version | How included |
|---|---|---|
| jQuery | 3.1.1 | Vendored (`js/jquery-3.1.1.min.js`) |

No package manager (npm, yarn, pip, etc.) is used. There is no `package.json` or lock file.

## Git Conventions

- **Main branch**: `master`
- **Feature branches**: `claude/<description>-<id>` (e.g., `claude/add-claude-documentation-EWWRd`)
- Commits are GPG-signed via SSH key.
- Commit messages should be short and descriptive (imperative mood preferred).

## Conventions for AI Assistants

- **Do not introduce a build system** unless explicitly requested. The project is intentionally build-free.
- **Do not add a package manager** (npm, yarn, etc.) unless explicitly requested.
- **Do not modify** `jquery-3.1.1.min.js`; it is a vendored dependency.
- **Preserve commented-out code** in `script.js` — it is part of the learning history and intentional.
- **Keep changes minimal and focused** — this is a simple learning project; avoid over-engineering.
- All changes should remain compatible with direct browser file loading (no ES modules, no bundler-specific syntax unless a bundler is added).
- When pushing changes, use the designated `claude/` feature branch and run:
  ```bash
  git push -u origin <branch-name>
  ```
