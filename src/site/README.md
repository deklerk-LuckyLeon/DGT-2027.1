# DGT 2027 Trip Planner

The group planner for the Drakensberg Grand Traverse, March 2027: dates poll, travel, route and map, bail-out passes, weather, safety, gear lists, group gear and food.

- **Website:** this repo, served by GitHub Pages.
- **Shared data:** the Google Sheet "DGT 2027 – Group gear lists", through a small Apps Script web app (`backend/Code.gs`).
- **Gear reviews by Claude:** go through the organiser's Anthropic API key, which is stored only in Apps Script.

No secrets live in this repo. The group passcode, organiser code and API key are Script properties in Apps Script.

## Set up (organiser, once)

### 1. Backend in the group sheet
1. Open the sheet → **Extensions → Apps Script**.
2. Replace the contents of `Code.gs` with `backend/Code.gs` from this repo. Save.
3. **Project settings (gear icon) → Script properties → Add**:
   | Property | Value |
   |---|---|
   | `PASSCODE` | the group passcode you'll give everyone |
   | `ADMIN_CODE` | a separate code only you use (unlocks editing trip details) |
   | `ANTHROPIC_API_KEY` | key from console.anthropic.com (set a monthly spend limit there) |
4. **Deploy → New deployment → type: Web app**. Execute as: **Me**. Who has access: **Anyone**. Deploy and authorise.
5. Copy the **Web app URL** (ends in `/exec`).

The script creates a hidden `_data` tab for shared records. When someone switches on "Save my gear to the group sheet", their tab (Leon, Duncan, …) is rewritten from row 4 down with their list; the summary formulas in K–N stay.

### 2. Point the website at it
Edit `config.js` in this repo and paste the URL:
```js
window.DGT_CONFIG = { apiUrl: 'https://script.google.com/macros/s/…/exec', names: ['Leon','Duncan','Christian','Stefan'] };
```

### 3. Turn on GitHub Pages
Repo **Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: main / (root)**. The site appears at `https://<user>.github.io/DGT-2027.1/` after a minute.

### 4. Share
Send the group the link and the passcode (separately is better). Everyone picks their name and enters the passcode. On phones, "Add to Home screen" makes it work like an app and keeps working offline with the last data it saw.

## How it behaves
- **Shared:** dates poll, who brings what, group gear still needed, people & travel, trip details (organiser edits).
- **Personal gear** stays in the browser unless that person ticks "Save my gear to the group sheet". Backup codes work as before.
- Changes from others show up within about 45 seconds, or when the page is reopened.
- Reviews are capped at 20 a day for the whole group (change `REVIEWS_PER_DAY` in Code.gs).
- Security is passcode-level: fine for trip planning, not for anything sensitive. To lock everyone out, change `PASSCODE`.

## Updating the backend
After editing Code.gs: **Deploy → Manage deployments → edit (pencil) → Version: New version → Deploy**. The URL stays the same.

## Developing

Everything the site is built from lives in `src/`. The site is one self-contained `index.html` (app, styles, route data and badge inlined), so there is no bundler: two small Python scripts stitch the sources together.

```
src/
  app/    planner4_app.js (the whole app), planner_*.css + planner3_*.css (styles; planner_ds.css is the DGT design layer, applied last),
          static5.json (days, catalogue, gas plan), d3b.json (route, terrain grids, caves, water, likely streams), trip.json (default trip details, bookings, links),
          wx.json (weather normals), badge.webp, topo_mask.svg, the source GPX, build5.py (builds the Claude artifact version)
  site/   build_site.py (builds this website into the repo root), boot.js (sign-in gate and the window.claude shim on top of Apps Script),
          site.css, sw.js, manifest, icons, Code.gs (Apps Script backend, copied to backend/), README.md (this file, copied to the root)
  test/   mockgas.js: runs Code.gs in Node with an in-memory sheet and serves the site on http://localhost:8765 (passcode berg2027, organiser code leon-org)
  tools/  streams.py: works out likely stream crossings from the terrain grid and writes them into d3b.json
```

Build and run locally (Python 3, Node 18+):

```
cd src/site && python3 build_site.py      # writes ../../index.html, backend/Code.gs, README.md
node src/test/mockgas.js                  # then open http://localhost:8765
cd src/app && python3 build5.py           # optional: Claude artifact version -> build/dgt-planner.html
```

Edit files in `src/`, never the built `index.html`. Commit the source and the rebuilt `index.html` together; GitHub Pages serves the root of `main`.

Notes:
- The app is plain ES5-style JavaScript in one file, organised as module objects (FOOD, MAP, POLL, GG, ME…); views are string templates rendered by `renderView()`. Shared data goes through `claude.use('db')`, which `boot.js` maps onto the Apps Script web app (`backend/Code.gs`, records in the hidden `_data` tab, each person's gear and food written to their own tab).
- `window.DGT_CONFIG` (from `config.js`) switches on website-only features: OpenTopoMap tiles, GPX download, the sign-in gate. Without it the same code runs as the Claude artifact.
- Changing `Code.gs` needs a redeploy in Apps Script (Deploy → Manage deployments → edit → New version). The passcode, organiser code and API key are Script properties, never in this repo.
- Test with Playwright against the mock server; the mock overrides `config.js`, so tests never touch the real sheet.
