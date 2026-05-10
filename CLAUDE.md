# Moodle Activity Report — CLAUDE.md

## Role

Senior Vanilla JS / Browser-App Engineer. ES2022, no new frameworks or npm packages. Production standards: no dead code, no speculative abstractions, minimal comments.

## Stack

- **Alpine.js v3** (CDN `@3.x.x`) — root component on `<body x-data="credentialsApp()">`
- **Tailwind CSS v4.2.x** — compiled via `@tailwindcss/cli` from `src/input.css` → `output.css`
- **Node.js CORS proxy** — `server.js` (preferred); `server.py` fallback (no CSS/JS serving)

```
npm start          # node server.js — CORS proxy on localhost:8080
npm run build      # compile src/input.css → output.css (minified) — run after ANY new Tailwind class
npm run watch      # same, with file watcher
```

## Architecture

```
Browser (index.html + app.js)
    │  fetch() — routed through proxy when isLocal() === true
    ▼
Local CORS Proxy (server.js) → port 8080
    │  Serves static files
    │  GET/POST /strategies, /subjects, /gradelevels → data/*.json
    │  /proxy?url=... → forwards to Moodle (cookie-aware)
    ▼
Remote Moodle Instance
  ├─ /webservice/rest/server.php        ← JSON Web Services (token auth)
  ├─ /course/view.php?id={id}           ← sesskey extraction (cookie auth)
  └─ /report/log/index.php?...&download=json  ← JSON log (cookie auth)
```

All fetching and parsing happens in the browser. `server.js` is a dumb TCP tunnel — forwards requests and streams responses unchanged.

**Proxy routing:**
- Web service calls → `apiProxyUrl(url)` — no cookie
- Log/page calls → `htmlProxyUrl(url, cookie)` — cookie forwarded
- `isLocal()` → `true` when origin is `localhost` or `file://`

**IMPORTANT — subdirectory installs** (e.g. `/cle`): base URL extracted via `indexOf('/course/')` — never `new URL(...).origin`, which strips the subpath.

## File Map

| File | Purpose |
|---|---|
| `index.html` | Full UI — Alpine app shell, modals, toolbar, tab bar, results table |
| `app.js` | All client logic — API calls, sorting, rendering, CSV export |
| `server.js` | Node CORS proxy — preferred; serves all static files and data API |
| `server.py` | Python CORS proxy — fallback; does not serve `output.css` or `app.js` |
| `src/input.css` | Tailwind v4 entry: `@import "tailwindcss"` only |
| `output.css` | Compiled Tailwind CSS — must be rebuilt after adding any utility class |
| `data/strategies.json` | Keyword→strategy map — read fresh on every `/strategies` request |
| `data/subjects.json` | Keyword→subject map — read fresh on every `/subjects` request |
| `data/gradelevels.json` | Keyword→grade level map — read fresh on every `/gradelevels` request |
| `.claude/hooks/backup.js` | PreToolUse hook — backs up data files before changes |
| `.claude/hooks/notify-sound.js` | Stop hook — plays `runaway_intro.wav` via PowerShell |

## Data Flow

1. `fetchBtn` click → extract `baseUrl` via `indexOf('/course/')` (preserves subdirectory path)
2. Three parallel WS calls: `core_course_get_courses`, `core_course_get_contents`, `core_enrol_get_enrolled_users`
3. `fetchSesskey()` scrapes `/"sesskey":"([a-zA-Z0-9]+)"/` from `/course/view.php?id={id}`
4. `buildRows()` fetches `sesskey` and `studentIds` in parallel, then runs `scrapeLogPage()` per module (BATCH=6 concurrent):
   - **Step 1** — `modaction=c` fetch → `eventname === 'Course module created'` found → **VERIFIED**; then a second broad fetch retrieves all entries for peak computation
   - **Step 2** — broad fetch (no modaction), only if Step 1 empty → oldest event → **INFERRED**; same entries used for peak
   - **Step 3** — `mod.added` fallback when both empty → **ESTIMATED**; peak is null
5. `scrapeLogPage()` returns `{ creation: {...}, peak: { date, count } | null }`
6. Log endpoint returns `[[{...}]]` (double-wrapped) — unwrap: `Array.isArray(parsed[0]) ? parsed[0] : parsed`
7. `parseMoodleJsonTs()` converts `DD/MM/YY, HH:MM:SS` → Unix seconds with full precision

**Tab split:** `teacherData` = `modname !== 'url'`; `oerData` = `modname === 'url'`; `allData` = all rows. ALL tab is default.

**Course separator rows** — shown when `sortCol === null`; one per course in `courseRegistry` even if zero rows — followed by `.course-empty-cell` "No data." when empty. Each separator has `.course-sep-heatmap-btn` (`book-open-check.svg`) that opens the heatmap pre-selected to that course.

**Initialization:** `initReady = Promise.all([loadStrategies(), loadSubjects(), loadGradeLevels()])` — awaited at DOMContentLoaded before any fetch.

### Row Object Shape

```js
{
  date,             // MM/DD/YYYY or 'N/A'
  rawTs,            // unix seconds (for INFERRED sort precision)
  dateSource,       // 'VERIFIED' | 'INFERRED' | 'ESTIMATED'
  eventLabel,       // human description of date source
  fromLog,          // boolean: dateSource === 'VERIFIED'
  fullname,         // creator full name
  profileUrl,       // Moodle user profile URL | null
  peakDate,         // MM/DD/YYYY | null
  peakCount,        // number (0 when ESTIMATED)
  activityName,     // decoded module name (may have " (2)" suffix from dedup)
  activityUrl,      // Moodle mod view URL | null
  activityType,     // human label from activityTypeLabel()
  strategy,         // matched strategy name | ''
  subject,          // matched subject name | 'Uncategorized'
  gradeLevel,       // matched grade level | ''
  sectionName,      // course section/topic name (from mod section)
  modname,          // Moodle modname string
  courseIndex,      // position within course modules
  courseGroupIndex, // index of course in multi-course fetch
  courseId,
  courseName,
  courseBaseUrl,
  logUrl,
}
```

## Features

### Columns (render order)

`#` (row num) | Date | User | Activity Type | Activity Name | Subject | Grade Level | Strategy | Logs

**COL_KEYS** (visibility order): `['date','user','activityType','activityName','subject','gradeLevel','strategy','logs']`

**COL_LABELS**: `{ date:'Date', user:'User', activityType:'Activity Type', activityName:'Activity Name', subject:'Subject', gradeLevel:'Grade Level', strategy:'Strategy', logs:'Logs' }`

NCOLS is dynamic: `getNCOLS()` returns `9 - hiddenCols.size`.

### Date Confidence Tiers

| Priority | `dateSource` | Badge | Condition |
|---|---|---|---|
| 1 | `VERIFIED` | LOG (green) | `Course module created` event found in Step 1 |
| 2 | `INFERRED` | FIRST (orange) | Oldest event from Step 2 broad fetch |
| 3 | `ESTIMATED` | EST (yellow) | Both fetches empty; `mod.added` used |

### Date Mode Toggle

- Button `#dateModeBtn` (`.date-mode-toggle` CSS toggle switch — no SVG icon); disabled until fetch succeeds
- **State: `let dateMode = 'peak'` (default)** — reset to `'peak'` on every new fetch
- Active state: CSS class `.date-mode-btn--active` toggled on `dateModeBtn`; never use Tailwind dynamically
- `buildDataRow()` rendering:
  - `'creation'` → `row.date` + LOG/FIRST/EST badge
  - `'peak'` + `row.peakDate` → `row.peakDate` + PEAK badge (`.date-badge-peak`, sky blue)
  - `'peak'` + no `row.peakDate` → falls back to `row.date` + EST badge
- `rowDateKey(row)` converts active date field (MM/DD/YYYY) → YYYY-MM-DD for range comparisons

### Type Filter

- `hiddenTypes` Set; `toggleFilterDropdown`; `#typeFilterIcon` — inline SVG in `<th>`, not an external file
- Dropdown scans `getActiveRows()` so already-hidden values stay accessible

### Date Range Filter

- `dateFrom` / `dateTo` (YYYY-MM-DD | null); `autoDateFrom` / `autoDateTo` — full-range bounds recomputed after each fetch and mode switch
- `computeDateRange(rows)` → `{ min, max }` as YYYY-MM-DD strings
- Filter applied in `applyAndRender()` via `rowDateKey(r)` — respects `dateMode` (uses `peakDate` in peak mode)
- `#dateFilterIcon` — inline SVG calendar icon in `<th>`, not an external file
- `updateDateFilterUI()` highlights icon when range differs from auto bounds
- Both reset to auto bounds on every new fetch

### Column Visibility

- `hiddenCols` Set; `#colVisBtn` (`funnel.svg`); active state `.col-vis-btn--active`
- `applyColVisibility()` toggles `display:none` on `thead th[data-col]` and `#reportTbody td[data-col]`
- Colspans on separator/empty rows updated dynamically via `getNCOLS()`

### Subject Classification

- `getSubject(courseName, activityName, sectionName)` — three-tier fallback in order
- Each tier splits on `|` (pipe) and tries each segment independently against `activeSubjects` keywords
- Returns first match; falls back to `'Uncategorized'`

### Grade Level Classification

- `getGradeLevel(courseName)` — course name only (no multi-tier)
- Returns first keyword match from `activeGradeLevels`; falls back to `''`

### Strategy Classification

- `getStrategy(activityName)` — activity name only
- Returns first keyword match from `activeStrategies`; falls back to `''`

### Activity Heatmap Modal

- Trigger: `#heatmapBtn` (`calendars.svg`) or `.course-sep-heatmap-btn` on separator rows
- Data: course list from `tableData`; row data from `currentRows` (respects active tab + type + date filters)
- State: `heatmapCourses[]` (`{courseName, rows}`), `heatmapCourseIdx`
- Grid: GitHub-style, 7 rows (Mon → Sun), `grid-auto-flow: column`; 13×13 px cells, 2 px gap; `.hm-empty` outside year
- Day-count map keyed `'YYYY-MM-DD'` from `row.rawTs * 1000`; 5 intensity levels `.hm-level-0`…`.hm-level-4`; future → `.hm-future`; tooltip: `"N module(s) on D Month YYYY"`
- Year sections: newest on top; month label widths: `weekSpan × 15 px`
- Navigation: `#heatmapCourseSelect` dropdown; `#heatmapPrevBtn` / `#heatmapNextBtn` (hidden at boundary)
- Dismiss: `#heatmapCloseBtn` or backdrop click

### fetchStudentIds / computePeakDay

- `fetchStudentIds(baseUrl, token, courseId)` — uses `core_enrol_get_enrolled_users`; returns `Set<string>` of IDs with role `student`; IDs stored as `String(user.id)`; returns empty Set on failure, never throws
- `computePeakDay(entries, studentIds)` — when `studentIds.size > 0`: extract user ID from `e.description` via `/user with id '(\d+)'/`; skip if no match or not in Set; when empty Set: count all entries
- **IMPORTANT:** log entries have NO `userid` field — always parse from `e.description`

### buildRows Signature

`buildRows(sections, baseUrl, courseId, token, sessionCookie, fallbackUser, courseName, detectedSubject, courseGroupIndex, onProgress)`

Both callers (`processCourse` and fetchBtn handler) must pass `token` as the 4th argument.

## Icons

All icons: `src/icons/*.svg` (Lucide-style, `stroke="currentColor"`). Always use `<img class="icon-img" alt="">`.

Tinting: `.icon-img` CSS filter in `index.html <style>` block (dark default) + `body.light-mode .icon-img` override. Muted icons: add `style="opacity:0.55"` inline.

| File | Usage |
|---|---|
| `settings.svg` | Credentials button + modal header; settings dropdown gear |
| `logs.svg` | Manage Strategies button + modal header |
| `notebook.svg` | Manage Subjects button + modal header; Manage Grade Levels button + modal header |
| `moon.svg` / `sun.svg` | Dark/light mode toggle |
| `download.svg` | CSV Download button |
| `list-reset.svg` | Reset to Default View button |
| `calendars.svg` | Activity Heatmap button |
| `funnel.svg` | Column Visibility button (`#colVisBtn`) |
| `external-link.svg` | Logs column header + row log link |
| `x.svg` | All modal close buttons |
| `chevron-left.svg` | Heatmap prev-course nav button |
| `chevron-right.svg` | Heatmap next-course nav button |
| `book-open-check.svg` | Course separator row heatmap trigger |
| `eye.svg` | Reveal toggle — show masked credential field |
| `eye-off.svg` | Reveal toggle — hide revealed credential field |

## NEVER DO

- Use `new URL(...).origin` for base URL extraction — strips subdirectory path
- Use inline SVGs or emojis for icons — always `<img class="icon-img" alt="">` from `src/icons/`
- Write multi-property inline styles — define a named class in `src/input.css`; run `npm run build`
- Set Tailwind utility classes dynamically via JS (`className` / `classList`) — JIT scanner won't include them; use custom CSS modifier classes defined in the stylesheet
- Use Alpine `$parent` to mutate ancestor state — use `$dispatch('event')` + `@event.window="..."` on the target
- Hardcode credentials in committed files
- Bind `server.js` to `0.0.0.0` — must stay `127.0.0.1`
- Add npm packages beyond existing devDependencies
- Use `server.py` as the primary dev server — it does not serve `output.css`
- `throw` from a log/scrape helper — return `null` and let `buildRows` handle it

## Coding Standards

**Naming:** `camelCase` functions, `SCREAMING_SNAKE` constants, DOM cache vars match element ID.

**Error handling:**
- All `fetch` calls: `try/catch`, return `null` on failure — callers check for `null`
- Long fetches: `AbortController` + `setTimeout` timeout with `clearTimeout` in `finally`
- Fatal errors → `setStatus(msg, true)` — never `console.error` only

**IMPORTANT — CSS rules:**
- Single-property inline styles are fine: `style="display:none"`, `style="color:#ef4444"`
- Two or more CSS properties → define a named class in `src/input.css`; run `npm run build`
- Theme-aware runtime values → CSS modifier class with `body.light-mode` variant
- `[x-cloak] { display: none }` must exist in the stylesheet

## Gotchas

- **Session cookie expires on Moodle logout** — reports silently return no log data; user must re-paste `MoodleSession`
- **`sesskey` is per-session CSRF token** — if `/course/view.php` fetch fails, all log downloads return empty
- **`output.css` missing or stale** → page renders completely unstyled
- **`parseMoodleJsonTs()` full precision** — required for INFERRED oldest-event selection; do not simplify to date-only
- **Log entries have no `userid` field** — user ID must be extracted from `e.description` via `/user with id '(\d+)'/`; `e.userid` is always undefined
- **`fetchStudentIds` stores IDs as strings** — `String(user.id)`; always compare with string keys, never numbers
- **VERIFIED path does two fetches** — `modaction=c` for creation, then `modaction=''` for peak; the second fetch is intentional and required
- **`dateMode` defaults to `'peak'`** — not `'creation'`; reset to `'peak'` on every new fetch
- **`#dateModeBtn` is a CSS toggle switch** — `.dmt-track` / `.dmt-indicator`; it has no SVG icon

## Recipes

**New activity type label:** Edit `MODULE_FULLNAMES` in `app.js` (~line 87). Key = Moodle `modname` string.

**New sort column:** Button in `index.html` → click listener sets `sortCol` + calls `renderActiveTab()` → add case in `applyHeaderSort()`.

**Change CSV columns:** Edit `hdr` array and `body` row mapping inside `exportCSV()`.

**New icon:** Add SVG to `src/icons/`, use `<img class="icon-img" alt="">`, add row to Icons table above.

**New keyword-mapped column (e.g. grade level pattern):**
1. Add `data/newcol.json` seed file
2. Add `GET` + `POST /newcol` routes in `server.js`
3. Add `DEFAULT_X`, `loadX()`, `getX()` in `app.js` following `loadGradeLevels` / `getGradeLevel` pattern
4. Wire `loadX()` into `initReady` at DOMContentLoaded
5. Add field to row object in `buildRows()`
6. Add to `COL_KEYS` and `COL_LABELS`
7. Add `<th data-col="...">` in `index.html` thead
8. Add `<td data-col="...">` in `buildDataRow()`
9. Add to CSV header and row in `exportCSV()`
10. Add sort case in `applyHeaderSort()`
11. Add manage modal + Alpine component + settings dropdown entry in `index.html`

## Context Triggers

**Proceed without asking:**
- Fix localized to one function with unambiguous intent
- Adding/editing a `MODULE_FULLNAMES` entry
- Changing BATCH size, timeouts, or delay values
- CSS-only changes that don't add new Tailwind classes

**Ask first:**
- Changing tab split logic (`modname !== 'url'`) — affects both tabs and CSV filenames
- Changing row object shape — `renderTable`, `exportCSV`, `applyHeaderSort` all depend on it
- Adding a new credential field — touches `index.html` inputs, `app.js` fetchBtn handler, Alpine component
- Any change to `server.js` request routing
