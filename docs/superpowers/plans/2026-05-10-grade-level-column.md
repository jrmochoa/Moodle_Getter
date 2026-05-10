# Grade Level Column Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Grade Level column (keyword-matched from course name, editable via modal) across all five files, following the exact Subject pattern.

**Architecture:** Grade level is detected per-row inside `buildRows()` by matching course name against `activeGradeLevels` keywords. It persists server-side in `data/gradelevels.json`, is managed via a `gradeLevelApp()` Alpine modal, and re-syncs across `tableData` when the `gradelevels-updated` event fires.

**Tech Stack:** Vanilla JS (ES2022), Alpine.js v3, Tailwind CSS v4 (compiled), Node.js built-in HTTP.

---

### Task 1: Create data/gradelevels.json

**Files:**
- Create: `data/gradelevels.json`

- [ ] **Step 1: Create the seed file**

Create `data/gradelevels.json` with this exact content:

```json
[
  {
    "name": "Grade 7",
    "keywords": ["Grade 7", "G7", "Gr. 7", "Grade7", "Gr7"],
    "isDefault": true
  },
  {
    "name": "Grade 8",
    "keywords": ["Grade 8", "G8", "Gr. 8", "Grade8", "Gr8"],
    "isDefault": true
  },
  {
    "name": "Grade 9",
    "keywords": ["Grade 9", "G9", "Gr. 9", "Grade9", "Gr9"],
    "isDefault": true
  },
  {
    "name": "Grade 10",
    "keywords": ["Grade 10", "G10", "Gr. 10", "Grade10", "Gr10"],
    "isDefault": true
  },
  {
    "name": "Grade 11",
    "keywords": ["Grade 11", "G11", "Gr. 11", "Grade11", "Gr11"],
    "isDefault": true
  },
  {
    "name": "Grade 12",
    "keywords": ["Grade 12", "G12", "Gr. 12", "Grade12", "Gr12"],
    "isDefault": true
  }
]
```

- [ ] **Step 2: Commit**

```bash
git add data/gradelevels.json
git commit -m "feat: add gradelevels.json seed file"
```

---

### Task 2: Add /gradelevels routes to server.js

**Files:**
- Modify: `server.js`

- [ ] **Step 1: Add GRADELEVELS_FILE constant**

After line 19 (`const SUBJECTS_FILE = ...`), insert:

```js
const GRADELEVELS_FILE = path.join(__dirname, 'data', 'gradelevels.json');
```

- [ ] **Step 2: Add DEFAULT_GRADE_LEVELS seed array**

After the closing `];` of `DEFAULT_SUBJECTS` (after line 77), insert:

```js
const DEFAULT_GRADE_LEVELS = [
    { "name": "Grade 7",  "keywords": ["Grade 7",  "G7",  "Gr. 7",  "Grade7",  "Gr7"],  "isDefault": true },
    { "name": "Grade 8",  "keywords": ["Grade 8",  "G8",  "Gr. 8",  "Grade8",  "Gr8"],  "isDefault": true },
    { "name": "Grade 9",  "keywords": ["Grade 9",  "G9",  "Gr. 9",  "Grade9",  "Gr9"],  "isDefault": true },
    { "name": "Grade 10", "keywords": ["Grade 10", "G10", "Gr. 10", "Grade10", "Gr10"], "isDefault": true },
    { "name": "Grade 11", "keywords": ["Grade 11", "G11", "Gr. 11", "Grade11", "Gr11"], "isDefault": true },
    { "name": "Grade 12", "keywords": ["Grade 12", "G12", "Gr. 12", "Grade12", "Gr12"], "isDefault": true },
];
```

- [ ] **Step 3: Add startup seed check for gradelevels.json**

In the startup seed block (after the `if (!fs.existsSync(SUBJECTS_FILE))` block, around line 86), insert:

```js
if (!fs.existsSync(GRADELEVELS_FILE)) {
    fs.writeFileSync(GRADELEVELS_FILE, JSON.stringify(DEFAULT_GRADE_LEVELS, null, 2), 'utf8');
}
```

- [ ] **Step 4: Add GET /gradelevels route**

After the closing `return;` of the `GET /subjects` block (after line 159), insert:

```js
    // GET /gradelevels
    if (req.method === 'GET' && parsed.pathname === '/gradelevels') {
        try {
            const data = JSON.parse(fs.readFileSync(GRADELEVELS_FILE, 'utf8'));
            res.writeHead(200, { ...CORS, 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ gradelevels: data }));
        } catch {
            res.writeHead(500, { ...CORS, 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Failed to read gradelevels' }));
        }
        return;
    }
```

- [ ] **Step 5: Add POST /gradelevels route**

After the closing `return;` of the `POST /subjects` block (after line 186), insert:

```js
    // POST /gradelevels
    if (req.method === 'POST' && parsed.pathname === '/gradelevels') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                const payload = JSON.parse(body);
                if (!payload || !Array.isArray(payload.gradelevels) || payload.gradelevels.length === 0) {
                    res.writeHead(400, { ...CORS, 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Invalid payload' }));
                    return;
                }
                fs.writeFileSync(GRADELEVELS_FILE, JSON.stringify(payload.gradelevels, null, 2), 'utf8');
                res.writeHead(200, { ...CORS, 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true }));
            } catch {
                res.writeHead(500, { ...CORS, 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Failed to save gradelevels' }));
            }
        });
        req.on('error', () => {
            res.writeHead(500, { ...CORS, 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Failed to save gradelevels' }));
        });
        return;
    }
```

- [ ] **Step 6: Commit**

```bash
git add server.js
git commit -m "feat: add GET/POST /gradelevels routes to server.js"
```

---

### Task 3: Add grade level state, functions, and data wiring to app.js

**Files:**
- Modify: `app.js`

- [ ] **Step 1: Add activeGradeLevels state variable**

On line 48, after `let activeSubjects   = [];`, insert:

```js
let activeGradeLevels = [];
```

- [ ] **Step 2: Update sortCol comment**

On line 44, replace:

```js
let sortCol          = null;       // null | 'rawTs' | 'fullname' | 'activityName' | 'activityType' | 'subject' | 'strategy'
```

with:

```js
let sortCol          = null;       // null | 'rawTs' | 'fullname' | 'activityName' | 'activityType' | 'subject' | 'gradeLevel' | 'strategy'
```

- [ ] **Step 3: Update COL_KEYS and COL_LABELS**

On line 101, replace:

```js
const COL_KEYS     = ['date','user','activityType','activityName','subject','strategy','logs'];
const COL_LABELS   = { date:'Date', user:'User', activityType:'Activity Type', activityName:'Activity Name', subject:'Subject', strategy:'Strategy', logs:'Logs' };
```

with:

```js
const COL_KEYS     = ['date','user','activityType','activityName','subject','gradeLevel','strategy','logs'];
const COL_LABELS   = { date:'Date', user:'User', activityType:'Activity Type', activityName:'Activity Name', subject:'Subject', gradeLevel:'Grade Level', strategy:'Strategy', logs:'Logs' };
```

- [ ] **Step 4: Add DEFAULT_GRADE_LEVELS constant**

After the closing `];` of `DEFAULT_SUBJECTS` (after line 183), insert:

```js
// ── Grade Levels — in-memory fallback seed ───────────────────────────────────

const DEFAULT_GRADE_LEVELS = [
    { name:'Grade 7',  keywords:['Grade 7', 'G7', 'Gr. 7', 'Grade7', 'Gr7'],   isDefault:true },
    { name:'Grade 8',  keywords:['Grade 8', 'G8', 'Gr. 8', 'Grade8', 'Gr8'],   isDefault:true },
    { name:'Grade 9',  keywords:['Grade 9', 'G9', 'Gr. 9', 'Grade9', 'Gr9'],   isDefault:true },
    { name:'Grade 10', keywords:['Grade 10','G10','Gr. 10','Grade10','Gr10'],   isDefault:true },
    { name:'Grade 11', keywords:['Grade 11','G11','Gr. 11','Grade11','Gr11'],   isDefault:true },
    { name:'Grade 12', keywords:['Grade 12','G12','Gr. 12','Grade12','Gr12'],   isDefault:true },
];

async function loadGradeLevels() {
    try {
        const res = await fetch(isLocal() ? '/gradelevels' : '/api/gradelevels');
        if (!res.ok) throw new Error();
        const data = await res.json();
        activeGradeLevels = Array.isArray(data) ? data : data.gradelevels;
    } catch (_) {
        activeGradeLevels = DEFAULT_GRADE_LEVELS;
    }
}

function getGradeLevel(courseName) {
    if (!courseName) return '';
    const name = courseName.toLowerCase();
    for (const g of activeGradeLevels) {
        if (g.keywords?.some(kw => name.includes(kw.toLowerCase()))) return g.name;
    }
    return '';
}
```

- [ ] **Step 5: Add gradeLevel to the row object in buildRows**

On line 574, after `subject: getSubject(courseName, modName, sectionName),`, insert:

```js
            gradeLevel:       getGradeLevel(courseName),
```

So the block reads:

```js
            strategy:         getStrategy(modName),
            subject:          getSubject(courseName, modName, sectionName),
            gradeLevel:       getGradeLevel(courseName),
            sectionName,
```

- [ ] **Step 6: Add tdGradeLevel cell in buildDataRow**

After line 703 (`tdSubject.appendChild(subjectLink);`), before `const tdStrategy = ...`, insert:

```js
    const tdGradeLevel = document.createElement('td');
    tdGradeLevel.className = 'td-cell';
    tdGradeLevel.dataset.col = 'gradeLevel';
    const gradeLevelLink = document.createElement('a');
    gradeLevelLink.href    = `${row.courseBaseUrl}/course/view.php?id=${row.courseId}`;
    gradeLevelLink.target  = '_blank';
    gradeLevelLink.rel     = 'noopener';
    gradeLevelLink.title   = row.courseName || '';
    gradeLevelLink.textContent = row.gradeLevel || '—';
    gradeLevelLink.className = 'subject-link';
    gradeLevelLink.style.color = dark ? '#a78bfa' : '#7c3aed';
    gradeLevelLink.onmouseover = () => gradeLevelLink.style.textDecoration = 'underline';
    gradeLevelLink.onmouseout  = () => gradeLevelLink.style.textDecoration = 'none';
    tdGradeLevel.appendChild(gradeLevelLink);
```

- [ ] **Step 7: Add tdGradeLevel to tr.append()**

On line 735, replace:

```js
    tr.append(tdNum, tdDate, tdUser, tdType, tdName, tdSubject, tdStrategy, tdLog);
```

with:

```js
    tr.append(tdNum, tdDate, tdUser, tdType, tdName, tdSubject, tdGradeLevel, tdStrategy, tdLog);
```

- [ ] **Step 8: Update getNCOLS**

On line 765, replace:

```js
function getNCOLS() { return 8 - hiddenCols.size; }
```

with:

```js
function getNCOLS() { return 9 - hiddenCols.size; }
```

- [ ] **Step 9: Update CSV export**

In `exportCSV`, on line 1496, replace:

```js
    const hdr  = [dateHeader, 'User', 'Activity Type', 'Activity Name', 'Subject', 'Strategy', 'Course Name', 'Activity URL'];
```

with:

```js
    const hdr  = [dateHeader, 'User', 'Activity Type', 'Activity Name', 'Subject', 'Grade Level', 'Strategy', 'Course Name', 'Activity URL'];
```

On line 1505, after `r.subject || '',`, insert `r.gradeLevel || '',` so the body array reads:

```js
        return [
            exportDate,
            r.fullname,
            r.activityType,
            prefix + r.activityName,
            r.subject     || '',
            r.gradeLevel  || '',
            r.strategy    || '',
            r.courseName  || '',
            r.activityUrl || '',
        ];
```

- [ ] **Step 10: Add gradelevels-updated window event listener**

After the closing `});` of the `subjects-updated` listener (after line 1655), insert:

```js
window.addEventListener('gradelevels-updated', async () => {
    await loadGradeLevels();
    if (tableData.length > 0) {
        tableData.forEach(r => { r.gradeLevel = getGradeLevel(r.courseName || ''); });
        renderActiveTab();
    }
});
```

- [ ] **Step 11: Add loadGradeLevels() to initReady Promise.all**

On line 1658, replace:

```js
    initReady = Promise.all([loadStrategies(), loadSubjects()]);
```

with:

```js
    initReady = Promise.all([loadStrategies(), loadSubjects(), loadGradeLevels()]);
```

- [ ] **Step 12: Commit**

```bash
git add app.js
git commit -m "feat: add grade level state, functions, row field, cell, and CSV to app.js"
```

---

### Task 4: Add Grade Level column and modal to index.html

**Files:**
- Modify: `index.html`

- [ ] **Step 1: Add Grade Level th in thead**

On line 531, after the Subject th:

```html
<th data-sort="subject" data-col="subject" class="th-cell-nowrap">Subject<span class="sort-ind">⇅</span></th>
```

insert immediately after:

```html
<th data-sort="gradeLevel" data-col="gradeLevel" class="th-cell-nowrap">Grade Level<span class="sort-ind">⇅</span></th>
```

- [ ] **Step 2: Add gradeLevelOpen to credentialsApp state**

On line 592, after `subjectOpen: false,`, insert:

```js
        gradeLevelOpen:   false,
```

- [ ] **Step 3: Add Manage Grade Levels button to settings dropdown**

After the Manage Subject button block (lines 401–404):

```html
<button @click="subjectOpen = true; settingsMenuOpen = false" class="settings-dropdown-item">
    <img src="src/icons/notebook.svg" width="14" height="14" class="icon-img" alt="">
    Manage Subject
</button>
```

insert immediately after:

```html
<button @click="gradeLevelOpen = true; settingsMenuOpen = false" class="settings-dropdown-item">
    <img src="src/icons/notebook.svg" width="14" height="14" class="icon-img" alt="">
    Manage Grade Levels
</button>
```

- [ ] **Step 4: Add Grade Level Manager modal**

After the closing `</div>` of the Subject Manager modal block (after line 306 `</div>`), before the `<!-- ── Heatmap day tooltip` comment, insert:

```html
<!-- ── Grade Level Manager Backdrop + Modal ──────────────────────────────────── -->
<div
    class="modal-backdrop modal-overlay"
    x-show="gradeLevelOpen"
    x-cloak
    x-transition:enter="transition-opacity ease-out duration-200"
    x-transition:enter-start="opacity-0"
    x-transition:enter-end="opacity-100"
    x-transition:leave="transition-opacity ease-in duration-150"
    x-transition:leave-start="opacity-100"
    x-transition:leave-end="opacity-0"
    @click.self="gradeLevelOpen = false"
    @keydown.escape.window="gradeLevelOpen = false"
    @gradelevel-close.window="gradeLevelOpen = false">

    <div id="gradeLevelModal" class="tech-card modal-card-lg" x-data="gradeLevelApp()"
         @click.stop>

        <!-- Modal header -->
        <div class="modal-header">
            <div class="modal-title-row-lg">
                <img src="src/icons/notebook.svg" width="15" height="15" class="icon-img" alt="">
                <span class="tech-title modal-title">Grade Level Manager</span>
                <span x-show="status === 'saving'" x-cloak class="modal-status-saving">saving…</span>
                <span x-show="status === 'saved'"  x-cloak class="modal-status-saved">✓ saved</span>
                <span x-show="status === 'error'"  x-cloak class="modal-status-error">save failed</span>
            </div>
            <button @click="$dispatch('gradelevel-close')" class="header-icon-btn modal-close-btn" title="Close">
                <img src="src/icons/x.svg" width="13" height="13" class="icon-img" alt="">
            </button>
        </div>

        <!-- Inline error -->
        <div x-show="error" x-cloak class="modal-error-bar">
            <span class="modal-error-text" x-text="error"></span>
            <button @click="error = ''" class="modal-error-dismiss">×</button>
        </div>

        <!-- Add new grade level -->
        <div class="modal-add-section">
            <div class="modal-section-label">Add Grade Level</div>
            <div class="modal-add-row">
                <input type="text" class="tech-input modal-add-input" x-model="newGradeLevelName"
                    placeholder="Grade level name"
                    @keydown.enter="addGradeLevel()">
                <input type="text" class="tech-input modal-add-input" x-model="newGradeLevelKeyword"
                    placeholder="First keyword (optional)"
                    @keydown.enter="addGradeLevel()">
                <button @click="addGradeLevel()" class="tech-btn btn-add">+ Add</button>
            </div>
        </div>

        <!-- Grade levels list — scrollable -->
        <div class="modal-list">
            <template x-for="gradeLevel in gradeLevels" :key="gradeLevel.name">
                <div class="modal-list-item">

                    <!-- Name row -->
                    <div class="list-item-header">
                        <span class="item-name" x-text="gradeLevel.name"></span>
                        <template x-if="!gradeLevel.isDefault">
                            <button @click="deleteGradeLevel(gradeLevel.name)" class="btn-remove">× Remove</button>
                        </template>
                        <template x-if="gradeLevel.isDefault">
                            <span class="badge-default">default</span>
                        </template>
                    </div>

                    <!-- Keywords -->
                    <div class="keywords-row">
                        <template x-for="kw in gradeLevel.keywords" :key="kw">
                            <span class="keyword-chip">
                                <span x-text="kw"></span>
                                <button @click="removeKeyword(gradeLevel.name, kw)" class="keyword-remove-btn">×</button>
                            </span>
                        </template>
                        <input type="text"
                            :value="keywordInputs[gradeLevel.name] || ''"
                            @input="keywordInputs[gradeLevel.name] = $event.target.value"
                            @keydown.enter="addKeyword(gradeLevel.name)"
                            placeholder="+ keyword"
                            class="tech-input keyword-input">
                        <button @click="addKeyword(gradeLevel.name)" class="btn-add-keyword">Add</button>
                    </div>

                </div>
            </template>
        </div>

    </div>
</div>
```

- [ ] **Step 5: Add gradeLevelApp() Alpine component script**

After the closing `}` of `subjectApp()` and its `</script>` tag (after line 915 `</script>`), insert a new `<script>` block before `<script src="app.js">`:

```html
<script>
function gradeLevelApp() {
  return {
    gradeLevels: [],
    newGradeLevelName: '',
    newGradeLevelKeyword: '',
    keywordInputs: {},
    status: '',
    error: '',

    async init() {
      const res = await fetch('/gradelevels');
      const data = await res.json();
      this.gradeLevels = data.gradelevels || [];
    },

    isKeywordDuplicate(keyword, excludeName = null) {
      const kw = keyword.trim().toLowerCase();
      for (const g of this.gradeLevels) {
        if (g.name === excludeName) continue;
        if (g.keywords.map(k => k.toLowerCase()).includes(kw)) return g.name;
      }
      return null;
    },

    async addKeyword(gradeLevelName) {
      const kw = (this.keywordInputs[gradeLevelName] || '').trim();
      if (!kw) return;
      const owner = this.isKeywordDuplicate(kw);
      if (owner) { this.error = `"${kw}" is already used by "${owner}"`; return; }
      this.error = '';
      const g = this.gradeLevels.find(g => g.name === gradeLevelName);
      if (g) g.keywords.push(kw);
      this.keywordInputs[gradeLevelName] = '';
      await this.save();
    },

    removeKeyword(gradeLevelName, keyword) {
      const g = this.gradeLevels.find(g => g.name === gradeLevelName);
      if (g) g.keywords = g.keywords.filter(k => k !== keyword);
      this.save();
    },

    async addGradeLevel() {
      const name = this.newGradeLevelName.trim();
      const kw   = this.newGradeLevelKeyword.trim();
      if (!name) return;
      if (this.gradeLevels.find(g => g.name.toLowerCase() === name.toLowerCase())) {
        this.error = `Grade level "${name}" already exists.`; return;
      }
      if (kw) {
        const owner = this.isKeywordDuplicate(kw);
        if (owner) { this.error = `"${kw}" is already used by "${owner}"`; return; }
      }
      this.error = '';
      this.gradeLevels.push({ name, keywords: kw ? [kw] : [], isDefault: false });
      this.newGradeLevelName = '';
      this.newGradeLevelKeyword = '';
      await this.save();
    },

    deleteGradeLevel(name) {
      const g = this.gradeLevels.find(g => g.name === name);
      if (g && g.isDefault) return;
      this.gradeLevels = this.gradeLevels.filter(g => g.name !== name);
      this.save();
    },

    async save() {
      this.status = 'saving';
      try {
        const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
        await fetch(isLocal ? '/gradelevels' : '/api/gradelevels', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ gradelevels: this.gradeLevels })
        });
        this.status = 'saved';
        window.dispatchEvent(new CustomEvent('gradelevels-updated'));
        setTimeout(() => this.status = '', 2000);
      } catch {
        this.status = 'error';
      }
    }
  };
}
</script>
```

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat: add Grade Level column, modal, and gradeLevelApp() to index.html"
```

---

### Task 5: Build CSS and verify

**Files:**
- Run: `npm run build`

- [ ] **Step 1: Build output.css**

```bash
npm run build
```

Expected: exits 0, `output.css` is rewritten. No new Tailwind classes were added (grade level cell reuses existing classes), so the output should be identical in size.

- [ ] **Step 2: Start server and open app**

```bash
npm start
```

Open `http://localhost:8080` in a browser.

- [ ] **Step 3: Verify table structure**

Trigger a report fetch. Confirm:
- Table header shows: Date | User | Activity Type | Activity Name | Subject | **Grade Level** | Strategy | Logs (8 data columns + # = 9 total)
- Grade Level cells show the detected grade (e.g. "Grade 7") or "—" when unmatched
- Grade Level cell is a purple link to the course page, same visual style as Subject

- [ ] **Step 4: Verify Grade Level modal**

Open Settings → "Manage Grade Levels". Confirm:
- Modal opens showing Grade 7–12 with their keyword chips
- Adding a keyword saves and re-syncs the table
- Adding a new grade level entry works
- Removing a non-default entry works
- Default entries show "default" badge and no remove button

- [ ] **Step 5: Verify CSV export**

Download a CSV. Confirm:
- Header row: `Creation Date,User,Activity Type,Activity Name,Subject,Grade Level,Strategy,Course Name,Activity URL`
- Grade Level column is populated correctly

- [ ] **Step 6: Verify column visibility toggle**

Toggle Grade Level off via the column visibility menu. Confirm:
- Grade Level column hides and NCOLS drops to 8 (colspan on separator/empty rows adjusts)
- Toggle back on restores it

- [ ] **Step 7: Commit build artifact**

```bash
git add output.css
git commit -m "build: rebuild output.css after grade level column addition"
```
