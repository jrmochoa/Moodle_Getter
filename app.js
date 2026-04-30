const statusDiv        = document.getElementById('statusMessage');
const tbody            = document.getElementById('reportTbody');
const rowCountEl       = document.getElementById('rowCount');
const downloadBtn      = document.getElementById('downloadBtn');
const progressWrap     = document.getElementById('progressWrap');
const progressBar      = document.getElementById('progressBar');
const progressPct      = document.getElementById('progressPct');
const progressLabel    = document.getElementById('progressLabel');

let tableData    = [];
let teacherData  = [];
let oerData      = [];
let activeTab    = 'teachers'; // 'teachers' | 'oer'
let sortMode     = 'oldest';   // 'oldest' | 'newest' | 'course'
let currentCourseName = '';
let currentCourseId   = null;
let currentRows       = [];
let activeStrategies  = [];

const PROXY_BASE = 'http://localhost:8080';

function isLocal() {
    return location.protocol === 'file:' ||
           location.hostname === 'localhost' ||
           location.hostname === '127.0.0.1';
}

function apiProxyUrl(targetUrl) {
    if (!isLocal()) return targetUrl;
    return `${PROXY_BASE}/proxy?url=${encodeURIComponent(targetUrl)}&accept=application%2Fjson`;
}

function htmlProxyUrl(targetUrl, cookie) {
    if (!isLocal()) return targetUrl;
    let u = `${PROXY_BASE}/proxy?url=${encodeURIComponent(targetUrl)}&accept=text%2Fhtml`;
    if (cookie) u += `&cookie=${encodeURIComponent(cookie)}`;
    return u;
}

const MODULE_FULLNAMES = {
    assign:'Assignment', quiz:'Quiz', forum:'Forum', resource:'File',
    page:'Page', url:'URL', folder:'Folder', label:'Text and Media Area',
    choice:'Choice', feedback:'Feedback', lesson:'Lesson',
    scorm:'SCORM Package', workshop:'Workshop', glossary:'Glossary',
    chat:'Chat', attendance:'Attendance', bigbluebuttonbn:'BigBlueButton',
    book:'Book', data:'Database', h5pactivity:'H5P',
    imscp:'IMS Content Package', lti:'External Tool', survey:'Survey',
    wiki:'Wiki', hvp:'Interactive Content', questionnaire:'Questionnaire',
    certificate:'Certificate', customcert:'Custom Certificate',
    subcourse:'Subcourse', scheduler:'Scheduler', checklist:'Checklist',
};
const modFullName = m => MODULE_FULLNAMES[m] || (m ? m.charAt(0).toUpperCase()+m.slice(1) : 'Unknown');

// ── Strategies — in-memory fallback seed ─────────────────────────────────────

const STRATEGIES = [
    {name:'assessment-assisted discussion',keywords:['assessment-assisted']},
    {name:'collaborative learning',keywords:['collaborative']},
    {name:'content discussion',keywords:['content discussion']},
    {name:'drill/practice/exercise',keywords:['drill','practice','exercise']},
    {name:'election',keywords:['election']},
    {name:'enrichment',keywords:['enrichment']},
    {name:'entrance exam',keywords:['entrance exam','entrance']},
    {name:'evaluation - student',keywords:['evaluation student']},
    {name:'evaluation - student services',keywords:['evaluation student services']},
    {name:'evaluation - teacher',keywords:['evaluation teacher']},
    {name:'evaluation - parents',keywords:['evaluation parents']},
    {name:'family day',keywords:['family day']},
    {name:'focus group discussion',keywords:['focus group','fgd']},
    {name:'formative assessment',keywords:['formative']},
    {name:'game',keywords:['game']},
    {name:'interactive lecture demonstration',keywords:['interactive lecture','ild']},
    {name:'listening activity',keywords:['listening']},
    {name:'motivation',keywords:['motivation']},
    {name:'peer assessment',keywords:['peer assessment','peer']},
    {name:'performance task',keywords:['performance task','pt']},
    {name:'Playground',keywords:['playground']},
    {name:'post-assessment',keywords:['post-assessment','post assessment','posttest']},
    {name:'pre-assessment',keywords:['pre-assessment','pre assessment','pretest']},
    {name:'project presentation',keywords:['project presentation','project']},
    {name:'quiz bee',keywords:['quiz bee']},
    {name:'reading activity',keywords:['reading']},
    {name:'reference material',keywords:['reference']},
    {name:'remediation',keywords:['remediation']},
    {name:'research',keywords:['research']},
    {name:'reviewer',keywords:['reviewer']},
    {name:'self-assessment',keywords:['self-assessment','self assessment']},
    {name:'speaking activity',keywords:['speaking']},
    {name:'sports fest',keywords:['sports fest','sports']},
    {name:'stakeholders engagement',keywords:['stakeholders']},
    {name:'summative assessment',keywords:['summative']},
    {name:'synchronous discussion',keywords:['synchronous']},
    {name:'tutorial',keywords:['tutorial']},
    {name:'viewing activity',keywords:['viewing']},
    {name:'lab activity',keywords:['lab']},
    {name:'writing activity',keywords:['writing']},
    {name:'file upload and monitoring sheet',keywords:['monitoring sheet','file upload']},
    {name:'periodic test',keywords:['periodic test','periodic']},
    {name:'summary of scores',keywords:['summary of scores','summary']},
];

async function loadStrategies() {
    try {
        const res = await fetch('/strategies');
        if (!res.ok) throw new Error();
        const data = await res.json();
        activeStrategies = data.strategies;
    } catch (_) {
        activeStrategies = STRATEGIES;
    }
}

function getStrategy(activityName) {
    const name = (activityName || '').toLowerCase();
    for (const s of activeStrategies) {
        if (s.keywords?.some(kw => name.includes(kw.toLowerCase()))) return s.name;
    }
    return '';
}

function setStatus(msg, isError=false) {
    statusDiv.textContent = msg;
    statusDiv.style.cssText = isError
        ? 'margin-top:12px;padding:10px 14px;border-radius:8px;background:#fef2f2;border-left:3px solid #ef4444;font-size:13px;color:#b91c1c'
        : 'margin-top:12px;padding:10px 14px;border-radius:8px;background:#f1f5f9;border-left:3px solid #0284c7;font-size:13px;color:#475569';
}

function setProgress(current, total, label='') {
    const pct = total > 0 ? Math.round((current / total) * 100) : 0;
    progressBar.style.width = pct + '%';
    progressPct.textContent = pct + '%';
    if (label) progressLabel.textContent = label;
}

function escapeHtml(s) {
    if (!s) return '';
    return String(s).replace(/[&<>"']/g, c =>
        ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function formatDate(ts) {
    if (!ts || ts === 0) return 'N/A';
    const n = Number(ts);
    if (isNaN(n) || n <= 0) return 'N/A';
    const d = n > 1e10 ? new Date(n) : new Date(n * 1000);
    if (isNaN(d.getTime())) return 'N/A';
    const mm = String(d.getMonth()+1).padStart(2,'0');
    const dd = String(d.getDate()).padStart(2,'0');
    return `${mm}/${dd}/${d.getFullYear()}`;
}

function parseDateStrToTs(s) {
    if (!s || s === 'N/A') return 0;
    const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!m) return 0;
    const d = new Date(parseInt(m[3],10), parseInt(m[1],10)-1, parseInt(m[2],10));
    return isNaN(d.getTime()) ? 0 : Math.floor(d.getTime()/1000);
}

const FILE_CATS = {
    apk:'Application', exe:'Application', msi:'Application', dmg:'Application',
    deb:'Application', rpm:'Application', jar:'Application', bat:'Application',
    mp3:'Audio', wav:'Audio', ogg:'Audio', flac:'Audio', aac:'Audio',
    m4a:'Audio', wma:'Audio', opus:'Audio',
    pdf:'Documents', doc:'Documents', docx:'Documents', xls:'Documents',
    xlsx:'Documents', txt:'Documents', rtf:'Documents', odt:'Documents',
    ods:'Documents', csv:'Documents',
    jpg:'Image', jpeg:'Image', png:'Image', gif:'Image', bmp:'Image',
    svg:'Image', webp:'Image', tiff:'Image', tif:'Image', ico:'Image',
    ppt:'Presentation', pptx:'Presentation', odp:'Presentation', key:'Presentation',
    mp4:'Video', avi:'Video', mov:'Video', mkv:'Video', wmv:'Video',
    flv:'Video', webm:'Video', m4v:'Video', '3gp':'Video',
};

function fileExtension(mod) {
    if (!mod?.contents) return null;
    for (const c of mod.contents) {
        if (c.filename) {
            const p = c.filename.split('.');
            if (p.length > 1) { const e = p.pop().toLowerCase(); if (e.length <= 5) return e; }
        }
    }
    return null;
}

function activityTypeLabel(modname, mod) {
    if (!modname) return 'Unknown';
    if (modname === 'resource') {
        // mod.name priority: activity name containing "presentation" wins everything
        if (mod?.name && /presentation/i.test(mod.name)) return 'File - Presentation';
        // Filename priority: filename containing "presentation" wins over extension map
        if (mod?.contents) {
            for (const c of mod.contents) {
                if (c.filename && /presentation/i.test(c.filename)) return 'File - Presentation';
            }
        }
        const ext = fileExtension(mod);
        if (ext) {
            const cat = FILE_CATS[ext];
            return cat ? `File - ${cat}` : `File - ${ext.toUpperCase()}`;
        }
        return 'File';
    }
    return modFullName(modname);
}

function activityViewUrl(mod, baseUrl) {
    const id = mod.id || mod.instance;
    return (id && mod.modname) ? `${baseUrl}/mod/${mod.modname}/view.php?id=${id}` : null;
}

function buildLogUrl(baseUrl, courseId, modId, page) {
    let u = `${baseUrl}/report/log/index.php?chooselog=1&showusers=0&showcourses=0` +
            `&id=${courseId}&group=&user=&date=&modid=${modId}&modaction=c` +
            `&origin=&edulevel=-1&logreader=logstore_standard`;
    if (page > 0) u += `&page=${page}`;
    return u;
}

// ── WS API ───────────────────────────────────────────────────────────────────

async function apiFetch(baseUrl, token, fn, extra={}) {
    const p = new URLSearchParams({wstoken:token, wsfunction:fn, moodlewsrestformat:'json', ...extra});
    const rawUrl = `${baseUrl}/webservice/rest/server.php?${p}`;
    const res = await fetch(apiProxyUrl(rawUrl), {headers:{Accept:'application/json'}});
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    const data = await res.json();
    if (data?.exception) throw new Error(data.message || data.exception);
    if (data?.error)     throw new Error(data.error);
    return data;
}

async function fetchCourseName(baseUrl, token, courseId) {
    try {
        const p = new URLSearchParams({wstoken:token, wsfunction:'core_course_get_courses', moodlewsrestformat:'json'});
        p.append('options[ids][0]', String(courseId));
        const rawUrl = `${baseUrl}/webservice/rest/server.php?${p}`;
        const res = await fetch(apiProxyUrl(rawUrl), {headers:{Accept:'application/json'}});
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) return data[0].fullname || data[0].shortname || null;
    } catch(_) {}
    return null;
}

async function fetchFirstAccessor(baseUrl, token, courseId) {
    try {
        const data = await apiFetch(baseUrl, token, 'core_enrol_get_enrolled_users', {courseid:String(courseId)});
        if (Array.isArray(data) && data.length > 0) {
            const pool = data.filter(u => u.firstaccess > 0);
            const src = pool.length > 0 ? pool : data;
            src.sort((a,b) => (a.firstaccess||0)-(b.firstaccess||0));
            const u = src[0];
            if (u?.fullname) return {fullname:u.fullname, profileUrl:`${baseUrl}/user/profile.php?id=${u.id}`};
        }
    } catch(_) {}
    return null;
}

// ── Log page helpers ─────────────────────────────────────────────────────────

function parseMoodleDate(raw) {
    if (!raw) return null;
    const d = new Date(raw);
    if (!isNaN(d.getTime())) {
        const mm = String(d.getMonth()+1).padStart(2,'0');
        const dd = String(d.getDate()).padStart(2,'0');
        return `${mm}/${dd}/${d.getFullYear()}`;
    }
    const m1 = raw.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
    if (m1) {
        const d2 = new Date(`${m1[2]} ${m1[1]}, ${m1[3]}`);
        if (!isNaN(d2.getTime())) {
            const mm = String(d2.getMonth()+1).padStart(2,'0');
            const dd = String(d2.getDate()).padStart(2,'0');
            return `${mm}/${dd}/${d2.getFullYear()}`;
        }
    }
    return null;
}

async function fetchLogDoc(url, sessionCookie) {
    try {
        let res;
        if (isLocal()) {
            res = await fetch(htmlProxyUrl(url, sessionCookie), {
                headers: { 'Accept': 'text/html,application/xhtml+xml' }
            });
        } else {
            const headers = { 'Accept': 'text/html,application/xhtml+xml' };
            if (sessionCookie) headers['Cookie'] = `MoodleSession=${sessionCookie}`;
            res = await fetch(url, { credentials: 'include', headers });
        }
        if (!res.ok) return null;
        return new DOMParser().parseFromString(await res.text(), 'text/html');
    } catch(e) {
        if (e.message?.includes('Failed to fetch') || e.name === 'TypeError') {
            document.getElementById('corsNotice').style.display = 'block';
        }
        return null;
    }
}

function parseLastPageNum(doc) {
    let max = 0;
    for (const a of doc.querySelectorAll('a[href*="page="]')) {
        const href = a.getAttribute('href') || '';
        const m = href.match(/[?&]page=(\d+)/);
        if (m) { const n = parseInt(m[1], 10); if (n > max) max = n; }
    }
    return max;
}

function parseCreatedEvent(doc) {
    const candidates = [
        ...doc.querySelectorAll('table.generaltable tbody tr'),
        ...doc.querySelectorAll('table[data-region="report-table"] tbody tr'),
        ...doc.querySelectorAll('#report_log table tbody tr'),
        ...doc.querySelectorAll('tr'),
    ];
    const seen = new WeakSet();
    for (const row of candidates) {
        if (seen.has(row)) continue;
        seen.add(row);
        const cells = row.querySelectorAll('td');
        if (cells.length < 2) continue;
        let found = false;
        for (const cell of cells) {
            if (cell.textContent.trim().toLowerCase().includes('course module created')) { found = true; break; }
        }
        if (!found) continue;
        const rawDate = cells[0]?.textContent?.trim() || '';
        let fullname = '', profileUrl = '';
        for (let i = 0; i < Math.min(cells.length, 4); i++) {
            const link = cells[i].querySelector('a[href*="/user/"]');
            if (link) { fullname = link.textContent.trim(); profileUrl = link.href; break; }
        }
        const parsedDate = parseMoodleDate(rawDate);
        if (parsedDate || fullname) return { date: parsedDate || rawDate, fullname, profileUrl };
    }
    return null;
}

async function scrapeLogPage(baseUrl, courseId, cmid, sessionCookie) {
    const page0Url = buildLogUrl(baseUrl, courseId, cmid, 0);
    const doc0 = await fetchLogDoc(page0Url, sessionCookie);
    if (!doc0) return null;

    const fromPage0 = parseCreatedEvent(doc0);
    if (fromPage0) return fromPage0;

    const lastPage = parseLastPageNum(doc0);
    if (lastPage <= 0) return null;

    const docLast = await fetchLogDoc(buildLogUrl(baseUrl, courseId, cmid, lastPage), sessionCookie);
    if (!docLast) return null;

    return parseCreatedEvent(docLast);
}

// ── Build rows ───────────────────────────────────────────────────────────────

async function buildRows(sections, token, baseUrl, courseId, sessionCookie, fallbackUser) {
    const allMods = sections.flatMap(s => s.modules || []);
    const total   = allMods.length;
    let done = 0;
    progressWrap.style.display = 'block';
    setProgress(0, total, `Fetching ${total} log pages…`);

    const BATCH = 6;
    const results = new Array(allMods.length);

    for (let start = 0; start < allMods.length; start += BATCH) {
        const slice = allMods.slice(start, start + BATCH);
        const settled = await Promise.allSettled(
            slice.map(mod => scrapeLogPage(baseUrl, courseId, mod.id, sessionCookie))
        );
        settled.forEach((r, i) => { results[start + i] = r.value ?? null; });
        done += slice.length;
        setProgress(done, total, `Fetched ${done} / ${total}…`);
    }

    const rows = allMods.map((mod, i) => {
        const logData = results[i];
        return {
            date:         logData?.date      || formatDate(mod.added || mod.timecreated || mod.timemodified || 0),
            rawTs:        parseDateStrToTs(logData?.date) || mod.added || mod.timecreated || 0,
            fromLog:      !!logData,
            fullname:     logData?.fullname   || fallbackUser?.fullname   || 'Unknown',
            profileUrl:   logData?.profileUrl || fallbackUser?.profileUrl || null,
            activityName: mod.name            || `Unnamed ${mod.modname}`,
            activityUrl:  activityViewUrl(mod, baseUrl),
            activityType: activityTypeLabel(mod.modname, mod),
            strategy:     getStrategy(mod.name || ''),
            modname:      mod.modname         || '',
            courseIndex:  i,
            logUrl:       buildLogUrl(baseUrl, courseId, mod.id),
        };
    });

    setProgress(total, total, 'Done!');
    setTimeout(() => progressWrap.style.display = 'none', 1500);
    return rows;
}

// ── Sort & filter ─────────────────────────────────────────────────────────────

function applySort(rows) {
    const sorted = [...rows];
    if (sortMode === 'newest') {
        sorted.sort((a, b) => b.rawTs !== a.rawTs ? b.rawTs - a.rawTs : parseDateStrToTs(b.date) - parseDateStrToTs(a.date));
    } else if (sortMode === 'course') {
        sorted.sort((a, b) => a.courseIndex - b.courseIndex);
    } else {
        sorted.sort((a, b) => a.rawTs !== b.rawTs ? a.rawTs - b.rawTs : parseDateStrToTs(a.date) - parseDateStrToTs(b.date));
    }
    return sorted;
}

function getActiveRows() {
    return activeTab === 'oer' ? oerData : teacherData;
}

// ── Render ───────────────────────────────────────────────────────────────────

function renderTable(rows) {
    currentRows = rows || [];

    // Inject Strategy column header once (lives in index.html thead)
    const headerRow = document.querySelector('thead tr');
    if (headerRow && !document.getElementById('thStrategy')) {
        const thType = [...headerRow.querySelectorAll('th')].find(th => th.textContent.trim() === 'Activity Type');
        if (thType) {
            const th = document.createElement('th');
            th.id = 'thStrategy';
            th.style.cssText = 'padding:10px 16px;text-align:left;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.07em;color:rgba(167,139,250,.55);white-space:nowrap';
            th.textContent = 'Strategy';
            thType.after(th);
        }
    }

    tbody.innerHTML = '';
    if (!rows?.length) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:64px 20px;color:#94a3b8;font-size:13px;font-style:italic">No activities found.</td></tr>';
        rowCountEl.textContent = '0 entries';
        return;
    }

    const frag = document.createDocumentFragment();
    rows.forEach((row, idx) => {
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid #f1f5f9';
        tr.onmouseenter = () => tr.style.background = '#f0f9ff';
        tr.onmouseleave = () => tr.style.background = '';

        const tdNum = document.createElement('td');
        tdNum.style.cssText = 'padding:10px 16px;color:#94a3b8;font-size:11px;font-family:monospace';
        tdNum.textContent = idx + 1;

        const tdDate = document.createElement('td');
        tdDate.style.cssText = 'padding:10px 16px;white-space:nowrap';
        const badge = row.fromLog
            ? `<span style="margin-left:6px;font-size:10px;font-weight:700;background:#d1fae5;color:#059669;border:1px solid #a7f3d0;padding:1px 6px;border-radius:99px">LOG</span>`
            : `<span style="margin-left:6px;font-size:10px;font-weight:700;background:#fef3c7;color:#d97706;border:1px solid #fde68a;padding:1px 6px;border-radius:99px" title="Could not read log page — using mod.added">EST</span>`;
        tdDate.innerHTML = `<span style="font-family:monospace;font-size:12px;background:#f1f5f9;color:#334155;padding:3px 10px;border-radius:6px;font-weight:600">${escapeHtml(row.date)}</span>${badge}`;

        const tdUser = document.createElement('td');
        tdUser.style.cssText = 'padding:10px 16px';
        tdUser.innerHTML = row.profileUrl
            ? `<a href="${escapeHtml(row.profileUrl)}" target="_blank" rel="noopener" style="color:#0369a1;font-weight:600;text-decoration:none" onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'">${escapeHtml(row.fullname)}</a>`
            : `<span style="color:#475569">${escapeHtml(row.fullname)}</span>`;

        const tdName = document.createElement('td');
        tdName.style.cssText = 'padding:10px 16px';
        tdName.innerHTML = row.activityUrl
            ? `<a href="${escapeHtml(row.activityUrl)}" target="_blank" rel="noopener" style="color:#7c3aed;font-weight:600;text-decoration:none" onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'">${escapeHtml(row.activityName)}</a>`
            : `<span style="color:#334155;font-weight:500">${escapeHtml(row.activityName)}</span>`;

        const tdType = document.createElement('td');
        tdType.style.cssText = 'padding:10px 16px';
        tdType.innerHTML = `<span style="font-size:11px;font-weight:600;background:#f0f9ff;color:#0369a1;border:1px solid #bae6fd;padding:2px 10px;border-radius:99px">${escapeHtml(row.activityType)}</span>`;

        const tdStrategy = document.createElement('td');
        tdStrategy.style.cssText = 'padding:6px 16px';
        const sel = document.createElement('select');
        sel.className = 'strategy-sel';
        const blankOpt = document.createElement('option');
        blankOpt.value = '';
        blankOpt.textContent = '—';
        sel.appendChild(blankOpt);
        for (const s of activeStrategies) {
            const opt = document.createElement('option');
            opt.value = s.name;
            opt.textContent = s.name;
            if (s.name === row.strategy) opt.selected = true;
            sel.appendChild(opt);
        }
        sel.addEventListener('change', () => {
            const target = tableData.find(r => r.courseIndex === row.courseIndex);
            if (target) target.strategy = sel.value;
        });
        tdStrategy.appendChild(sel);

        const tdLog = document.createElement('td');
        tdLog.style.cssText = 'padding:10px 16px;text-align:center';
        tdLog.innerHTML = `<a href="${escapeHtml(row.logUrl)}" target="_blank" rel="noopener" class="log-btn">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round"
                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
            </svg>
            View Logs
        </a>`;

        tr.append(tdNum, tdDate, tdUser, tdName, tdType, tdStrategy, tdLog);
        frag.appendChild(tr);
    });
    tbody.appendChild(frag);

    const n = rows.length;
    rowCountEl.textContent = `${n} ${n===1?'entry':'entries'}`;
}

function updateTabUI() {
    const tTeachers = document.getElementById('tabTeachers');
    const tOer      = document.getElementById('tabOer');
    const cTeachers = document.getElementById('countTeachers');
    const cOer      = document.getElementById('countOer');

    if (activeTab === 'teachers') {
        tTeachers.style.color = '#0284c7';
        tTeachers.style.borderBottom = '2px solid #0284c7';
        cTeachers.style.background = '#e0f2fe';
        cTeachers.style.color = '#0369a1';

        tOer.style.color = '#94a3b8';
        tOer.style.borderBottom = '2px solid transparent';
        cOer.style.background = '#f1f5f9';
        cOer.style.color = '#94a3b8';
    } else {
        tOer.style.color = '#0284c7';
        tOer.style.borderBottom = '2px solid #0284c7';
        cOer.style.background = '#e0f2fe';
        cOer.style.color = '#0369a1';

        tTeachers.style.color = '#94a3b8';
        tTeachers.style.borderBottom = '2px solid transparent';
        cTeachers.style.background = '#f1f5f9';
        cTeachers.style.color = '#94a3b8';
    }

    const activeData = activeTab === 'teachers' ? teacherData : oerData;
    setDownloadDisabled(downloadBtn, activeData.length === 0);
}

function updateSortUI() {
    const ids = { oldest:'sortOldest', newest:'sortNewest', course:'sortCourse' };
    for (const [key, id] of Object.entries(ids)) {
        const btn = document.getElementById(id);
        btn.className = 'px-4 py-1.5 text-xs font-semibold transition-colors';
        if (key === sortMode) {
            btn.style.backgroundColor = '#0369a1';
            btn.style.color = '#ffffff';
        } else {
            btn.style.backgroundColor = 'transparent';
            btn.style.color = '#475569';
        }
    }
}

function renderActiveTab() {
    const rows = applySort(getActiveRows());
    renderTable(rows);
    updateTabUI();
    updateSortUI();
}

function setDownloadDisabled(btn, off) {
    btn.disabled = off;
    btn.style.opacity       = off ? '0.35' : '';
    btn.style.cursor        = off ? 'not-allowed' : '';
    btn.style.pointerEvents = off ? 'none' : '';
}

function updateTabCounts() {
    document.getElementById('countTeachers').textContent = teacherData.length;
    document.getElementById('countOer').textContent      = oerData.length;
    const activeData = activeTab === 'teachers' ? teacherData : oerData;
    setDownloadDisabled(downloadBtn, activeData.length === 0);
}

// ── CSV ──────────────────────────────────────────────────────────────────────

function coursePrefix(name) {
    const m = (name || '').match(/^(\d+)\s*-\s*/);
    return m ? `${m[1]}: ` : '';
}

function exportCSV(rows, filename, label = '') {
    if (!rows.length) { setStatus('Nothing to export.', true); return; }
    const prefix = coursePrefix(currentCourseName);
    const hdr  = ['Date', 'Created By', 'Activity Name', 'Activity Type', 'Strategy'];
    const body = rows.map(r => [
        r.date,
        r.fullname,
        prefix + r.activityName,
        r.activityType,
        r.strategy || '',
    ]);
    const csv = [hdr, ...body].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], {type: 'text/csv;charset=utf-8;'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setStatus(`Exported ${rows.length} ${label} entries.`);
}

// ── Event listeners ───────────────────────────────────────────────────────────

document.getElementById('tabTeachers').addEventListener('click', () => {
    activeTab = 'teachers';
    renderActiveTab();
});

document.getElementById('tabOer').addEventListener('click', () => {
    activeTab = 'oer';
    renderActiveTab();
});

document.getElementById('sortOldest').addEventListener('click', () => {
    sortMode = 'oldest';
    renderActiveTab();
});

document.getElementById('sortNewest').addEventListener('click', () => {
    sortMode = 'newest';
    renderActiveTab();
});

document.getElementById('sortCourse').addEventListener('click', () => {
    sortMode = 'course';
    renderActiveTab();
});

downloadBtn.addEventListener('click', () => {
    if (activeTab === 'teachers') {
        exportCSV(applySort(teacherData), `moodle_course_${currentCourseId}_teachers_creation.csv`, 'Teachers Creation');
    } else {
        exportCSV(applySort(oerData), `moodle_course_${currentCourseId}_oer.csv`, 'OER');
    }
});

// ── Main ─────────────────────────────────────────────────────────────────────

window.addEventListener('strategies-updated', async () => {
    await loadStrategies();
    if (tableData.length > 0) {
        tableData.forEach(r => { r.strategy = getStrategy(r.activityName); });
        renderTable(currentRows);
    }
});

document.addEventListener('DOMContentLoaded', async () => {
    await loadStrategies();
});

document.getElementById('fetchBtn').addEventListener('click', async () => {
    const courseUrlRaw  = document.getElementById('courseUrl').value.trim();
    const token         = document.getElementById('wsToken').value.trim();
    const sessionCookie = document.getElementById('sessionKey').value.trim();

    if (!courseUrlRaw) { setStatus('Please enter the Moodle course URL.', true); return; }
    if (!token)        { setStatus('Web service token is required.', true); return; }

    await loadStrategies();

    let baseUrl, courseId;
    try {
        const parsed      = new URL(courseUrlRaw);
        const courseIdx   = parsed.pathname.indexOf('/course/');
        const basePath    = courseIdx > 0 ? parsed.pathname.slice(0, courseIdx) : '';
        baseUrl  = parsed.origin + basePath;
        courseId = parseInt(parsed.searchParams.get('id'), 10);
    } catch (_) {
        setStatus('Invalid URL — paste the full course URL, e.g. https://yourmoodle.edu/course/view.php?id=2', true);
        return;
    }
    if (isNaN(courseId) || courseId <= 0) {
        setStatus('Course ID not found in URL — make sure it contains ?id=…', true);
        return;
    }

    currentCourseId = courseId;

    document.getElementById('corsNotice').style.display = 'none';
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:64px 20px;color:#94a3b8;font-size:13px;font-style:italic">Loading…</td></tr>';
    rowCountEl.textContent = 'loading…';
    setDownloadDisabled(downloadBtn, true);
    document.getElementById('courseNameSection').style.display = 'none';
    tableData   = [];
    teacherData = [];
    oerData     = [];
    setStatus('Fetching course contents…');

    try {
        const [courseName, sections, fallbackUser] = await Promise.all([
            fetchCourseName(baseUrl, token, courseId),
            apiFetch(baseUrl, token, 'core_course_get_contents', {courseid: String(courseId)}),
            fetchFirstAccessor(baseUrl, token, courseId),
        ]);

        currentCourseName = courseName || '';
        const nameEl = document.getElementById('courseNameDisplay');
        nameEl.textContent = courseName || `Course ID: ${courseId}`;
        nameEl.href = `${baseUrl}/course/view.php?id=${courseId}`;
        document.getElementById('courseNameSection').style.display = 'block';

        const total = sections.reduce((n, s) => n + (s.modules?.length || 0), 0);
        setStatus(`Found ${total} module(s). Reading log pages…`);

        tableData   = await buildRows(sections, token, baseUrl, courseId, sessionCookie, fallbackUser);
        teacherData = tableData.filter(r => r.modname !== 'url');
        oerData     = tableData.filter(r => r.modname === 'url');

        const logCount = tableData.filter(r => r.fromLog).length;
        setStatus(`Done. ${tableData.length} module(s) — ${logCount} with real log date & creator, ${tableData.length - logCount} estimated.`);

        updateTabCounts();
        activeTab = 'teachers';
        renderActiveTab();

    } catch (err) {
        console.error(err);
        let msg = err.message;
        if (msg.includes('Invalid token') || msg.includes('Access control')) msg = 'Invalid token or insufficient permissions.';
        else if (msg.includes('Course not found')) msg = `Course ID ${courseId} not found.`;
        setStatus(msg, true);
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:64px 20px;color:#ef4444;font-size:13px;font-style:italic">${escapeHtml(msg)}</td></tr>`;
    }
});
