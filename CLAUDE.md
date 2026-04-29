# Moodle Activity Report — CLAUDE.md

## What This Project Is

A single-page browser tool that generates an activity creation report for a Moodle course. Given a Moodle site URL, a web-service token, a course ID, and a session cookie, it:

1. Fetches all course modules via the Moodle REST API.
2. For each module, scrapes the Moodle log report page to find the real **creation date** and **creator name** (the "Course module created" event).
3. Presents results in a tabbed, sortable table with CSV export.

There is **no back-end processing of Moodle data**. All fetching and parsing happens entirely in the browser. The only server-side component is a thin local CORS proxy that lets the browser reach a remote Moodle instance from `localhost`.

---

## Architecture

```
Browser (index.html + app.js)
        │
        │  fetch() via proxy when running locally
        ▼
Local CORS Proxy (server.js or server.py)  ← port 8080
        │
        │  plain HTTP GET with forwarded Cookie header
        ▼
Remote Moodle Instance
  ├─ /webservice/rest/server.php   (JSON Web Services API)
  └─ /report/log/index.php         (HTML log pages — scraped)
```

When the app is deployed **on the same domain as Moodle**, the proxy is not needed — `isLocal()` returns `false` and all fetches go directly to Moodle. When running from `localhost` or `file://`, every request is routed through the proxy so the browser's same-origin policy is not violated.

---

## File Structure

| File | Purpose |
|---|---|
| `index.html` | Full UI — credentials form, progress bar, tab bar, results table |
| `app.js` | All client-side logic — API calls, log scraping, sorting, rendering, CSV export |
| `server.js` | Node.js CORS proxy (zero npm dependencies, uses built-in `http`/`https`) |
| `server.py` | Python CORS proxy (zero pip dependencies, uses `http.server` + `urllib`) |
| `start.bat` | Windows launcher — tries Node.js, then Python, then Python 3 |
| `src/input.css` | Tailwind CSS entry point (`@import "tailwindcss"`) |
| `output.css` | **Compiled** Tailwind CSS — loaded by `index.html`, must be built before use |
| `package.json` | npm scripts for Tailwind build only; `server.js` has no runtime npm deps |

---

## Running Locally

### Prerequisites

- **Node.js** (v18+) or **Python 3** — to run the CORS proxy
- **Node.js + npm** — to build the CSS (Tailwind CLI)

### First-time setup

```bash
npm install          # installs @tailwindcss/cli and tailwindcss
npm run build        # compiles src/input.css → output.css
```

### Start the proxy + open the app

**Windows (double-click or run):**
```
start.bat
```
This tries Node.js first, then falls back to Python. It also opens `http://localhost:8080` in the default browser automatically.

**Manual Node.js:**
```bash
npm start            # or: node server.js
# then open: http://localhost:8080
```

**Manual Python:**
```bash
python server.py     # or: python3 server.py
# then open: http://localhost:8080
```

### During CSS development

```bash
npm run watch        # rebuilds output.css on every change to src/input.css or index.html
```

---

## npm Scripts

| Script | Command | What it does |
|---|---|---|
| `start` | `node server.js` | Starts the local CORS proxy |
| `build` | `tailwindcss -i src/input.css -o output.css --minify` | One-shot CSS build |
| `watch` | `tailwindcss -i src/input.css -o output.css --watch` | CSS hot-rebuild |

---

## Credentials Required (UI Inputs)

| Field | Where to get it |
|---|---|
| **Moodle Site URL** | Base URL, e.g. `https://yourmoodle.edu` |
| **Web Service Token** | Moodle admin → Site admin → Plugins → Web services → Manage tokens. Must belong to the `moodle_mobile_app` service. |
| **Course ID** | The numeric `id` in the course URL: `/course/view.php?id=2` |
| **Session Cookie** | Browser DevTools → Application → Cookies → `MoodleSession` value. **Must be from an active admin session.** Expires on logout. |

> The session cookie is required because Moodle does not expose log data via web services. The tool reads log HTML pages directly, which requires an authenticated session.

The HTML file currently has credentials hard-coded in the `value` attributes of the inputs (`index.html` lines 30, 37, 45, 55). These are dev defaults — change or clear them before sharing.

---

## Data Flow in Detail

### 1. Trigger (`fetchBtn` click)

Three requests fire in parallel:

| Request | API / Endpoint | Purpose |
|---|---|---|
| `core_course_get_courses` | Web services | Resolve course `fullname` |
| `core_course_get_contents` | Web services | All sections + modules |
| `core_enrol_get_enrolled_users` | Web services | Fallback creator (earliest `firstaccess`) |

### 2. Log page scraping (`buildRows`)

For every module returned by `core_course_get_contents`, the tool fetches:

```
/report/log/index.php?chooselog=1&id={courseId}&modid={cmid}&modaction=c&logreader=logstore_standard
```

It parses the first "Course module created" row it finds, extracting:
- **Date** — cell 0, parsed via `parseMoodleDate()` (handles ISO strings and `DD Month YYYY` formats)
- **Creator** — first `<a href*="/user/">` link in columns 0–3

If the event is on a later page (paginated logs), it also fetches the last page. Scraping runs in **batches of 6 concurrent requests** (`BATCH = 6` in `buildRows`).

### 3. Row object

Each module becomes a row object:

```js
{
  date,         // MM/DD/YYYY string — from log page, or formatDate(mod.added)
  rawTs,        // Unix timestamp — parseDateStrToTs(log date) || mod.added || mod.timecreated
  fromLog,      // boolean — true if date+creator came from log scrape
  fullname,     // creator name — from log, fallbackUser, or 'Unknown'
  profileUrl,   // Moodle profile link or null
  activityName, // mod.name
  activityUrl,  // /mod/{modname}/view.php?id={cmid}
  activityType, // human-readable label from MODULE_FULLNAMES or activityTypeLabel()
  modname,      // raw Moodle modname ('assign', 'url', 'resource', …)
  courseIndex,  // original position in the flattened module list
  logUrl,       // link to the log page for this module
}
```

### 4. Tabs

`tableData` is split once after `buildRows` completes:

- **Teachers Creation** tab: `tableData.filter(r => r.modname !== 'url')`
- **OER** tab: `tableData.filter(r => r.modname === 'url')` — URL-type activities only

### 5. Sort (`applySort`)

`rawTs` drives all sorting. It is set to the highest-confidence timestamp available (log-parsed date first, then `mod.added`, then `mod.timecreated`). This ensures the sort order matches the displayed date column.

| Mode | Logic |
|---|---|
| Oldest First (default) | `a.rawTs - b.rawTs`, ties broken by `parseDateStrToTs(date)` |
| Newest First | `b.rawTs - a.rawTs`, same tie-break reversed |
| Course Order | original `courseIndex` from `core_course_get_contents` |

### 6. Date confidence badges

Every row in the table shows a small badge:
- **LOG** (green) — date and creator were read from the actual log page
- **EST** (amber) — log page was unavailable; date comes from `mod.added` or `mod.timecreated`

---

## Activity Type Labels

`activityTypeLabel()` maps Moodle `modname` to a human-readable string. For `resource` modules it also inspects `mod.contents[].filename` to append a file category (`File - Documents`, `File - Video`, etc.).

The full map is in `MODULE_FULLNAMES` (`app.js` lines 38–49) — 30 entries. Unknown modnames fall back to title-case of the raw string.

---

## CSV Export

`downloadBtn` is context-aware — it always exports the **currently active tab's** data in the current sort order.

Columns exported: `Date`, `Created By`, `Activity Name`, `Activity Type`.

If the course name matches `^(\d+)\s*-\s*` (e.g. `101 - Introduction`), the numeric prefix is prepended to every Activity Name in the CSV (`coursePrefix()`).

Filename pattern:
- Teachers tab: `moodle_course_{id}_teachers_creation.csv`
- OER tab: `moodle_course_{id}_oer.csv`

The CSV is UTF-8 with BOM (`﻿`) so Excel opens it correctly without encoding issues.

---

## The CORS Proxy

Both proxy implementations (`server.js` / `server.py`) behave identically:

- Listens on `127.0.0.1:8080` only (not exposed to the network)
- `GET /proxy?url=<encoded>&cookie=<session>&accept=<mime>` — fetches the target URL, forwards the cookie, streams the response back with `Access-Control-Allow-Origin: *`
- `GET /` and `GET /*` — serves `index.html` (and `output.css`/`app.js` for known extensions)
- `OPTIONS` — responds 204 with CORS headers for preflight

The `start.bat` launcher prefers Node.js because it handles binary streaming more efficiently, but the Python version is functionally equivalent.

---

## CSS / Styling

- **Tailwind CSS v4** — utility-first, compiled to `output.css`
- `src/input.css` contains only `@import "tailwindcss"` — Tailwind's JIT scanner reads class names from `index.html` and `app.js` automatically
- **Run `npm run build` any time you add new Tailwind utility classes to `index.html`** — otherwise the class will be missing from `output.css` at runtime
- Dynamic UI states in `app.js` (`updateTabUI`, `updateSortUI`) use **inline styles** intentionally to avoid depending on compiled Tailwind classes that may not be in `output.css`

---

## Key DOM IDs

| ID | Element | Used for |
|---|---|---|
| `moodleUrl` | input | Moodle base URL |
| `wsToken` | input | Web service token |
| `courseId` | input | Course ID |
| `sessionKey` | input | Session cookie |
| `fetchBtn` | button | Trigger report generation |
| `statusMessage` | div | Status / error display |
| `progressWrap` | div | Progress bar container (hidden/shown) |
| `progressBar` | div | Bar fill (width set via inline style) |
| `progressPct` | span | Percentage label |
| `progressLabel` | span | Step description |
| `corsNotice` | div | CORS error banner (hidden/shown) |
| `courseNameSection` | div | Course name banner (hidden/shown) |
| `courseNameDisplay` | a | Course name link |
| `tabTeachers` | button | Teachers Creation tab |
| `tabOer` | button | OER tab |
| `countTeachers` | span | Badge inside Teachers tab |
| `countOer` | span | Badge inside OER tab |
| `sortOldest` | button | Sort: oldest first |
| `sortNewest` | button | Sort: newest first |
| `sortCourse` | button | Sort: course order |
| `downloadBtn` | button | Download CSV (context-aware) |
| `rowCount` | span | "N entries" counter |
| `reportTbody` | tbody | Table rows |

---

## Known Constraints & Gotchas

- **Session cookie expires** when the Moodle user logs out. Reports fail silently or return empty log pages if the session is stale.
- **Log scraping is slow** — each module requires at least one HTTP round-trip to Moodle's log page. A course with 100 modules takes ~17 sequential batches at 6 concurrent requests each.
- **CORS on non-local deployments** — if this file is served from a different origin than Moodle (not `localhost` and not the same domain), the browser will block log page requests. The CORS notice in the UI explains this.
- **`server.py` does not serve static assets** — it only serves `index.html` for all non-proxy routes. `output.css` and `app.js` are **not** served by the Python proxy. Use `server.js` (or Node.js `npm start`) for local development so that `output.css` and `app.js` are served correctly.
- **`output.css` must be built** before opening `index.html` directly from the file system — without it the page renders unstyled.
- **Hardcoded credentials** in `index.html` input `value` attributes are dev defaults. Remove before any shared or production deployment.

---

## Making Changes

### Adding a new activity type label

Edit `MODULE_FULLNAMES` in `app.js` (line 38). Key is the Moodle `modname` (lowercase), value is the display string.

### Changing the tab split logic

Edit lines 576–577 in `app.js`:
```js
teacherData = tableData.filter(r => r.modname !== 'url');
oerData     = tableData.filter(r => r.modname === 'url');
```

### Adding a new sort mode

1. Add a button in `index.html` with a new `id`
2. Add an event listener in `app.js` that sets `sortMode` and calls `renderActiveTab()`
3. Add the case to `applySort()` and `updateSortUI()`

### Changing the CSV columns

Edit the `hdr` array and `body` mapping inside `exportCSV()` (`app.js` line 480).

### Rebuilding CSS after HTML changes

```bash
npm run build
```
