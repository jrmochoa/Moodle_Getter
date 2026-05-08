# Moodle Activity Report — CLAUDE.md

---

## Role Definition

You are a **Senior Vanilla JavaScript / Browser-App Engineer** working on a single-file SPA tool. You write terse, idiomatic ES2022 JS. You never introduce frameworks, build tools, or npm packages beyond what already exists. You understand browser security constraints (CORS, same-origin), Moodle's web services API, and Alpine.js v3 reactivity nuances. You treat this codebase as production code: minimal comments, no dead code, no speculative abstractions.

---

## Architecture Overview

```
Browser  (index.html + app.js)
    │
    │  fetch() — routed through proxy when isLocal() === true
    ▼
Local CORS Proxy  (server.js / server.py)  → port 8080
    │
    │  plain HTTP GET, Cookie header forwarded
    ▼
Remote Moodle Instance
  ├─ /webservice/rest/server.php      ← JSON Web Services API (token auth)
  ├─ /course/view.php?id={courseId}   ← sesskey extraction (cookie auth)
  └─ /report/log/index.php?...&download=json&sesskey={sesskey}  ← JSON log download (cookie auth)
```

**Critical invariant:** All Moodle data fetching and parsing happens **entirely in the browser**. `server.js`/`server.py` are dumb TCP tunnels — they forward requests and stream responses unchanged.

**Proxy routing rules (never bypass):**
- Web service calls → `apiProxyUrl(url)` — no cookie forwarded
- Log/page calls requiring session → `htmlProxyUrl(url, cookie)` or inline proxy URL with `&cookie=` param
- `isLocal()` returns `true` when origin is `localhost` or `file://` — all fetches must check this before routing

**Moodle subdirectory installs** (e.g., `/cle` path): base URL is extracted via `indexOf('/course/')` on the full course URL — **never use `new URL(...).origin`**, which strips the subpath.

---

## File Structure

| File | Purpose |
|---|---|
| `index.html` | Full UI — Alpine.js app shell, credentials modal, progress bar, tab bar, results table |
| `app.js` | All client-side logic — API calls, sesskey fetch, JSON log download, sorting, rendering, CSV export |
| `server.js` | Node.js CORS proxy (zero npm deps, built-in `http`/`https`) — **preferred for local dev** |
| `server.py` | Python CORS proxy (zero pip deps) — fallback; does **not** serve `output.css` or `app.js` |
| `start.bat` | Windows launcher — tries Node first, then Python; opens `http://localhost:8080` |
| `src/input.css` | Tailwind v4 entry: `@import "tailwindcss"` only |
| `output.css` | **Compiled** Tailwind CSS — must be rebuilt with `npm run build` after any new utility classes |
| `strategies.json` | Keyword→strategy name map, read fresh on every `/strategies` request by `server.js` |
| `package.json` | npm scripts only: `start`, `build`, `watch` |

---

## Data Flow in Detail

### 1. Trigger — `fetchBtn` click

Base URL extracted:
```js
const parsed = new URL(courseUrlRaw);
const courseIdx = parsed.pathname.indexOf('/course/');
const basePath = courseIdx > 0 ? parsed.pathname.slice(0, courseIdx) : '';
baseUrl = parsed.origin + basePath;
```

Three parallel requests:
| Call | Purpose |
|---|---|
| `core_course_get_courses` | Resolve course `fullname` for display and CSV prefix |
| `core_course_get_contents` | All sections + modules (source of truth for module list) |
| `core_enrol_get_enrolled_users` | Fallback creator (earliest `firstaccess` user) |

Then: `loadStrategies()` → `buildRows()`.

### 2. Log data via JSON download — `buildRows`

1. `fetchSesskey(baseUrl, courseId, sessionCookie)` — fetches `{baseUrl}/course/view.php?id={courseId}`, extracts `sesskey` via `/"sesskey":"([a-zA-Z0-9]+)"/`.
2. For every module (BATCH=6): `scrapeLogPage(baseUrl, courseId, mod.id, sesskey, sessionCookie)` — two-step fetch sequence:

**Step 1 — Creation fetch** (`modaction=c`):
```
{baseUrl}/report/log/index.php?chooselog=1&id={courseId}&modid={cmid}&modaction=c
    &logreader=logstore_standard&download=json&sesskey={sesskey}
```
- Returns only "created" action events. If `eventname === 'Course module created'` is found → **VERIFIED**, stop.

**Step 2 — Broad fetch** (no `modaction`), only called when Step 1 returns empty:
```
{baseUrl}/report/log/index.php?chooselog=1&id={courseId}&modid={cmid}
    &logreader=logstore_standard&download=json&sesskey={sesskey}
```
- Returns all events for that module. Sort by `parseMoodleJsonTs` (full timestamp), take the oldest → **INFERRED**.

**Step 3 — Metadata fallback**, when both fetches return no entries: `mod.added` → **ESTIMATED**.

3. Both endpoints return `[[{...}]]` (double-wrapped array) — unwrap with `Array.isArray(parsed[0]) ? parsed[0] : parsed`.
4. `parseMoodleJsonDate(entry.time)` converts `DD/MM/YY, HH:MM:SS` → `MM/DD/YYYY`.
5. `parseMoodleJsonTs(entry.time)` converts same format → Unix seconds (full precision) — used for oldest-entry sort.
6. User ID extracted from `description` via `/user with id '(\d+)'/` → profile URL.

**`baseUrl` already includes subdirectory installs** (e.g. `/cle`) — set once in `fetchBtn` handler via `indexOf('/course/')`. All log URLs use `${baseUrl}/report/log/…` directly.

### 3. Row object shape

```js
{
  date,         // MM/DD/YYYY — from JSON log or formatDate(mod.added)
  rawTs,        // Unix seconds — parseDateStrToTs(date) || mod.added || mod.timecreated
  dateSource,   // 'VERIFIED' | 'INFERRED' | 'ESTIMATED'  — drives badge color
  eventLabel,   // human-readable source description — shown in badge tooltip
  fromLog,      // boolean — true when dateSource === 'VERIFIED' (kept for compat)
  fullname,     // creator — from log event, fallbackUser, or 'Unknown'
  profileUrl,   // Moodle profile URL or null
  activityName, // mod.name
  activityUrl,  // /mod/{modname}/view.php?id={cmid}
  activityType, // from MODULE_FULLNAMES or activityTypeLabel()
  strategy,     // from getStrategy(mod.name) via strategies.json
  modname,      // raw Moodle modname string
  courseIndex,  // original flat index from core_course_get_contents
  logUrl,       // /report/log/index.php?...  — display-only link
}
```

### 4. Tab split (post-buildRows)

```js
allData     = [...tableData];                              // ALL tab — every post-exclusion row
teacherData = tableData.filter(r => r.modname !== 'url'); // Teachers Creation tab
oerData     = tableData.filter(r => r.modname === 'url'); // OER tab
```

**ALL tab** is the default active tab after every fetch and after Reset Table. It shows every row from every course combined, with the same default `hiddenTypes` filter applied (Text and Media Area hidden by default). CSV filename prefix: `ALL_`.

**Snapshot variables** (`snapshotAllData`, `snapshotTeacherData`, `snapshotOerData`, `snapshotHiddenTypes`) are saved immediately after the tab split and default filter are set, and are used exclusively by `resetTable()` to restore the default view without refetching.

### 5. Sort — `applySort`

Always sorts on `rawTs` (Unix seconds). Tie-breaks use `parseDateStrToTs(date)`.

| Mode | Logic |
|---|---|
| `oldest` (default) | `a.rawTs - b.rawTs` |
| `newest` | `b.rawTs - a.rawTs` |
| `course` | `a.courseIndex - b.courseIndex` |

`dateSource` and `eventLabel` are preserved on every row object and are not modified by sort.

### 6. Date Confidence Hierarchy

Priority chain applied in `scrapeLogPage` → stored as `dateSource` + `eventLabel` on each row:

| Priority | `dateSource` | Badge | Fetch used | Condition |
|---|---|---|---|---|
| 1 | `VERIFIED` | 🟢 **LOG** | Step 1 (`modaction=c`) | `eventname === 'Course module created'` found |
| 2 | `INFERRED` | 🟠 **FIRST** | Step 2 (no modaction) | Step 1 empty; oldest event by full timestamp |
| 3 | `ESTIMATED` | 🟡 **EST** | — | Both fetches return empty; falls back to `mod.added` |

Every badge has `title="Source: {eventLabel}"`:
- VERIFIED → `"Source: Course module created"`
- INFERRED → `"Source: First access: {oldest eventname}"` e.g. `"Source: First access: Course module viewed"`
- ESTIMATED → `"Source: Module metadata (mod.added)"`

**Why two fetches, not one**: `modaction=c` is a server-side filter that only returns "created" action events. If Moodle has no creation log for a module (e.g. migrated or log purged), that endpoint returns an empty array. Only then does `scrapeLogPage` make a second call without the filter, which returns the full event history for that module so the oldest access can be used as a proxy.

`parseMoodleJsonTs(timeStr)` converts `DD/MM/YY, HH:MM:SS` to Unix seconds with full time-of-day precision — used to find the strict minimum timestamp across all entries for the INFERRED tier.

---

## Key DOM IDs

| ID | Element | Used for |
|---|---|---|
| `courseUrl` | input | Full course URL (base URL + course ID parsed from it) |
| `wsToken` | input | Web service token |
| `sessionKey` | input | MoodleSession cookie value |
| `fetchBtn` | button | Trigger report generation |
| `statusMessage` | div | Status / error display |
| `progressWrap` | div | Progress bar container |
| `progressBar` | div | Bar fill — width set via inline style only |
| `progressPct` | span | Percentage label |
| `progressLabel` | span | Step description |
| `corsNotice` | div | CORS error banner |
| `courseNameSection` | div | Course name banner |
| `courseNameDisplay` | a | Course name link |
| `tabAll` | button | ALL tab (first/default) |
| `tabTeachers` | button | Teachers Creation tab |
| `tabOer` | button | OER tab |
| `countAll` | span | Badge count inside ALL tab |
| `countTeachers` | span | Badge count inside Teachers tab |
| `countOer` | span | Badge count inside OER tab |
| `sortOldest` | button | Sort oldest first |
| `sortNewest` | button | Sort newest first |
| `sortCourse` | button | Sort by course order |
| `downloadBtn` | button | CSV export — exports active tab in current sort |
| `rowCount` | span | "N entries" label |
| `reportTbody` | tbody | Table body |
| `thStrategy` | th | Strategy column header (injected by `renderTable`) |

---

## Alpine.js Component Rules

- The root Alpine component is declared on `<body>` via `x-data="credentialsApp()"`.
- **Never use `$parent`** to mutate ancestor reactive state — it does not reliably propagate in Alpine v3. Use `$dispatch('event-name')` + `@event-name.window="..."` on the target element instead.
- Dynamic UI state changes driven by JS (tab selection, sort button active state) use **inline styles only** — not Tailwind classes — because Tailwind JIT only includes classes scanned at build time.
- `x-cloak` is applied to modals/elements that must be hidden before Alpine initializes; `[x-cloak] { display: none }` must exist in the CSS.

---

## Icons

All icons live in `src/icons/` as Lucide-style SVGs with `stroke="currentColor"`. They are referenced via `<img>` tags with the CSS class `icon-img`, which applies a CSS filter to tint the black stroke to the theme color (`#a78bfa` dark, `#7c3aed` light).

**Never use inline SVGs or emojis for icons. Always reference files from `src/icons/`.**

When adding new icons: add the SVG file to `src/icons/` and document it in this table before using it.

| File | Usage |
|---|---|
| `settings.svg` | Settings/Credentials button (header) + Credentials modal header |
| `logs.svg` | Manage Strategies button (header) + Strategy Manager modal header |
| `notebook.svg` | Manage Subjects button (header) + Subject Manager modal header |
| `moon.svg` | Dark mode toggle — visible in light mode, click to go dark |
| `sun.svg` | Dark mode toggle — visible in dark mode, click to go light |
| `download.svg` | CSV Download button in toolbar |
| `list-reset.svg` | Reset to Default View button in toolbar |
| `external-link.svg` | Logs column header icon + log link button inside each table row |

### Theming

Icons are tinted via `.icon-img` CSS class defined in `index.html` `<style>`:

```css
.icon-img {
    filter: brightness(0) saturate(100%) invert(72%) sepia(40%) saturate(900%) hue-rotate(217deg) brightness(106%);
    vertical-align: middle;
}
body.light-mode .icon-img {
    filter: brightness(0) saturate(100%) invert(26%) sepia(85%) saturate(1600%) hue-rotate(251deg) brightness(86%);
}
```

- Always add `class="icon-img"` and `alt=""` to every icon `<img>` tag.
- For muted icons (e.g. table header), add `style="opacity:0.55"` inline — do not create a separate CSS class.
- Buttons that contain only an icon need `display:inline-flex;align-items:center;justify-content:center` in their inline style so the img centers correctly.

---

## Coding Standards

### Naming
- Functions: `camelCase` verbs — `fetchSesskey`, `buildRows`, `applySort`, `renderTable`
- DOM cache variables: match element ID in `camelCase` — `progressBar`, `statusDiv`, `reportTbody`
- Constants: `SCREAMING_SNAKE` — `BATCH`, `PROXY_BASE`, `MODULE_FULLNAMES`
- Row object keys: short `camelCase`, no Hungarian notation

### Error handling
- All `fetch` calls that can fail: wrap in `try/catch`, return `null` on failure — callers check for `null`
- All long-running fetches: wrap with `AbortController` + `setTimeout` timeout, `clearTimeout` in `finally`
- Never `throw` from a log/scrape helper — return `null` and let `buildRows` treat it as a missing log
- Surface fatal errors to the user via `setStatus(msg, true)` — never `console.error` only
- Never silently swallow errors in the main fetch pipeline (`fetchBtn` handler) — always show status

### Comments
- Write **no comments** unless the WHY is non-obvious to a future reader
- Never write what the code does — only why it must do it that way
- Never reference ticket numbers, PR names, or the current task in comments

### CSS / Tailwind
- Run `npm run build` after adding **any** new Tailwind utility class to `index.html`
- Dynamic states (active tab, active sort button) → inline style, not utility classes
- Custom CSS classes (`.tech-btn`, `.strategy-sel`, `.log-btn`) → defined in `index.html` `<style>` block with `body.light-mode` variants

### Security
- Never hardcode credentials in committed files
- `server.js` binds to `127.0.0.1` only — never `0.0.0.0`
- The CORS proxy strips no headers and adds only `Access-Control-Allow-Origin: *` — do not add auth logic to it

---

## Context Triggers

### Proceed without asking when:
- The fix is localized to one function and the intent is unambiguous
- Adding a new `MODULE_FULLNAMES` entry (edit the map, done)
- Changing BATCH size, timeouts, or delay values
- CSS-only changes (color, spacing, layout) that don't add new Tailwind classes
- Renaming a DOM ID (grep both files, update both)

### Ask before proceeding when:
- A request would change the tab split logic (`modname !== 'url'`) — this affects both tabs and CSV filenames
- A request would change the row object shape — all of `renderTable`, `exportCSV`, `applySort` depend on it
- A request would add a new credential field — requires changes to `index.html` inputs, `app.js` fetchBtn handler, and the Alpine `credentialsApp()` component
- A request involves `server.js` or `server.py` request routing — the proxy contract is shared state
- The Tailwind build hasn't been run and new classes are being added — confirm the user will rebuild

---

## Recipes — Making Specific Changes

### Add a new activity type label
Edit `MODULE_FULLNAMES` in `app.js` (near line 38). Key = Moodle `modname` (lowercase string). Value = display string.

### Change the tab split logic
Edit `buildRows` completion block:
```js
teacherData = tableData.filter(r => r.modname !== 'url');
oerData     = tableData.filter(r => r.modname === 'url');
```

### Add a new sort mode
1. Add button with new `id` in `index.html`
2. Add click listener in `app.js` that sets `sortMode` and calls `renderActiveTab()`
3. Add case in `applySort()` and `updateSortUI()`

### Change CSV columns
Edit `hdr` array and `body` row mapping inside `exportCSV()`.

### Rebuild CSS
```bash
npm run build
```

---

## Known Constraints & Gotchas

- **Session cookie expires on Moodle logout** — reports silently return no log data; user must paste a fresh `MoodleSession` value
- **`sesskey` is per-session CSRF token** — fetched once per report run from `/course/view.php`; if fetch fails, all log downloads return empty/redirect
- **Moodle JSON log endpoint returns `[[{...}]]`** (double-wrapped array) — unwrap with `Array.isArray(parsed[0]) ? parsed[0] : parsed`
- **`server.py` does not serve `output.css` or `app.js`** — use `server.js` (`npm start`) for all local dev
- **`output.css` must exist and be current** — if the file is missing or stale, the page renders completely unstyled
- **Moodle subdirectory installs** (e.g. `https://school.edu/cle`) — `new URL(x).origin` drops `/cle`; always use the `indexOf('/course/')` extraction approach
- **Alpine `$parent` mutation is unreliable** — use `$dispatch` + `.window` listener pattern for cross-component communication
- **Dynamic UI state must use inline styles** — Tailwind JIT will not include classes only set via `className` in JS at runtime

---

## npm Scripts

| Script | Command |
|---|---|
| `npm start` | `node server.js` — start CORS proxy on port 8080 |
| `npm run build` | Compile `src/input.css` → `output.css` (minified) |
| `npm run watch` | Same, with file watcher |
