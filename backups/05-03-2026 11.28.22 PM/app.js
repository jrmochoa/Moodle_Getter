// ── DOM cache ─────────────────────────────────────────────────────────────────
const statusDiv   = document.getElementById('statusMessage');
const tbody       = document.getElementById('reportTbody');
const rowCountEl  = document.getElementById('rowCount');
const downloadBtn = document.getElementById('downloadBtn');
const fetchBtn          = document.getElementById('fetchBtn');
const fetchBtnText      = document.getElementById('fetchBtnText');
const fetchProgressFill = document.getElementById('fetchProgress');
const heatmapBtn          = document.getElementById('heatmapBtn');
const heatmapModal        = document.getElementById('heatmapModal');
const heatmapCloseBtn     = document.getElementById('heatmapCloseBtn');
const heatmapCourseSelect = document.getElementById('heatmapCourseSelect');
const heatmapContent      = document.getElementById('heatmapContent');
const heatmapPrevBtn      = document.getElementById('heatmapPrevBtn');
const heatmapNextBtn      = document.getElementById('heatmapNextBtn');
const hmTooltip           = document.getElementById('hmTooltip');

// ── State ─────────────────────────────────────────────────────────────────────
let tableData            = [];
let allData              = [];
let teacherData          = [];
let oerData              = [];
let snapshotAllData      = [];
let snapshotTeacherData  = [];
let snapshotOerData      = [];
let snapshotHiddenTypes  = new Set();
let snapshotHiddenYears  = new Set();
let snapshotHiddenMonths = new Set();
let activeTab        = 'all'; // 'all' | 'teachers' | 'oer'
let sortCol          = null;       // null | 'rawTs' | 'fullname' | 'activityName' | 'activityType' | 'subject' | 'strategy'
let sortDir          = 'asc';      // 'asc' | 'desc'
let currentRows      = [];
let activeStrategies = [];
let activeSubjects   = [];
let hiddenTypes      = new Set();
let hiddenYears      = new Set();
let hiddenMonths     = new Set();
let filterDropdown     = null;
let dateFilterDropdown = null;
let heatmapCourses       = [];
let heatmapCourseIdx     = 0;
let hmTooltipHideTimer   = null;
let courseRegistry       = []; // [{courseGroupIndex, courseId, courseName, courseBaseUrl}] — one entry per fetched course

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
const MONTH_NAMES  = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MONTH_SHORT  = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

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

// ── Subjects — in-memory fallback seed ───────────────────────────────────────

const DEFAULT_SUBJECTS = [
    { name:'Christian Living and Values Education', keywords:['Christian Living','Values Education','CLE'], isDefault:true },
    { name:'Computer',      keywords:['Computer','ICT','Programming'],               isDefault:true },
    { name:'English',       keywords:['English','Reading'],                          isDefault:true },
    { name:'Filipino',      keywords:['Filipino','Tagalog'],                         isDefault:true },
    { name:'MAPEH',         keywords:['MAPEH','Music','Arts','PE','Health'],          isDefault:true },
    { name:'Mathematics',   keywords:['Math','Mathematics','Algebra','Geometry'],    isDefault:true },
    { name:'Science',       keywords:['Science','Physics','Chemistry','Biology'],    isDefault:true },
    { name:'Social Studies',keywords:['Social Studies','History','Geography'],       isDefault:true },
    { name:'TLE',           keywords:['TLE','Technology','Livelihood'],              isDefault:true },
];

async function loadSubjects() {
    try {
        const res = await fetch('/subjects');
        if (!res.ok) throw new Error();
        const data = await res.json();
        activeSubjects = data.subjects;
    } catch (_) {
        activeSubjects = DEFAULT_SUBJECTS;
    }
}

function getSubject(courseName) {
    const name = (courseName || '').toLowerCase();
    for (const s of activeSubjects) {
        if (s.keywords?.some(kw => name.includes(kw.toLowerCase()))) return s.name;
    }
    return 'Uncategorized';
}

// ── UI helpers ────────────────────────────────────────────────────────────────

function isDarkMode() {
    return !document.body.classList.contains('light-mode');
}

function setStatus(msg, isError=false) {
    statusDiv.textContent = msg;
    statusDiv.className = `status-msg${isError ? ' status-msg--error' : ''}`;
}

function setBtnLoading(text = 'Fetching…', frac = 0) {
    fetchBtn.disabled = true;
    fetchBtn.className = 'tech-btn btn-full btn-loading';
    fetchBtnText.textContent = text;
    fetchProgressFill.style.width = Math.min(Math.round(frac * 100), 100) + '%';
}

function setBtnDefault() {
    fetchProgressFill.style.transition = 'none';
    fetchProgressFill.style.width = '0%';
    requestAnimationFrame(() => { fetchProgressFill.style.transition = ''; });
    fetchBtn.disabled = false;
    fetchBtn.className = 'tech-btn btn-full';
    fetchBtnText.textContent = 'Generate';
}

function setBtnSuccess(text = '✓ Done') {
    fetchProgressFill.style.width = '100%';
    fetchBtn.disabled = false;
    fetchBtn.className = 'tech-btn btn-full btn-success';
    fetchBtnText.textContent = text;
    setTimeout(setBtnDefault, 2000);
}

function setBtnError(text = '✗ Failed') {
    fetchProgressFill.style.width = '100%';
    fetchBtn.disabled = false;
    fetchBtn.className = 'tech-btn btn-full btn-error';
    fetchBtnText.textContent = text;
    setTimeout(setBtnDefault, 2500);
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
        if (mod?.name && /presentation/i.test(mod.name)) return 'File - Presentation';
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

// ── WS API ────────────────────────────────────────────────────────────────────

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

// ── Log helpers — JSON download ───────────────────────────────────────────────

function parseMoodleJsonDate(timeStr) {
    if (!timeStr) return null;
    const s = timeStr.replace(/\\/g, '');
    // Moodle format: DD/MM/YY, HH:MM:SS  →  MM/DD/YYYY
    const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
    if (!m) return null;
    const day = m[1].padStart(2, '0');
    const mon = m[2].padStart(2, '0');
    const yr  = m[3].length === 2 ? `20${m[3]}` : m[3];
    if (isNaN(new Date(`${yr}-${mon}-${day}`).getTime())) return null;
    return `${mon}/${day}/${yr}`;
}

function parseMoodleJsonTs(timeStr) {
    if (!timeStr) return 0;
    const s = timeStr.replace(/\\/g, '');
    const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4}),?\s*(\d{2}):(\d{2}):(\d{2})/);
    if (!m) return 0;
    const yr = m[3].length === 2 ? `20${m[3]}` : m[3];
    const d  = new Date(`${yr}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}T${m[4]}:${m[5]}:${m[6]}`);
    return isNaN(d.getTime()) ? 0 : Math.floor(d.getTime() / 1000);
}

async function fetchSesskey(baseUrl, courseId, sessionCookie) {
    try {
        const pageUrl  = `${baseUrl}/course/view.php?id=${courseId}`;
        const proxyUrl = isLocal()
            ? `${PROXY_BASE}/proxy?url=${encodeURIComponent(pageUrl)}&accept=text%2Fhtml&cookie=${encodeURIComponent(sessionCookie)}`
            : pageUrl;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 15000);
        try {
            const res = await fetch(proxyUrl, { signal: controller.signal });
            if (!res.ok) return null;
            const m = (await res.text()).match(/"sesskey":"([a-zA-Z0-9]+)"/);
            return m ? m[1] : null;
        } finally { clearTimeout(timer); }
    } catch (_) { return null; }
}

async function fetchModuleLogsJson(baseUrl, courseId, cmid, sesskey, sessionCookie, modaction = 'c') {
    const actionParam = modaction ? `&modaction=${encodeURIComponent(modaction)}` : '';
    const targetUrl =
        `${baseUrl}/report/log/index.php?chooselog=1&showusers=0&showcourses=0` +
        `&id=${courseId}&group=&user=&date=&modid=${cmid}${actionParam}&origin=` +
        `&edulevel=-1&logreader=logstore_standard&download=json&sesskey=${sesskey}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    try {
        const proxyUrl = isLocal()
            ? `${PROXY_BASE}/proxy?url=${encodeURIComponent(targetUrl)}&accept=application%2Fjson&cookie=${encodeURIComponent(sessionCookie)}`
            : targetUrl;
        const res = await fetch(proxyUrl, { signal: controller.signal });
        if (!res.ok) return null;
        const parsed = JSON.parse(await res.text());
        return Array.isArray(parsed[0]) ? parsed[0] : (Array.isArray(parsed) ? parsed : []);
    } catch (_) { return null; }
    finally { clearTimeout(timer); }
}

async function scrapeLogPage(baseUrl, courseId, cmid, sesskey, sessionCookie) {
    // Step 1: creation-only fetch (modaction=c) — fast, targeted
    const creationEntries = await fetchModuleLogsJson(baseUrl, courseId, cmid, sesskey, sessionCookie, 'c');
    if (creationEntries?.length) {
        const created = creationEntries.find(e => e.eventname === 'Course module created');
        if (created) {
            const date = parseMoodleJsonDate(created.time || '');
            const fullname = created.userfullname || '';
            let profileUrl = '';
            const uid = (created.description || '').match(/user with id '(\d+)'/);
            if (uid) profileUrl = `${baseUrl}/user/profile.php?id=${uid[1]}`;
            return { date: date || '', fullname, profileUrl, dateSource: 'VERIFIED', eventLabel: 'Course module created' };
        }
    }

    // Step 2: broad all-events fetch — only reached when Step 1 returns nothing
    const allEntries = await fetchModuleLogsJson(baseUrl, courseId, cmid, sesskey, sessionCookie, '');
    if (allEntries?.length) {
        const withTs = allEntries
            .map(e => ({ ...e, _ts: parseMoodleJsonTs(e.time) }))
            .filter(e => e._ts > 0)
            .sort((a, b) => a._ts - b._ts);
        if (withTs.length > 0) {
            const oldest = withTs[0];
            const date = parseMoodleJsonDate(oldest.time || '');
            const fullname = oldest.userfullname || '';
            let profileUrl = '';
            const uid = (oldest.description || '').match(/user with id '(\d+)'/);
            if (uid) profileUrl = `${baseUrl}/user/profile.php?id=${uid[1]}`;
            return { date: date || '', fullname, profileUrl, dateSource: 'INFERRED', eventLabel: `First access: ${oldest.eventname || 'user access'}` };
        }
    }

    return null;
}

// ── Build rows ────────────────────────────────────────────────────────────────

async function buildRows(sections, baseUrl, courseId, sessionCookie, fallbackUser, courseName, detectedSubject, courseGroupIndex, onProgress) {
    const allMods = sections.flatMap(s => s.modules || []);
    const total   = allMods.length;
    let done = 0;

    onProgress?.(0, `Fetching sesskey…`);
    const sesskey = await fetchSesskey(baseUrl, courseId, sessionCookie);
    if (!sesskey) setStatus('Warning: could not fetch sesskey — log dates may be unavailable.');

    onProgress?.(0, `Fetching ${total} log pages…`);

    const BATCH = 6;
    const results = new Array(allMods.length);

    for (let start = 0; start < allMods.length; start += BATCH) {
        const slice = allMods.slice(start, start + BATCH);
        const settled = await Promise.allSettled(
            slice.map(mod => scrapeLogPage(baseUrl, courseId, mod.id, sesskey, sessionCookie))
        );
        settled.forEach((r, i) => { results[start + i] = r.value ?? null; });
        done += slice.length;
        onProgress?.(total > 0 ? done / total : 1, `${done}/${total} modules`);
    }

    const rows = allMods.map((mod, i) => {
        const logData    = results[i];
        const dateSource = logData?.dateSource || 'ESTIMATED';
        const eventLabel = logData?.eventLabel || 'Module metadata (mod.added)';
        return {
            date:             logData?.date      || formatDate(mod.added || mod.timecreated || mod.timemodified || 0),
            rawTs:            parseDateStrToTs(logData?.date) || mod.added || mod.timecreated || 0,
            dateSource,
            eventLabel,
            fromLog:          dateSource === 'VERIFIED',
            fullname:         logData?.fullname   || fallbackUser?.fullname   || 'Unknown',
            profileUrl:       logData?.profileUrl || fallbackUser?.profileUrl || null,
            activityName:     mod.name            || `Unnamed ${mod.modname}`,
            activityUrl:      activityViewUrl(mod, baseUrl),
            activityType:     activityTypeLabel(mod.modname, mod),
            strategy:         getStrategy(mod.name || ''),
            subject:          detectedSubject,
            modname:          mod.modname         || '',
            courseIndex:      i,
            courseGroupIndex: courseGroupIndex,
            courseId:         courseId,
            courseName:       courseName || `Course ${courseId}`,
            courseBaseUrl:    baseUrl,
            logUrl:           buildLogUrl(baseUrl, courseId, mod.id),
        };
    });

    return rows;
}

// ── Row exclusion ─────────────────────────────────────────────────────────────

function isExcludedRow(r) {
    const isAnnouncementForum =
        /announcement/i.test(r.activityName || '') &&
        (r.activityType || '').toLowerCase() === 'forum';
    return isAnnouncementForum && (r.dateSource === 'ESTIMATED' || !r.date || r.dateSource === 'INFERRED');
}

// ── Deduplication ────────────────────────────────────────────────────────────

function deduplicateActivityNames(rows) {
    const seen = new Map();
    for (const r of rows) {
        const key = `${r.courseGroupIndex}::${r.activityName}`;
        const n = (seen.get(key) || 0) + 1;
        seen.set(key, n);
        if (n > 1) r.activityName = `${r.activityName} (${n})`;
    }
}

// ── Sort ──────────────────────────────────────────────────────────────────────

function applyHeaderSort(rows) {
    if (!sortCol) return [...rows];
    const sorted = [...rows];
    sorted.sort((a, b) => {
        if (sortCol === 'rawTs') {
            return sortDir === 'asc' ? a.rawTs - b.rawTs : b.rawTs - a.rawTs;
        }
        const va = String(a[sortCol] || '').toLowerCase();
        const vb = String(b[sortCol] || '').toLowerCase();
        const cmp = va.localeCompare(vb);
        return sortDir === 'asc' ? cmp : -cmp;
    });
    return sorted;
}

function getActiveRows() {
    if (activeTab === 'oer')      return oerData;
    if (activeTab === 'teachers') return teacherData;
    return allData;
}

// ── Render ────────────────────────────────────────────────────────────────────

function buildDataRow(row, idx) {
    const dark = isDarkMode();
    const tr = document.createElement('tr');
    tr.style.borderBottom = dark ? '1px solid rgba(139,92,246,.07)' : '1px solid #f1f5f9';
    tr.onmouseenter = () => tr.style.background = dark ? 'rgba(139,92,246,.06)' : '#f0f9ff';
    tr.onmouseleave = () => tr.style.background = '';

    const tdNum = document.createElement('td');
    tdNum.className = 'td-num';
    tdNum.style.color = dark ? 'rgba(148,163,184,.5)' : '#94a3b8';
    tdNum.textContent = idx;

    const tdDate = document.createElement('td');
    tdDate.className = 'td-date';
    const BADGE_TEXT = { VERIFIED:'LOG', INFERRED:'FIRST', ESTIMATED:'EST' };
    const badgeType  = (row.dateSource || 'ESTIMATED').toLowerCase();
    const badge = `<span class="date-badge date-badge-${badgeType}" title="Source: ${escapeHtml(row.eventLabel || '')}">${BADGE_TEXT[row.dateSource] || 'EST'}</span>`;
    tdDate.innerHTML = `<span class="date-chip">${escapeHtml(row.date)}</span>${badge}`;

    const tdUser = document.createElement('td');
    tdUser.className = 'td-cell';
    tdUser.innerHTML = row.profileUrl
        ? `<a href="${escapeHtml(row.profileUrl)}" target="_blank" rel="noopener" class="table-link" style="color:${dark ? '#a78bfa' : '#0369a1'}">${escapeHtml(row.fullname)}</a>`
        : `<span style="color:${dark ? 'rgba(196,181,253,.75)' : '#475569'}">${escapeHtml(row.fullname)}</span>`;

    const tdName = document.createElement('td');
    tdName.className = 'td-cell';
    tdName.innerHTML = row.activityUrl
        ? `<a href="${escapeHtml(row.activityUrl)}" target="_blank" rel="noopener" class="table-link" style="color:${dark ? '#c4b5fd' : '#7c3aed'}">${escapeHtml(row.activityName)}</a>`
        : `<span class="table-text-muted" style="color:${dark ? '#e2e8f0' : '#334155'}">${escapeHtml(row.activityName)}</span>`;

    const tdType = document.createElement('td');
    tdType.className = 'td-cell';
    tdType.innerHTML = `<span class="activity-type-chip">${escapeHtml(row.activityType)}</span>`;

    const tdSubject = document.createElement('td');
    tdSubject.className = 'td-cell';
    const subjectLink = document.createElement('a');
    subjectLink.href    = `${row.courseBaseUrl}/course/view.php?id=${row.courseId}`;
    subjectLink.target  = '_blank';
    subjectLink.rel     = 'noopener';
    subjectLink.title   = row.courseName || '';
    subjectLink.textContent = row.subject || 'Uncategorized';
    subjectLink.className = 'subject-link';
    subjectLink.style.color = dark ? '#a78bfa' : '#7c3aed';
    subjectLink.onmouseover = () => subjectLink.style.textDecoration = 'underline';
    subjectLink.onmouseout  = () => subjectLink.style.textDecoration = 'none';
    tdSubject.appendChild(subjectLink);

    const tdStrategy = document.createElement('td');
    tdStrategy.className = 'td-strategy';
    const strategySel = document.createElement('select');
    strategySel.className = 'strategy-sel';
    strategySel.title = row.strategy || '';
    const stratBlank = document.createElement('option');
    stratBlank.value = '';
    stratBlank.textContent = '—';
    strategySel.appendChild(stratBlank);
    for (const s of activeStrategies) {
        const opt = document.createElement('option');
        opt.value = s.name;
        opt.textContent = s.name;
        if (s.name === row.strategy) opt.selected = true;
        strategySel.appendChild(opt);
    }
    strategySel.addEventListener('change', () => {
        row.strategy = strategySel.value;
        strategySel.title = strategySel.value;
    });
    tdStrategy.appendChild(strategySel);

    const tdLog = document.createElement('td');
    tdLog.className = 'td-log';
    tdLog.innerHTML = `<a href="${escapeHtml(row.logUrl)}" target="_blank" rel="noopener" class="log-btn" title="View logs">
        <img src="src/icons/external-link.svg" width="13" height="13" class="icon-img" alt="">
    </a>`;

    tr.append(tdNum, tdDate, tdUser, tdType, tdName, tdSubject, tdStrategy, tdLog);
    return tr;
}

function renderTable(rows) {
    currentRows = rows || [];
    const NCOLS = 8; // #, Date, User, Activity Name, Activity Type, Subject, Strategy, Logs
    tbody.innerHTML = '';
    const frag = document.createDocumentFragment();
    const showSeparators = sortCol === null;
    let visibleIdx = 0;

    if (!showSeparators) {
        if (!rows?.length) {
            tbody.innerHTML = `<tr><td colspan="${NCOLS}" class="empty-state-cell">No activities found.</td></tr>`;
            rowCountEl.textContent = '0 entries';
            return;
        }
        rows.forEach(row => { visibleIdx++; frag.appendChild(buildDataRow(row, visibleIdx)); });
    } else {
        // Ordered unique courses from courseRegistry (includes courses with 0 modules)
        const courseGroups = courseRegistry;

        if (!courseGroups.length) {
            tbody.innerHTML = `<tr><td colspan="${NCOLS}" class="empty-state-cell">No activities found.</td></tr>`;
            rowCountEl.textContent = '0 entries';
            return;
        }

        // Filtered rows keyed by course
        const rowsByGroup = new Map();
        (rows || []).forEach(r => {
            if (!rowsByGroup.has(r.courseGroupIndex)) rowsByGroup.set(r.courseGroupIndex, []);
            rowsByGroup.get(r.courseGroupIndex).push(r);
        });

        courseGroups.forEach(cg => {
            const sepTr = document.createElement('tr');
            const sepTd = document.createElement('td');
            sepTd.colSpan = NCOLS;
            sepTd.className = 'course-sep-cell';

            const iconBtn = document.createElement('button');
            iconBtn.className = 'course-sep-heatmap-btn';
            iconBtn.title = 'View activity heatmap';
            const iconImg = document.createElement('img');
            iconImg.src = 'src/icons/book-open-check.svg';
            iconImg.className = 'icon-img';
            iconImg.alt = '';
            iconBtn.appendChild(iconImg);
            iconBtn.addEventListener('click', e => {
                e.preventDefault();
                e.stopPropagation();
                openHeatmapModal(cg.courseGroupIndex);
            });

            const link = document.createElement('a');
            link.href = `${cg.courseBaseUrl}/course/view.php?id=${cg.courseId}`;
            link.target = '_blank';
            link.rel = 'noopener';
            link.className = 'course-sep-link';
            link.textContent = cg.courseName;

            sepTd.appendChild(iconBtn);
            sepTd.appendChild(link);
            sepTr.appendChild(sepTd);
            frag.appendChild(sepTr);

            const courseRows = rowsByGroup.get(cg.courseGroupIndex) || [];
            if (!courseRows.length) {
                const emptyTr = document.createElement('tr');
                const emptyTd = document.createElement('td');
                emptyTd.colSpan = NCOLS;
                emptyTd.className = 'course-empty-cell';
                emptyTd.textContent = 'No data.';
                emptyTr.appendChild(emptyTd);
                frag.appendChild(emptyTr);
            } else {
                courseRows.forEach(row => { visibleIdx++; frag.appendChild(buildDataRow(row, visibleIdx)); });
            }
        });
    }

    tbody.appendChild(frag);
    rowCountEl.textContent = `${visibleIdx} ${visibleIdx === 1 ? 'entry' : 'entries'}`;
}

function updateTabUI() {
    const tabs = [
        { btn: 'tabAll',      count: 'countAll',      key: 'all'      },
        { btn: 'tabTeachers', count: 'countTeachers', key: 'teachers' },
        { btn: 'tabOer',      count: 'countOer',      key: 'oer'      },
    ];
    tabs.forEach(({ btn, count, key }) => {
        const tEl = document.getElementById(btn);
        const cEl = document.getElementById(count);
        const on  = activeTab === key;
        tEl.classList.toggle('tab-btn--active', on);
        cEl.classList.toggle('tab-count--active', on);
    });
    setDownloadDisabled(downloadBtn, getActiveRows().length === 0);
}

function updateHeaderSortUI() {
    document.querySelectorAll('thead th[data-sort]').forEach(th => {
        const col = th.dataset.sort;
        const ind = th.querySelector('.sort-ind');
        if (!ind) return;
        if (col === sortCol) {
            ind.textContent = sortDir === 'asc' ? ' ↑' : ' ↓';
            ind.style.opacity = '1';
        } else {
            ind.textContent = ' ⇅';
            ind.style.opacity = '0.35';
        }
    });
}

function applyAndRender() {
    const sorted = applyHeaderSort(getActiveRows());
    let rows = hiddenTypes.size > 0 ? sorted.filter(r => !hiddenTypes.has(r.activityType)) : sorted;
    if (hiddenYears.size > 0 || hiddenMonths.size > 0) {
        rows = rows.filter(r => {
            const parts = (r.date || '').split('/');
            if (parts.length !== 3) return true;
            const [mm, , yyyy] = parts;
            return !hiddenYears.has(yyyy) && !hiddenMonths.has(mm);
        });
    }
    renderTable(rows);
    updateTabUI();
    updateHeaderSortUI();
    updateFilterUI();
    updateDateFilterUI();
}

function renderActiveTab() {
    closeFilterDropdown();
    closeDateFilterDropdown();
    applyAndRender();
}

function updateFilterUI() {
    const icon = document.getElementById('typeFilterIcon');
    if (icon) icon.classList.toggle('filter-active', hiddenTypes.size > 0);
}

function updateDateFilterUI() {
    const icon = document.getElementById('dateFilterIcon');
    if (icon) icon.classList.toggle('filter-active', hiddenYears.size > 0 || hiddenMonths.size > 0);
}

function closeFilterDropdown() {
    if (filterDropdown) { filterDropdown.remove(); filterDropdown = null; }
}

function closeDateFilterDropdown() {
    if (dateFilterDropdown) { dateFilterDropdown.remove(); dateFilterDropdown = null; }
}

// ── Heatmap modal ─────────────────────────────────────────────────────────────

function openHeatmapModal(targetGroupIndex = null) {
    if (!courseRegistry.length) return;

    // Row data per course comes from currentRows (respects active tab + filters)
    const rowsByGroup = new Map();
    currentRows.forEach(r => {
        if (!rowsByGroup.has(r.courseGroupIndex)) rowsByGroup.set(r.courseGroupIndex, []);
        rowsByGroup.get(r.courseGroupIndex).push(r);
    });

    heatmapCourses = courseRegistry.map(g => ({
        courseName: g.courseName,
        rows: rowsByGroup.get(g.courseGroupIndex) || []
    }));

    heatmapCourseSelect.innerHTML = '';
    heatmapCourses.forEach((c, i) => {
        const opt = document.createElement('option');
        opt.value = i;
        opt.textContent = c.courseName || `Course ${i + 1}`;
        heatmapCourseSelect.appendChild(opt);
    });

    let startIdx = 0;
    if (targetGroupIndex !== null) {
        const found = courseRegistry.findIndex(g => g.courseGroupIndex === targetGroupIndex);
        if (found >= 0) startIdx = found;
    }

    renderHeatmapForCourse(startIdx);
    heatmapModal.style.display = 'flex';
}

function closeHeatmapModal() {
    heatmapModal.style.display = 'none';
}

function renderHeatmapForCourse(idx) {
    heatmapCourseIdx = idx;
    heatmapCourseSelect.value = idx;

    const { rows } = heatmapCourses[idx];

    heatmapContent.innerHTML = '';
    if (!rows.length) {
        const msg = document.createElement('div');
        msg.className = 'hm-empty-state';
        msg.textContent = 'No data available for this course.';
        heatmapContent.appendChild(msg);
        updateHeatmapNav();
        return;
    }

    // Build day-rows map: 'YYYY-MM-DD' → [row, ...]
    const dayRowsMap = {};
    rows.forEach(r => {
        if (!r.rawTs) return;
        const d   = new Date(r.rawTs * 1000);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        if (!dayRowsMap[key]) dayRowsMap[key] = [];
        dayRowsMap[key].push(r);
    });

    // Unique years with data, newest first
    const years = [...new Set(Object.keys(dayRowsMap).map(k => parseInt(k)))].sort((a, b) => b - a);

    years.forEach(year => heatmapContent.appendChild(buildHeatmapYearSection(year, dayRowsMap)));
    heatmapContent.appendChild(buildHeatmapLegend());
    updateHeatmapNav();
}

function buildHeatmapYearSection(year, dayRowsMap) {
    const today = new Date(); today.setHours(23, 59, 59, 999);
    const DOW   = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

    const section = document.createElement('div');
    section.className = 'hm-year-section';

    const yearLbl = document.createElement('div');
    yearLbl.className = 'hm-year-label';
    yearLbl.textContent = year;
    section.appendChild(yearLbl);

    const calGrid = document.createElement('div');
    calGrid.className = 'hm-cal-grid';

    for (let m = 0; m < 12; m++) {
        const card = document.createElement('div');
        card.className = 'hm-month-card';

        const monthName = document.createElement('div');
        monthName.className = 'hm-cal-month-name';
        monthName.textContent = MONTH_SHORT[m];

        // Count entries for this month
        const monthPrefix = `${year}-${String(m + 1).padStart(2, '0')}-`;
        const monthCount  = Object.keys(dayRowsMap)
            .filter(k => k.startsWith(monthPrefix))
            .reduce((sum, k) => sum + dayRowsMap[k].length, 0);
        if (monthCount > 0) {
            const label = `${monthCount} module${monthCount === 1 ? '' : 's'} in ${MONTH_NAMES[m]}`;
            monthName.addEventListener('mouseenter', () => showHmTooltipSimple(monthName, label));
            monthName.addEventListener('mouseleave', hideHmTooltip);
        }

        card.appendChild(monthName);

        const dowRow = document.createElement('div');
        dowRow.className = 'hm-cal-dow-row';
        DOW.forEach(lbl => {
            const el = document.createElement('div');
            el.className = 'hm-cal-dow-label';
            el.textContent = lbl;
            dowRow.appendChild(el);
        });
        card.appendChild(dowRow);

        const daysGrid = document.createElement('div');
        daysGrid.className = 'hm-cal-days-grid';

        const firstDow    = new Date(year, m, 1).getDay();   // 0=Sun
        const daysInMonth = new Date(year, m + 1, 0).getDate();
        const totalCells  = Math.ceil((firstDow + daysInMonth) / 7) * 7;

        for (let i = 0; i < totalCells; i++) {
            const dayNum = i - firstDow + 1;
            const cell   = document.createElement('div');

            if (dayNum < 1 || dayNum > daysInMonth) {
                cell.className = 'hm-cal-day hm-cal-day--empty';
            } else {
                const d        = new Date(year, m, dayNum);
                const isFuture = d > today;
                const key      = `${year}-${String(m + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
                const cellRows = dayRowsMap[key] || [];
                const count    = cellRows.length;
                const level    = count === 0 ? 0 : count <= 3 ? 1 : count <= 6 ? 2 : count <= 10 ? 3 : 4;

                cell.className = isFuture
                    ? 'hm-cal-day hm-cal-day--future'
                    : `hm-cal-day hm-level-${level}`;

                const numEl = document.createElement('span');
                numEl.className = 'hm-cal-day-num';
                numEl.textContent = dayNum;
                cell.appendChild(numEl);

                if (!isFuture && count > 0) {
                    const dateStr = `${MONTH_NAMES[m]} ${dayNum}, ${year}`;
                    cell.addEventListener('mouseenter', () => showHmTooltip(cell, cellRows, dateStr));
                    cell.addEventListener('mouseleave', hideHmTooltip);
                }
            }

            daysGrid.appendChild(cell);
        }

        card.appendChild(daysGrid);
        calGrid.appendChild(card);
    }

    section.appendChild(calGrid);
    return section;
}

function buildHeatmapLegend() {
    const legend = document.createElement('div');
    legend.className = 'hm-legend';

    const less = document.createElement('span');
    less.className = 'hm-legend-label';
    less.textContent = 'Less';
    legend.appendChild(less);

    [0, 1, 2, 3, 4].forEach(level => {
        const cell = document.createElement('div');
        cell.className = `hm-legend-cell hm-level-${level}`;
        legend.appendChild(cell);
    });

    const more = document.createElement('span');
    more.className = 'hm-legend-label';
    more.textContent = 'More';
    legend.appendChild(more);

    return legend;
}

function showHmTooltip(cell, rows, dateStr) {
    clearTimeout(hmTooltipHideTimer);
    if (!hmTooltip) return;

    hmTooltip.querySelector('.hm-tooltip-header').textContent =
        `${rows.length} module${rows.length === 1 ? '' : 's'} on ${dateStr}`;

    const list = hmTooltip.querySelector('.hm-tooltip-list');
    list.innerHTML = '';
    const MAX = 10;
    rows.slice(0, MAX).forEach(r => {
        const li = document.createElement('li');
        if (r.activityUrl) {
            const a = document.createElement('a');
            a.href        = r.activityUrl;
            a.target      = '_blank';
            a.rel         = 'noopener';
            a.className   = 'hm-tooltip-link';
            a.textContent = r.activityName;
            li.appendChild(a);
        } else {
            li.className   = 'hm-tooltip-item';
            li.textContent = r.activityName;
        }
        list.appendChild(li);
    });
    if (rows.length > MAX) {
        const more = document.createElement('li');
        more.className   = 'hm-tooltip-more';
        more.textContent = `+${rows.length - MAX} more`;
        list.appendChild(more);
    }

    hmTooltip.style.display = 'block';

    const rect = cell.getBoundingClientRect();
    const ttW  = hmTooltip.offsetWidth  || 220;
    const ttH  = hmTooltip.offsetHeight || 120;

    let left = rect.right + 8;
    let top  = rect.top;

    if (left + ttW > window.innerWidth  - 8) left = rect.left  - ttW - 8;
    if (top  + ttH > window.innerHeight - 8) top  = window.innerHeight - ttH - 8;
    if (top < 8) top = 8;

    hmTooltip.style.left = left + 'px';
    hmTooltip.style.top  = top  + 'px';
}

function showHmTooltipSimple(el, text) {
    clearTimeout(hmTooltipHideTimer);
    if (!hmTooltip) return;

    hmTooltip.querySelector('.hm-tooltip-header').textContent = text;
    hmTooltip.querySelector('.hm-tooltip-list').innerHTML = '';

    hmTooltip.style.display = 'block';

    const rect = el.getBoundingClientRect();
    const ttW  = hmTooltip.offsetWidth  || 200;
    const ttH  = hmTooltip.offsetHeight || 36;

    let left = rect.right + 8;
    let top  = rect.top;

    if (left + ttW > window.innerWidth  - 8) left = rect.left  - ttW - 8;
    if (top  + ttH > window.innerHeight - 8) top  = window.innerHeight - ttH - 8;
    if (top < 8) top = 8;

    hmTooltip.style.left = left + 'px';
    hmTooltip.style.top  = top  + 'px';
}

function hideHmTooltip() {
    hmTooltipHideTimer = setTimeout(() => {
        if (hmTooltip) hmTooltip.style.display = 'none';
    }, 120);
}

function updateHeatmapNav() {
    const idx   = heatmapCourseIdx;
    const total = heatmapCourses.length;
    const hasPrev = idx > 0;
    const hasNext = idx < total - 1;

    heatmapPrevBtn.style.visibility = hasPrev ? 'visible' : 'hidden';
    heatmapNextBtn.style.visibility = hasNext ? 'visible' : 'hidden';

    if (hasPrev) heatmapPrevBtn.innerHTML = `<img src="src/icons/chevron-left.svg" width="13" height="13" class="icon-img" style="flex-shrink:0" alt=""><span class="hm-nav-label">${escapeHtml(heatmapCourses[idx - 1].courseName)}</span>`;
    if (hasNext) heatmapNextBtn.innerHTML = `<span class="hm-nav-label">${escapeHtml(heatmapCourses[idx + 1].courseName)}</span><img src="src/icons/chevron-right.svg" width="13" height="13" class="icon-img" style="flex-shrink:0" alt="">`;
}

function toggleFilterDropdown(anchor) {
    if (filterDropdown) { closeFilterDropdown(); return; }

    const rows  = getActiveRows();
    const types = [...new Set(rows.map(r => r.activityType))].sort();
    if (!types.length) return;

    const dd = document.createElement('div');
    dd.className = 'filter-dropdown';

    const hdr = document.createElement('div');
    hdr.className = 'filter-dropdown-header';
    const hdrText  = document.createElement('span');
    hdrText.textContent = 'Filter by Type';
    const resetBtn = document.createElement('button');
    resetBtn.textContent = 'Show all';
    resetBtn.className = 'filter-reset-btn';
    resetBtn.addEventListener('click', e => {
        e.stopPropagation();
        hiddenTypes.clear();
        dd.querySelectorAll('input[type=checkbox]').forEach(cb => { cb.checked = true; });
        console.log('[filter] reset — showing all types');
        applyAndRender();
    });
    hdr.append(hdrText, resetBtn);
    dd.appendChild(hdr);

    const list = document.createElement('div');
    list.className = 'filter-dropdown-list';
    types.forEach(type => {
        const lbl = document.createElement('label');
        lbl.className = 'filter-item';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = !hiddenTypes.has(type);
        cb.className = 'filter-checkbox';
        cb.addEventListener('change', () => {
            if (cb.checked) hiddenTypes.delete(type); else hiddenTypes.add(type);
            console.log(`[filter] "${type}" ${cb.checked ? 'shown' : 'hidden'} — hiddenTypes size: ${hiddenTypes.size}`);
            applyAndRender();
        });
        lbl.append(cb, document.createTextNode(type));
        list.appendChild(lbl);
    });
    dd.appendChild(list);
    dd.addEventListener('click', e => e.stopPropagation());
    document.body.appendChild(dd);
    filterDropdown = dd;

    const rect = anchor.getBoundingClientRect();
    dd.style.left = Math.min(rect.left, window.innerWidth - 230) + 'px';
    dd.style.top  = (rect.bottom + 6) + 'px';

    setTimeout(() => document.addEventListener('click', closeFilterDropdown, {once: true}), 0);
}

function toggleDateFilterDropdown(anchor) {
    if (dateFilterDropdown) { closeDateFilterDropdown(); return; }

    const rows = getActiveRows();
    const yearSet  = new Set();
    const monthSet = new Set();
    rows.forEach(r => {
        const parts = (r.date || '').split('/');
        if (parts.length === 3) { monthSet.add(parts[0]); yearSet.add(parts[2]); }
    });
    const years  = [...yearSet].sort((a, b) => parseInt(b) - parseInt(a));
    const months = [...monthSet].sort((a, b) => parseInt(a) - parseInt(b));
    if (!years.length && !months.length) return;

    const dd = document.createElement('div');
    dd.className = 'filter-dropdown-date';

    const hdr = document.createElement('div');
    hdr.className = 'filter-dropdown-header';
    const hdrText  = document.createElement('span');
    hdrText.textContent = 'Filter by Date';
    const clearBtn = document.createElement('button');
    clearBtn.textContent = 'Show all';
    clearBtn.className = 'filter-reset-btn';
    clearBtn.addEventListener('click', e => {
        e.stopPropagation();
        hiddenYears.clear();
        hiddenMonths.clear();
        dd.querySelectorAll('input[type=checkbox]').forEach(cb => { cb.checked = true; });
        applyAndRender();
    });
    hdr.append(hdrText, clearBtn);
    dd.appendChild(hdr);

    const list = document.createElement('div');
    list.className = 'filter-dropdown-list-tall';

    function addSection(title, items, hiddenSet, keyOf, labelOf) {
        const sHdr = document.createElement('div');
        sHdr.className = 'filter-section-header';
        sHdr.textContent = title;
        list.appendChild(sHdr);
        items.forEach(item => {
            const key = keyOf(item);
            const lbl = document.createElement('label');
            lbl.className = 'filter-item';
            const cb = document.createElement('input');
            cb.type    = 'checkbox';
            cb.checked = !hiddenSet.has(key);
            cb.className = 'filter-checkbox';
            cb.addEventListener('change', () => {
                if (cb.checked) hiddenSet.delete(key); else hiddenSet.add(key);
                applyAndRender();
            });
            lbl.append(cb, document.createTextNode(labelOf(item)));
            list.appendChild(lbl);
        });
    }

    if (years.length)  addSection('Year',  years,  hiddenYears,  y => y, y => y);
    if (months.length) addSection('Month', months, hiddenMonths, m => m, m => MONTH_NAMES[parseInt(m, 10) - 1] || m);

    dd.appendChild(list);
    dd.addEventListener('click', e => e.stopPropagation());
    document.body.appendChild(dd);
    dateFilterDropdown = dd;

    const rect = anchor.getBoundingClientRect();
    dd.style.left = Math.min(rect.left, window.innerWidth - 200) + 'px';
    dd.style.top  = (rect.bottom + 6) + 'px';

    setTimeout(() => document.addEventListener('click', closeDateFilterDropdown, { once: true }), 0);
}

function setDownloadDisabled(btn, off) {
    btn.disabled = off;
    btn.style.opacity       = off ? '0.35' : '';
    btn.style.cursor        = off ? 'not-allowed' : '';
    btn.style.pointerEvents = off ? 'none' : '';
}

function updateTabCounts() {
    document.getElementById('countAll').textContent      = allData.length;
    document.getElementById('countTeachers').textContent = teacherData.length;
    document.getElementById('countOer').textContent      = oerData.length;
    setDownloadDisabled(downloadBtn, getActiveRows().length === 0);
}

// ── CSV ───────────────────────────────────────────────────────────────────────

function coursePrefix(name) {
    const m = (name || '').match(/^(\d+)\s*-\s*/);
    return m ? `${m[1]}: ` : '';
}

function exportCSV(rows, filename, label = '') {
    if (!rows.length) { setStatus('Nothing to export.', true); return; }
    const hdr  = ['Date', 'User', 'Activity Type', 'Activity Name', 'Subject', 'Strategy', 'Course Name', 'Activity URL'];
    const body = rows.map(r => {
        const prefix = coursePrefix(r.courseName);
        return [
            r.date,
            r.fullname,
            r.activityType,
            prefix + r.activityName,
            r.subject     || '',
            r.strategy    || '',
            r.courseName  || '',
            r.activityUrl || '',
        ];
    });
    const csv = [hdr, ...body].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], {type: 'text/csv;charset=utf-8;'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setStatus(`Exported ${rows.length} ${label} entries.`);
}

// ── Per-course processing ─────────────────────────────────────────────────────

async function processCourse({ baseUrl, courseId }, token, sessionCookie, groupIndex, onProgress) {
    const [courseName, sections, fallbackUser] = await Promise.all([
        fetchCourseName(baseUrl, token, courseId),
        apiFetch(baseUrl, token, 'core_course_get_contents', {courseid: String(courseId)}),
        fetchFirstAccessor(baseUrl, token, courseId),
    ]);
    const subject = getSubject(courseName || '');
    return buildRows(sections, baseUrl, courseId, sessionCookie, fallbackUser, courseName, subject, groupIndex, onProgress);
}

function resetTable() {
    if (!snapshotAllData.length) return;
    allData      = [...snapshotAllData];
    teacherData  = [...snapshotTeacherData];
    oerData      = [...snapshotOerData];
    hiddenTypes  = new Set(snapshotHiddenTypes);
    hiddenYears  = new Set(snapshotHiddenYears);
    hiddenMonths = new Set(snapshotHiddenMonths);
    sortCol      = null;
    sortDir      = 'asc';
    activeTab    = 'all';
    updateTabCounts();
    updateTabUI();
    updateFilterUI();
    updateDateFilterUI();
    renderActiveTab();
}

// ── Event listeners ───────────────────────────────────────────────────────────

document.getElementById('tabAll').addEventListener('click', () => {
    activeTab = 'all';
    renderActiveTab();
});

document.getElementById('tabTeachers').addEventListener('click', () => {
    activeTab = 'teachers';
    renderActiveTab();
});

document.getElementById('tabOer').addEventListener('click', () => {
    activeTab = 'oer';
    renderActiveTab();
});

document.getElementById('resetBtn').addEventListener('click', resetTable);

heatmapBtn.addEventListener('click', openHeatmapModal);
heatmapCloseBtn.addEventListener('click', closeHeatmapModal);
heatmapModal.addEventListener('click', e => { if (e.target === heatmapModal) closeHeatmapModal(); });
heatmapCourseSelect.addEventListener('change', () => renderHeatmapForCourse(+heatmapCourseSelect.value));
heatmapPrevBtn.addEventListener('click', () => renderHeatmapForCourse(heatmapCourseIdx - 1));
heatmapNextBtn.addEventListener('click', () => renderHeatmapForCourse(heatmapCourseIdx + 1));
hmTooltip.addEventListener('mouseenter', () => clearTimeout(hmTooltipHideTimer));
hmTooltip.addEventListener('mouseleave', hideHmTooltip);

downloadBtn.addEventListener('click', () => {
    const sorted = applyHeaderSort(getActiveRows());
    let rows = hiddenTypes.size > 0 ? sorted.filter(r => !hiddenTypes.has(r.activityType)) : sorted;
    if (hiddenYears.size > 0 || hiddenMonths.size > 0) {
        rows = rows.filter(r => {
            const parts = (r.date || '').split('/');
            if (parts.length !== 3) return true;
            const [mm, , yyyy] = parts;
            return !hiddenYears.has(yyyy) && !hiddenMonths.has(mm);
        });
    }
    if (!rows.length) { setStatus('No rows to export. Please adjust your filter.', true); return; }
    const label   = activeTab === 'oer' ? 'OER' : activeTab === 'all' ? 'All Activities' : 'Teachers Creation';
    const prefix  = activeTab === 'oer' ? 'OER' : activeTab === 'all' ? 'ALL' : 'TC';
    const ids     = [...new Set(rows.map(r => r.courseId))].join('-');
    exportCSV(rows, `${prefix}_${ids}.csv`, label);
});

window.addEventListener('strategies-updated', async () => {
    await loadStrategies();
    if (tableData.length > 0) {
        tableData.forEach(r => { r.strategy = getStrategy(r.activityName); });
        renderTable(currentRows);
    }
});

window.addEventListener('subjects-updated', async () => {
    await loadSubjects();
    if (tableData.length > 0) {
        tableData.forEach(r => { r.subject = getSubject(r.courseName || ''); });
        renderActiveTab();
    }
});

document.addEventListener('DOMContentLoaded', async () => {
    await Promise.all([loadStrategies(), loadSubjects()]);

    // Activity type filter icon
    const typeFilterIcon = document.getElementById('typeFilterIcon');
    if (typeFilterIcon) {
        typeFilterIcon.addEventListener('click', e => {
            e.stopPropagation();
            toggleFilterDropdown(typeFilterIcon);
        });
    }

    // Date filter icon
    const dateFilterIcon = document.getElementById('dateFilterIcon');
    if (dateFilterIcon) {
        dateFilterIcon.addEventListener('click', e => {
            e.stopPropagation();
            toggleDateFilterDropdown(dateFilterIcon);
        });
    }

    // Header click sort
    document.querySelectorAll('thead th[data-sort]').forEach(th => {
        th.style.cursor = 'pointer';
        th.title = 'Click to sort';
        th.addEventListener('click', () => {
            const col = th.dataset.sort;
            if (sortCol === col) {
                sortDir = sortDir === 'asc' ? 'desc' : 'asc';
                if (sortDir === 'asc' && col === sortCol) {
                    // third-click reset handled by toggling back to asc on second click
                }
            } else {
                sortCol = col;
                sortDir = 'asc';
            }
            renderActiveTab();
        });
    });
});

fetchBtn.addEventListener('click', async () => {
    const urlsRaw       = document.getElementById('courseUrl').value;
    const token         = document.getElementById('wsToken').value.trim();
    const sessionCookie = document.getElementById('sessionKey').value.trim();

    let urls = urlsRaw.split('\n').map(u => u.trim()).filter(Boolean);
    if (!urls.length) { setStatus('Please enter at least one course URL.', true); return; }
    if (!token)       { setStatus('Web service token is required.', true); return; }

    // Detect duplicate URLs (trim + strip trailing slash for comparison)
    const normUrl   = u => u.replace(/\/+$/, '');
    const seenUrls  = new Map();
    const dupUrls   = [];
    const dedupedUrls = [];
    for (const u of urls) {
        const key = normUrl(u);
        if (seenUrls.has(key)) { dupUrls.push(u); }
        else { seenUrls.set(key, u); dedupedUrls.push(u); }
    }
    if (dupUrls.length) {
        const list = dupUrls.map(u => `  • ${u}`).join('\n');
        const ok = confirm(`Duplicate course URLs detected and will be removed:\n${list}\n\nOnly the first entry will be kept. Continue?`);
        if (!ok) return;
        document.getElementById('courseUrl').value = dedupedUrls.join('\n');
        urls = dedupedUrls;
    }

    // Validate all URLs before fetching any
    const courseEntries = [];
    for (const urlRaw of urls) {
        try {
            const parsed    = new URL(urlRaw);
            const courseIdx = parsed.pathname.indexOf('/course/');
            const basePath  = courseIdx > 0 ? parsed.pathname.slice(0, courseIdx) : '';
            const baseUrl   = parsed.origin + basePath;
            const courseId  = parseInt(parsed.searchParams.get('id'), 10);
            if (isNaN(courseId) || courseId <= 0) throw new Error('no id');
            courseEntries.push({ baseUrl, courseId });
        } catch {
            setStatus(`Invalid URL: ${urlRaw}`, true);
            return;
        }
    }

    // Reset
    tableData      = [];
    allData        = [];
    teacherData    = [];
    oerData        = [];
    courseRegistry = [];
    document.getElementById('countAll').textContent      = '0';
    document.getElementById('countTeachers').textContent = '0';
    document.getElementById('countOer').textContent      = '0';
    sortCol     = null;
    sortDir     = 'asc';
    closeFilterDropdown();
    closeDateFilterDropdown();
    document.getElementById('corsNotice').style.display = 'none';
    tbody.innerHTML = `<tr><td colspan="8" class="empty-state-cell">Loading…</td></tr>`;
    rowCountEl.textContent = 'loading…';
    setDownloadDisabled(downloadBtn, true);
    setDownloadDisabled(heatmapBtn, true);
    document.getElementById('courseNameSection').style.display = 'none';
    setStatus(`Processing ${courseEntries.length} course(s)…`);

    await Promise.all([loadStrategies(), loadSubjects()]);
    setBtnLoading('Fetching course structure…');

    try {
        const N = courseEntries.length;

        // Phase 1 — fetch all course metadata in parallel (fast API calls)
        const metaList = await Promise.all(courseEntries.map(async entry => {
            const [courseName, sections, fallbackUser] = await Promise.all([
                fetchCourseName(entry.baseUrl, token, entry.courseId),
                apiFetch(entry.baseUrl, token, 'core_course_get_contents', {courseid: String(entry.courseId)}),
                fetchFirstAccessor(entry.baseUrl, token, entry.courseId),
            ]);
            return { ...entry, courseName, sections, fallbackUser };
        }));

        courseRegistry = metaList.map((m, i) => ({
            courseGroupIndex: i,
            courseId:         m.courseId,
            courseName:       m.courseName || `Course ${m.courseId}`,
            courseBaseUrl:    m.baseUrl,
        }));
        const modCounts  = metaList.map(m => m.sections.flatMap(s => s.modules || []).length);
        const totalMods  = modCounts.reduce((a, b) => a + b, 0);
        let   globalDone = 0;

        // Phase 2 — fetch logs sequentially with smooth global progress bar
        const allRows = [];
        for (let i = 0; i < N; i++) {
            const { baseUrl, courseId, courseName, sections, fallbackUser } = metaList[i];
            const subject      = getSubject(courseName || '');
            const courseModCnt = modCounts[i];

            setStatus(`Course ${i + 1} / ${N} — fetching logs for "${courseName || courseId}"…`);
            const rows = await buildRows(
                sections, baseUrl, courseId, sessionCookie, fallbackUser,
                courseName, subject, i,
                (frac, label) => {
                    const globalFrac = totalMods > 0
                        ? (globalDone + frac * modCounts[i]) / totalMods
                        : (i + frac) / N;
                    setBtnLoading(`Course ${i + 1}/${N}: ${label}`, globalFrac);
                }
            );
            globalDone += courseModCnt;
            allRows.push(...rows);
        }

        tableData   = allRows.filter(r => !isExcludedRow(r));
        deduplicateActivityNames(tableData);
        allData     = [...tableData];
        teacherData = tableData.filter(r => r.modname !== 'url');
        oerData     = tableData.filter(r => r.modname === 'url');

        // Default type filter: hide "Text and Media Area" if present in data
        hiddenTypes  = new Set();
        hiddenYears  = new Set();
        hiddenMonths = new Set();
        if (new Set(tableData.map(r => r.activityType)).has('Text and Media Area')) {
            hiddenTypes.add('Text and Media Area');
        }

        // Snapshot for Reset Table
        snapshotAllData      = [...allData];
        snapshotTeacherData  = [...teacherData];
        snapshotOerData      = [...oerData];
        snapshotHiddenTypes  = new Set(hiddenTypes);
        snapshotHiddenYears  = new Set(hiddenYears);
        snapshotHiddenMonths = new Set(hiddenMonths);

        if (N === 1 && allRows.length > 0) {
            const nameEl = document.getElementById('courseNameDisplay');
            nameEl.textContent = allRows[0].courseName || `Course ${courseEntries[0].courseId}`;
            nameEl.href = `${courseEntries[0].baseUrl}/course/view.php?id=${courseEntries[0].courseId}`;
            document.getElementById('courseNameSection').style.display = 'block';
        }

        const logCount = tableData.filter(r => r.fromLog).length;
        setStatus(`Done. ${tableData.length} module(s) across ${N} course(s) — ${logCount} with confirmed log date.`);
        setBtnSuccess('✓ Done');
        setDownloadDisabled(heatmapBtn, courseRegistry.length === 0);

        updateTabCounts();
        activeTab = 'all';
        renderActiveTab();

    } catch (err) {
        console.error(err);
        let msg = err.message;
        if (msg.includes('Invalid token') || msg.includes('Access control')) msg = 'Invalid token or insufficient permissions.';
        else if (msg.includes('Course not found')) msg = 'Course not found — check the course ID.';
        setStatus(msg, true);
        setBtnError('✗ Failed');
        tbody.innerHTML = `<tr><td colspan="8" class="empty-state-cell" style="color:#ef4444">${escapeHtml(msg)}</td></tr>`;
    }
});
