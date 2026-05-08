# Moodle Activity Report — CLAUDE.md

## Role

Senior Vanilla JS / Browser-App Engineer. ES2022, no new frameworks or npm packages. Production standards: no dead code, no speculative abstractions, minimal comments.

---

## Stack

- **Alpine.js v3** (CDN `@3.x.x`) — root component on `<body x-data="credentialsApp()">`
- **Tailwind CSS v4.2.x** — compiled via `@tailwindcss/cli` from `src/input.css` → `output.css`
- **Node.js CORS proxy** — `server.js` (preferred); `server.py` fallback (no CSS/JS serving)

---

## IMPORTANT: npm Commands

```
npm start          # node server.js — CORS proxy on localhost:8080
npm run build      # compile src/input.css → output.css (minified) — run after ANY new Tailwind class
npm run watch      # same, with file watcher
```

---

## Architecture

```
Browser (index.html + app.js)
    │  fetch() — routed through proxy when isLocal() === true
    ▼
Local CORS Proxy (server.js) → port 8080
    │
    ▼
Remote Moodle Instance
  ├─ /webservice/rest/server.php        ← JSON Web Services (token auth)
  ├─ /course/view.php?id={id}           ← sesskey extraction (cookie auth)
  └─ /report/log/index.php?...&download=json  ← JSON log (cookie auth)
```

**IMPORTANT:** All fetching and parsing happens entirely in the browser. `server.js` is a dumb TCP tunnel — it forwards requests and streams responses unchanged.

**Proxy routing (never bypass):**
- Web service calls → `apiProxyUrl(url)` — no cookie
- Log/page calls → `htmlProxyUrl(url, cookie)` — cookie forwarded
- `isLocal()` returns `true` when origin is `localhost` or `file://`

**IMPORTANT — subdirectory installs** (e.g. `/cle`): base URL extracted via `indexOf('/course/')` — **never `new URL(...).origin`**, which strips the subpath.

---

## File Map

| File | Purpose |
|---|---|
| `index.html` | Full UI — Alpine app shell, modals, progress bar, tab bar, results table |
| `app.js` | All client logic — API calls, sorting, rendering, CSV export |
| `server.js` | Node CORS proxy — **preferred**; serves all static files |
| `server.py` | Python CORS proxy — fallback; **does not** serve `output.css` or `app.js` |
| `src/input.css` | Tailwind v4 entry: `@import "tailwindcss"` only |
| `output.css` | Compiled Tailwind CSS — **must be rebuilt** after adding any utility class |
| `strategies.json` | Keyword→strategy map — read fresh on every `/strategies` request |

---

## Data Flow

1. `fetchBtn` click → extract `baseUrl` via `indexOf('/course/')` (preserves subdirectory path)
2. Three parallel WS calls: `core_course_get_courses`, `core_course_get_contents`, `core_enrol_get_enrolled_users`
3. `fetchSesskey()` scrapes `/"sesskey":"([a-zA-Z0-9]+)"/` from `/course/view.php?id={id}`
4. `scrapeLogPage()` per module (BATCH=6 concurrent):
   - **Step 1** — `modaction=c` fetch → `eventname === 'Course module created'` found → **VERIFIED**
   - **Step 2** — broad fetch (no modaction), only if Step 1 empty → oldest event → **INFERRED**
   - **Step 3** — `mod.added` fallback when both empty → **ESTIMATED**
5. Log endpoint returns `[[{...}]]` (double-wrapped) — unwrap: `Array.isArray(parsed[0]) ? parsed[0] : parsed`
6. `parseMoodleJsonTs()` converts `DD/MM/YY, HH:MM:SS` → Unix seconds with full precision (needed for INFERRED sort)

**Tab split:** `teacherData` = `modname !== 'url'`; `oerData` = `modname === 'url'`; `allData` = all rows. ALL tab is default.

**Date Confidence:**

| Priority | `dateSource` | Badge | Condition |
|---|---|---|---|
| 1 | `VERIFIED` | LOG (green) | `Course module created` event found in Step 1 |
| 2 | `INFERRED` | FIRST (orange) | Oldest event from Step 2 broad fetch |
| 3 | `ESTIMATED` | EST (yellow) | Both fetches empty; `mod.added` used |

---

## Column Filters

- **Type filter** — `hiddenTypes` Set; `toggleFilterDropdown`; icon `#typeFilterIcon`
- **Date filter** — `hiddenYears` + `hiddenMonths` Sets; `toggleDateFilterDropdown`; icon `#dateFilterIcon`
- Filter order in `applyAndRender()`: sort → type → date (AND logic)
- Both cleared on every new fetch and by `resetTable()`; CSV export mirrors same logic
- Dropdown scans `getActiveRows()` so already-hidden values stay accessible

---

## Icons

All icons: `src/icons/*.svg` (Lucide-style, `stroke="currentColor"`). Always use `<img class="icon-img" alt="">`.

**IMPORTANT: Never use inline SVGs or emojis — always reference files from `src/icons/`.**

| File | Usage |
|---|---|
| `settings.svg` | Credentials button + modal header |
| `logs.svg` | Manage Strategies button + modal header |
| `notebook.svg` | Manage Subjects button + modal header |
| `moon.svg` / `sun.svg` | Dark/light mode toggle |
| `download.svg` | CSV Download button |
| `list-reset.svg` | Reset to Default View button |
| `external-link.svg` | Logs column header + row log link |

Tinting: `.icon-img` CSS filter in `index.html <style>` block (dark default) + `body.light-mode .icon-img` override.
Muted icons: add `style="opacity:0.55"` inline (single-property — acceptable).

---

## NEVER DO

- **NEVER** use `new URL(...).origin` for base URL extraction — strips subdirectory path
- **NEVER** use inline SVGs or emojis for icons
- **NEVER** write multi-property inline styles — define a named class in `src/input.css`
- **NEVER** set Tailwind utility classes dynamically via JS (`className` / `classList`) — JIT scanner won't include them; use custom CSS modifier classes (e.g. `.tab-btn--active`) defined in the stylesheet
- **NEVER** use Alpine `$parent` to mutate ancestor state — use `$dispatch('event')` + `@event.window="..."` on the target element
- **NEVER** hardcode credentials in committed files
- **NEVER** bind `server.js` to `0.0.0.0` — must stay `127.0.0.1`
- **NEVER** add npm packages beyond existing devDependencies
- **NEVER** use `server.py` as the primary dev server — it does not serve `output.css`
- **NEVER** `throw` from a log/scrape helper — return `null` and let `buildRows` handle it

---

## Coding Standards

**Naming:** `camelCase` functions, `SCREAMING_SNAKE` constants, DOM cache vars match element ID.

**Error handling:**
- All `fetch` calls: `try/catch`, return `null` on failure — callers check for `null`
- Long fetches: `AbortController` + `setTimeout` timeout with `clearTimeout` in `finally`
- Fatal errors → `setStatus(msg, true)` — never `console.error` only

**IMPORTANT — CSS rules:**
- Single-property inline styles are fine: `style="display:none"`, `style="color:#ef4444"`
- Two or more CSS properties → define a named class in `src/input.css`; run `npm run build`
- Theme-aware runtime values → CSS modifier class with `body.light-mode` variant (e.g. `.chip--light`)
- `[x-cloak] { display: none }` must exist in the stylesheet

---

## Verification

After any change, confirm:
1. `npm run build` completes without errors
2. `grep -P 'style="[^"]*;[^"]*;' index.html app.js` returns zero results (no multi-prop inline styles)
3. `npm start` → open `http://localhost:8080` → trigger a report fetch
4. Table renders; badges show correct VERIFIED / INFERRED / ESTIMATED tiers
5. Dark/light toggle, CSV download, type filter, and date filter all function correctly
6. No CORS errors in browser DevTools Network tab

---

## Gotchas

- **Session cookie expires on Moodle logout** — reports silently return no log data; user must re-paste `MoodleSession`
- **`sesskey` is per-session CSRF token** — if `/course/view.php` fetch fails, all log downloads return empty
- **`output.css` missing or stale** → page renders completely unstyled
- **`parseMoodleJsonTs()` full precision** — required for INFERRED oldest-event selection; do not simplify to date-only

---

## Context Triggers

**Proceed without asking:**
- Fix is localized to one function with unambiguous intent
- Adding/editing a `MODULE_FULLNAMES` entry
- Changing BATCH size, timeouts, or delay values
- CSS-only changes that don't add new Tailwind classes

**Ask first:**
- Changing tab split logic (`modname !== 'url'`) — affects both tabs and CSV filenames
- Changing row object shape — `renderTable`, `exportCSV`, `applySort` all depend on it
- Adding a new credential field — touches `index.html` inputs, `app.js` fetchBtn handler, Alpine component
- Any change to `server.js` / `server.py` request routing

---

## Recipes

**New activity type label:** Edit `MODULE_FULLNAMES` in `app.js` (~line 38). Key = Moodle `modname` string.

**New sort mode:** Button in `index.html` → click listener sets `sortMode` + calls `renderActiveTab()` → add case in `applySort()` + `updateSortUI()`.

**Change CSV columns:** Edit `hdr` array and `body` row mapping inside `exportCSV()`.

**New icon:** Add SVG to `src/icons/`, use `<img class="icon-img" alt="">`, add row to Icons table above.
