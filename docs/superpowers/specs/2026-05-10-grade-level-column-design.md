# Grade Level Column — Design Spec
**Date:** 2026-05-10  
**Status:** Approved

## Overview

Add a Grade Level column to the Moodle Activity Report following the exact same pattern as Subject (keyword-matching, editable via a modal manager, persisted server-side). Grade Level is a course-level attribute detected from the course name only.

## Data File — data/gradelevels.json

New file. Same shape as `subjects.json`: array of `{ name, keywords, isDefault }`.

Seed entries (Grade 7–12):

| name | keywords |
|---|---|
| Grade 7 | Grade 7, G7, Gr. 7, Grade7, Gr7 |
| Grade 8 | Grade 8, G8, Gr. 8, Grade8, Gr8 |
| Grade 9 | Grade 9, G9, Gr. 9, Grade9, Gr9 |
| Grade 10 | Grade 10, G10, Gr. 10, Grade10, Gr10 |
| Grade 11 | Grade 11, G11, Gr. 11, Grade11, Gr11 |
| Grade 12 | Grade 12, G12, Gr. 12, Grade12, Gr12 |

All entries have `isDefault: true`.

## Server — server.js

- Add `GRADELEVELS_FILE` constant: `path.join(__dirname, 'data', 'gradelevels.json')`
- Add `DEFAULT_GRADE_LEVELS` array (mirrors the JSON seed above)
- Add startup seed check: `if (!fs.existsSync(GRADELEVELS_FILE))` → write DEFAULT_GRADE_LEVELS
- Add `GET /gradelevels` route: reads file, returns `{ gradelevels: data }`
- Add `POST /gradelevels` route: validates `payload.gradelevels` is a non-empty array, writes file, returns `{ ok: true }`
- Error handling and CORS headers follow existing `/subjects` pattern exactly

## App — app.js

### New state variables
```js
let activeGradeLevels = [];
```

### New constant
```js
const DEFAULT_GRADE_LEVELS = [ /* mirrors gradelevels.json seed */ ];
```

### New functions
```js
async function loadGradeLevels() {
    // same pattern as loadSubjects()
    // fetch /gradelevels (local) or /api/gradelevels (remote)
    // fallback to DEFAULT_GRADE_LEVELS on error
}

function getGradeLevel(courseName) {
    // match only courseName — no activityName or sectionName fallback
    // same keyword loop as getSubject() but single candidate
}
```

### initReady
Change `Promise.all([loadStrategies(), loadSubjects()])` to include `loadGradeLevels()`.

### gradelevels-updated listener
```js
window.addEventListener('gradelevels-updated', async () => {
    await loadGradeLevels();
    if (tableData.length > 0) {
        tableData.forEach(r => { r.gradeLevel = getGradeLevel(r.courseName || ''); });
        renderActiveTab();
    }
});
```

### Row object (buildRows)
Add `gradeLevel: getGradeLevel(courseName)` to the row object, alongside `subject`.

### Re-sync block
Add alongside subject re-sync: `tableData.forEach(r => { r.gradeLevel = getGradeLevel(r.courseName || ''); });`

### CSV export
Add `'Grade Level'` header and `r.gradeLevel || ''` value **between Subject and Strategy** (matching table column order).

### COL_KEYS / COL_LABELS
Add `'gradeLevel'` to `COL_KEYS` after `'subject'`.  
Add `gradeLevel: 'Grade Level'` to `COL_LABELS`.

### buildDataRow
Add a `tdGradeLevel` cell (same structure as `tdSubject`) with `data-col="gradeLevel"`.  
Uses same link style as subject (purple link, hover underline, links to course).

### Column placement
Subject → **Grade Level** → Strategy → Logs

## UI — index.html

### thead
Add `<th data-sort="gradeLevel" data-col="gradeLevel" class="th-cell-nowrap">Grade Level<span class="sort-ind">⇅</span></th>` between Subject and Strategy th elements.

### Alpine state (credentialsApp)
Add `gradeLevelOpen: false` to the root Alpine component data object.

### Settings dropdown
Add "Manage Grade Levels" button between "Manage Subject" and strategies button — follows exact same pattern with `notebook.svg` icon.

### Modal
Add `gradeLevelApp()` Alpine component modal, following `subjectApp()` exactly:
- `GET /gradelevels` on init
- `POST /gradelevels` on save
- `$dispatch('gradelevels-updated')` after save
- `$dispatch('gradelevel-close')` for close
- Same add/remove/keyword chip UI

### NCOLS
Update `getNCOLS()` to reflect +1 for Grade Level column.

## CSS — src/input.css

No new classes expected — grade level cell reuses `.td-cell` and `.subject-link` exactly.  
Only add a named class if a strictly required style cannot be satisfied by existing classes.

## Constraints

- No credentials hardcoded
- Server binds only to `127.0.0.1`
- No throws from log/scrape helpers
- `npm run build` after any new Tailwind class
- `getGradeLevel` returns `null`/`''` on no match — never throws
