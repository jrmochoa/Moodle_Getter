# Moodle Activity Report — Prompt Engineer Notes

These are workflow rules and constraints for working with an AI coding assistant on this project. They do not belong in CLAUDE.md, which is for project rules only.

## Verification Checklist

Run after every code change before claiming completion:

1. `npm run build` completes without errors
2. `grep -P 'style="[^"]*;[^"]*;' index.html app.js` returns zero results (no multi-prop inline styles)
3. `npm start` → open `http://localhost:8080` → trigger a report fetch
4. Table renders; badges show correct VERIFIED / INFERRED / ESTIMATED tiers; Date Mode toggle switches between creation and peak modes
5. Dark/light toggle, CSV download, type filter, date range filter, column visibility all function correctly
6. No CORS errors in browser DevTools Network tab

## Workflow Rules

- Run `npm run build` after every CSS class addition, before testing
- Commit `data/*.json` seed files alongside the features that need them
- When adding a new column type (like subject/grade level), follow the 11-step recipe in CLAUDE.md exactly — all steps are required
- Test column visibility toggle after any table structure change — hidden cols use `data-col` selectors
- Test the heatmap modal after any row object shape change — it reads `row.rawTs`

## Common Debugging Patterns

**Blank table / no rows showing:**
- Check `sesskey` — if null, all log fetches fail silently and rows show ESTIMATED with no user
- Check `output.css` is not stale — run `npm run build`
- Check browser DevTools Network for CORS errors
- Check `isExcludedRow()` — announcement forums with non-VERIFIED dates are excluded automatically

**Strategy/subject/grade level all showing blank:**
- `initReady` may not have resolved — check that DOMContentLoaded fired and all three load functions completed
- Check that `activeStrategies`, `activeSubjects`, `activeGradeLevels` are non-empty in console
- Server returns `{ strategies: [...] }` shape — `loadStrategies()` reads `data.strategies`; same pattern for subjects/gradelevels

**Date filter not filtering correctly:**
- `rowDateKey(row)` reads `peakDate` when `dateMode === 'peak'` — check that mode is what you expect
- Range filter uses YYYY-MM-DD string comparison — check that `autoDateFrom`/`autoDateTo` were populated

**Column colspan wrong after adding/removing a column:**
- `getNCOLS()` returns `9 - hiddenCols.size` — the hardcoded `9` must match total column count (including `#` num col)
- Update the hardcoded `9` in `getNCOLS()` whenever columns are added or removed

## Multi-Course Fetch Notes

- `courseRegistry` maintains ordered list of fetched courses — separator rows always match this order
- `courseGroupIndex` is assigned at fetch time; never reassigned — stable across re-renders
- `deduplicateActivityNames()` scopes deduplication per `courseGroupIndex` — same name in different courses is fine
- Snapshot state (`snapshotAllData`, etc.) stores the result before reset — `resetTable()` restores from snapshot

## Alpine.js Constraints

- Root component: `credentialsApp()` on `<body x-data="...">`
- Modal state lives in `credentialsApp`: `settingsOpen`, `strategyOpen`, `subjectOpen`, `gradeLevelOpen`
- Separate Alpine components (e.g. `gradeLevelApp()`) must communicate via `$dispatch` / `@event.window` — never `$parent`
- `x-cloak` hides elements before Alpine initializes — `[x-cloak] { display: none }` must exist in stylesheet

## CSS Change Protocol

1. Add the new class to `src/input.css`
2. Run `npm run build` — output goes to `output.css`
3. Verify the class appears in `output.css` before testing in browser
4. Never add dynamic Tailwind classes via JS — the JIT scanner only sees static HTML
