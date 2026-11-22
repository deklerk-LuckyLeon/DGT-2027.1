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
