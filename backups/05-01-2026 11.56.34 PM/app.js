// ── DOM cache ─────────────────────────────────────────────────────────────────
const statusDiv     = document.getElementById('statusMessage');
const tbody         = document.getElementById('reportTbody');
const rowCountEl    = document.getElementById('rowCount');
const downloadBtn   = document.getElementById('downloadBtn');
const progressWrap  = document.getElementById('progressWrap');
const progressBar   = document.getElementById('progressBar');
const progressPct   = document.getElementById('progressPct');
const progressLabel = document.getElementById('progressLabel');

// ── State ─────────────────────────────────────────────────────────────────────
let tableData            = [];
let allData              = [];
let teacherData          = [];
let oerData              = [];
let snapshotAllData      = [];
let snapshotTeacherData  = [];
let snapshotOerData      = [];
let snapshotHiddenTypes  = new Set();
let activeTab        = 'all'; // 'all' | 'teachers' | 'oer'
let sortCol          = null;       // null | 'rawTs' | 'fullname' | 'activityName' | 'activityType' | 'subject' | 'strategy'
let sortDir          = 'asc';      // 'asc' | 'desc'
let currentRows      = [];
let activeStrategies = [];
let activeSubjects   = [];
let hiddenTypes      = new Set();
let filterDropdown   = null;

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
    const dark = isDarkMode();
    statusDiv.style.cssText = isError
        ? (dark
            ? 'margin-top:12px;padding:10px 14px;border-radius:8px;background:rgba(239,68,68,.1);border-left:3px solid #ef4444;font-size:13px;color:#fca5a5'
            : 'margin-top:12px;padding:10px 14px;border-radius:8px;background:#fef2f2;border-left:3px solid #ef4444;font-size:13px;color:#b91c1c')
        : (dark
            ? 'margin-top:12px;padding:10px 14px;border-radius:8px;background:rgba(139,92,246,.06);border-left:3px solid rgba(139,92,246,.5);font-size:13px;color:rgba(196,181,253,.85)'
            : 'margin-top:12px;padding:10px 14px;border-radius:8px;background:#f1f5f9;border-left:3px solid #0284c7;font-size:13px;color:#475569');
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

async function buildRows(sections, token, baseUrl, courseId, sessionCookie, fallbackUser, courseName, detectedSubject, courseGroupIndex, onProgress) {
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

function renderTable(rows) {
    currentRows = rows || [];
    const NCOLS = 8; // #, Date, User, Activity Name, Activity Type, Subject, Strategy, Logs

    tbody.innerHTML = '';
    if (!rows?.length) {
        tbody.innerHTML = `<tr><td colspan="${NCOLS}" style="text-align:center;padding:64px 20px;color:#94a3b8;font-size:13px;font-style:italic">No activities found.</td></tr>`;
        rowCountEl.textContent = '0 entries';
        return;
    }

    const frag = document.createDocumentFragment();
    const showSeparators = sortCol === null;
    let lastGroupIndex = -1;
    let visibleIdx = 0;

    rows.forEach(row => {
        // ── Course separator row ────────────────────────────────────────────
        if (showSeparators && row.courseGroupIndex !== lastGroupIndex) {
            lastGroupIndex = row.courseGroupIndex;
            const sepTr = document.createElement('tr');
            const sepTd = document.createElement('td');
            sepTd.colSpan = NCOLS;
            sepTd.style.cssText = 'padding:8px 16px;background:rgba(139,92,246,.07);border-top:1px solid rgba(139,92,246,.2);border-bottom:1px solid rgba(139,92,246,.12)';
            sepTd.innerHTML = `<a href="${escapeHtml(row.courseBaseUrl)}/course/view.php?id=${row.courseId}" target="_blank" rel="noopener"
                style="font-size:12px;font-weight:700;color:#a78bfa;text-decoration:none;display:inline-flex;align-items:center;gap:6px"
                onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'">
                <svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/></svg>
                ${escapeHtml(row.courseName)}
            </a>`;
            sepTr.appendChild(sepTd);
            frag.appendChild(sepTr);
        }

        // ── Data row ────────────────────────────────────────────────────────
        visibleIdx++;
        const dark = isDarkMode();
        const tr = document.createElement('tr');
        tr.style.borderBottom = dark ? '1px solid rgba(139,92,246,.07)' : '1px solid #f1f5f9';
        tr.onmouseenter = () => tr.style.background = dark ? 'rgba(139,92,246,.06)' : '#f0f9ff';
        tr.onmouseleave = () => tr.style.background = '';

        const tdNum = document.createElement('td');
        tdNum.style.cssText = `padding:10px 16px;color:${dark ? 'rgba(148,163,184,.5)' : '#94a3b8'};font-size:11px;font-family:monospace`;
        tdNum.textContent = visibleIdx;

        const tdDate = document.createElement('td');
        tdDate.style.cssText = 'padding:10px 16px;white-space:nowrap';
        const badgeCfg = dark ? {
            VERIFIED:  { bg:'rgba(52,211,153,.15)',  fg:'#34d399', bd:'rgba(52,211,153,.3)',  text:'LOG'   },
            INFERRED:  { bg:'rgba(251,146,60,.15)',  fg:'#fb923c', bd:'rgba(251,146,60,.3)',  text:'FIRST' },
            ESTIMATED: { bg:'rgba(251,191,36,.15)',  fg:'#fbbf24', bd:'rgba(251,191,36,.3)',  text:'EST'   },
        } : {
            VERIFIED:  { bg:'#d1fae5', fg:'#059669', bd:'#a7f3d0', text:'LOG'   },
            INFERRED:  { bg:'#ffedd5', fg:'#ea580c', bd:'#fed7aa', text:'FIRST' },
            ESTIMATED: { bg:'#fef3c7', fg:'#ca8a04', bd:'#fde68a', text:'EST'   },
        };
        const bc    = badgeCfg[row.dateSource] || badgeCfg.ESTIMATED;
        const badge = `<span style="margin-left:6px;font-size:10px;font-weight:700;background:${bc.bg};color:${bc.fg};border:1px solid ${bc.bd};padding:1px 6px;border-radius:99px;cursor:default" title="Source: ${escapeHtml(row.eventLabel || '')}">${bc.text}</span>`;
        const dateChipStyle = dark
            ? 'font-family:monospace;font-size:12px;background:rgba(139,92,246,.12);color:#c4b5fd;padding:3px 10px;border-radius:6px;font-weight:600'
            : 'font-family:monospace;font-size:12px;background:#f1f5f9;color:#334155;padding:3px 10px;border-radius:6px;font-weight:600';
        tdDate.innerHTML = `<span style="${dateChipStyle}">${escapeHtml(row.date)}</span>${badge}`;

        const tdUser = document.createElement('td');
        tdUser.style.cssText = 'padding:10px 16px';
        tdUser.innerHTML = row.profileUrl
            ? `<a href="${escapeHtml(row.profileUrl)}" target="_blank" rel="noopener" style="color:${dark ? '#a78bfa' : '#0369a1'};font-weight:600;text-decoration:none" onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'">${escapeHtml(row.fullname)}</a>`
            : `<span style="color:${dark ? 'rgba(196,181,253,.75)' : '#475569'}">${escapeHtml(row.fullname)}</span>`;

        const tdName = document.createElement('td');
        tdName.style.cssText = 'padding:10px 16px';
        tdName.innerHTML = row.activityUrl
            ? `<a href="${escapeHtml(row.activityUrl)}" target="_blank" rel="noopener" style="color:${dark ? '#c4b5fd' : '#7c3aed'};font-weight:600;text-decoration:none" onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'">${escapeHtml(row.activityName)}</a>`
            : `<span style="color:${dark ? '#e2e8f0' : '#334155'};font-weight:500">${escapeHtml(row.activityName)}</span>`;

        const tdType = document.createElement('td');
        tdType.style.cssText = 'padding:10px 16px';
        const typeStyle = dark
            ? 'font-size:11px;font-weight:600;background:rgba(139,92,246,.12);color:#a78bfa;border:1px solid rgba(139,92,246,.3);padding:2px 10px;border-radius:99px'
            : 'font-size:11px;font-weight:600;background:#f0f9ff;color:#0369a1;border:1px solid #bae6fd;padding:2px 10px;border-radius:99px';
        tdType.innerHTML = `<span style="${typeStyle}">${escapeHtml(row.activityType)}</span>`;

        const tdSubject = document.createElement('td');
        tdSubject.style.cssText = 'padding:10px 16px';
        const subjectLink = document.createElement('a');
        subjectLink.href    = `${row.courseBaseUrl}/course/view.php?id=${row.courseId}`;
        subjectLink.target  = '_blank';
        subjectLink.rel     = 'noopener';
        subjectLink.title   = row.courseName || '';
        subjectLink.textContent = row.subject || 'Uncategorized';
        subjectLink.style.cssText = `color:${dark ? '#a78bfa' : '#7c3aed'};font-size:12px;font-weight:600;text-decoration:none;white-space:nowrap`;
        subjectLink.onmouseover = () => subjectLink.style.textDecoration = 'underline';
        subjectLink.onmouseout  = () => subjectLink.style.textDecoration = 'none';
        tdSubject.appendChild(subjectLink);

        const tdStrategy = document.createElement('td');
        tdStrategy.style.cssText = 'padding:6px 16px';
        const strategySel = document.createElement('select');
        strategySel.className = 'strategy-sel';
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
        strategySel.addEventListener('change', () => { row.strategy = strategySel.value; });
        tdStrategy.appendChild(strategySel);

        const tdLog = document.createElement('td');
        tdLog.style.cssText = 'padding:10px 16px;text-align:center';
        tdLog.innerHTML = `<a href="${escapeHtml(row.logUrl)}" target="_blank" rel="noopener" class="log-btn" title="View logs" style="padding:4px 8px">
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
            </svg>
        </a>`;

        tr.append(tdNum, tdDate, tdUser, tdType, tdName, tdSubject, tdStrategy, tdLog);
        frag.appendChild(tr);
    });
    tbody.appendChild(frag);

    const n = rows.length;
    rowCountEl.textContent = `${n} ${n===1?'entry':'entries'}`;
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
        tEl.style.color        = on ? '#a78bfa'               : 'rgba(148,163,184,.45)';
        tEl.style.borderBottom = on ? '2px solid #a78bfa'     : '2px solid transparent';
        tEl.style.textShadow   = on ? '0 0 8px rgba(139,92,246,.5)' : '';
        cEl.style.background   = on ? 'rgba(139,92,246,.14)'  : 'rgba(148,163,184,.08)';
        cEl.style.color        = on ? '#a78bfa'               : 'rgba(148,163,184,.45)';
        cEl.style.borderColor  = on ? 'rgba(139,92,246,.3)'   : 'rgba(148,163,184,.14)';
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
    const rows   = hiddenTypes.size > 0 ? sorted.filter(r => !hiddenTypes.has(r.activityType)) : sorted;
    console.log(`[filter] hiddenTypes: [${[...hiddenTypes].join(', ')}] → ${rows.length} rows visible`);
    renderTable(rows);
    updateTabUI();
    updateHeaderSortUI();
    updateFilterUI();
}

function renderActiveTab() {
    closeFilterDropdown();
    applyAndRender();
}

function updateFilterUI() {
    const icon = document.getElementById('typeFilterIcon');
    if (icon) icon.classList.toggle('filter-active', hiddenTypes.size > 0);
}

function closeFilterDropdown() {
    if (filterDropdown) { filterDropdown.remove(); filterDropdown = null; }
}

function toggleFilterDropdown(anchor) {
    if (filterDropdown) { closeFilterDropdown(); return; }

    const rows  = getActiveRows();
    const types = [...new Set(rows.map(r => r.activityType))].sort();
    if (!types.length) return;

    const dd = document.createElement('div');
    dd.style.cssText = 'position:fixed;z-index:9999;background:rgba(7,0,18,.97);border:1px solid rgba(139,92,246,.3);border-radius:10px;padding:6px 0;min-width:220px;box-shadow:0 8px 32px rgba(0,0,0,.55);backdrop-filter:blur(12px)';

    const hdr = document.createElement('div');
    hdr.style.cssText = 'padding:5px 12px 7px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:rgba(167,139,250,.45);border-bottom:1px solid rgba(139,92,246,.12);margin-bottom:2px;display:flex;align-items:center;justify-content:space-between';
    const hdrText  = document.createElement('span');
    hdrText.textContent = 'Filter by Type';
    const resetBtn = document.createElement('button');
    resetBtn.textContent = 'Show all';
    resetBtn.style.cssText = 'background:none;border:none;cursor:pointer;font-size:11px;color:rgba(167,139,250,.55);padding:0;font-family:inherit';
    resetBtn.onmouseover = () => resetBtn.style.color = '#a78bfa';
    resetBtn.onmouseout  = () => resetBtn.style.color = 'rgba(167,139,250,.55)';
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
    list.style.cssText = 'overflow-y:auto;max-height:260px;padding:2px 4px';
    types.forEach(type => {
        const lbl = document.createElement('label');
        lbl.style.cssText = 'display:flex;align-items:center;gap:8px;padding:5px 8px;cursor:pointer;border-radius:6px;font-size:12px;color:#ede9fe;transition:background .1s';
        lbl.onmouseover = () => lbl.style.background = 'rgba(139,92,246,.1)';
        lbl.onmouseout  = () => lbl.style.background = '';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = !hiddenTypes.has(type);
        cb.style.cssText = 'accent-color:#a78bfa;width:13px;height:13px;cursor:pointer;flex-shrink:0';
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
    return buildRows(sections, token, baseUrl, courseId, sessionCookie, fallbackUser, courseName, subject, groupIndex, onProgress);
}

function resetTable() {
    if (!snapshotAllData.length) return;
    allData     = [...snapshotAllData];
    teacherData = [...snapshotTeacherData];
    oerData     = [...snapshotOerData];
    hiddenTypes = new Set(snapshotHiddenTypes);
    sortCol     = null;
    sortDir     = 'asc';
    activeTab   = 'all';
    updateTabCounts();
    updateTabUI();
    updateFilterUI();
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

downloadBtn.addEventListener('click', () => {
    const sorted  = applyHeaderSort(getActiveRows());
    const rows    = hiddenTypes.size > 0 ? sorted.filter(r => !hiddenTypes.has(r.activityType)) : sorted;
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

document.getElementById('fetchBtn').addEventListener('click', async () => {
    const urlsRaw       = document.getElementById('courseUrl').value;
    const token         = document.getElementById('wsToken').value.trim();
    const sessionCookie = document.getElementById('sessionKey').value.trim();

    const urls = urlsRaw.split('\n').map(u => u.trim()).filter(Boolean);
    if (!urls.length) { setStatus('Please enter at least one course URL.', true); return; }
    if (!token)       { setStatus('Web service token is required.', true); return; }

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
    tableData   = [];
    allData     = [];
    teacherData = [];
    oerData     = [];
    sortCol     = null;
    sortDir     = 'asc';
    closeFilterDropdown();
    document.getElementById('corsNotice').style.display = 'none';
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:64px 20px;color:#94a3b8;font-size:13px;font-style:italic">Loading…</td></tr>`;
    rowCountEl.textContent = 'loading…';
    setDownloadDisabled(downloadBtn, true);
    document.getElementById('courseNameSection').style.display = 'none';
    setStatus(`Processing ${courseEntries.length} course(s)…`);

    await Promise.all([loadStrategies(), loadSubjects()]);
    progressWrap.style.display = 'block';
    setProgress(0, 1, 'Fetching course structure…');

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

        const modCounts  = metaList.map(m => m.sections.flatMap(s => s.modules || []).length);
        const totalMods  = modCounts.reduce((a, b) => a + b, 0);
        let   globalDone = 0;

        // Phase 2 — fetch logs sequentially with smooth global progress bar
        const allRows = [];
        for (let i = 0; i < N; i++) {
            const { baseUrl, courseId, courseName, sections, fallbackUser } = metaList[i];
            const subject      = getSubject(courseName || '');
            const courseModCnt = modCounts[i];
            const sliceStart   = totalMods > 0 ? globalDone / totalMods : i / N;
            const sliceEnd     = totalMods > 0 ? (globalDone + courseModCnt) / totalMods : (i + 1) / N;

            setStatus(`Course ${i + 1} / ${N} — fetching logs for "${courseName || courseId}"…`);
            const rows = await buildRows(
                sections, token, baseUrl, courseId, sessionCookie, fallbackUser,
                courseName, subject, i,
                (frac, label) => {
                    const pct = Math.round((sliceStart + frac * (sliceEnd - sliceStart)) * 100);
                    progressBar.style.width   = pct + '%';
                    progressPct.textContent   = pct + '%';
                    progressLabel.textContent = `Course ${i + 1}/${N}: ${label}`;
                }
            );
            globalDone += courseModCnt;
            allRows.push(...rows);
        }

        progressBar.style.width   = '100%';
        progressPct.textContent   = '100%';
        progressLabel.textContent = 'Done!';
        setTimeout(() => { progressWrap.style.display = 'none'; }, 1500);

        tableData   = allRows.filter(r => !isExcludedRow(r));
        allData     = [...tableData];
        teacherData = tableData.filter(r => r.modname !== 'url');
        oerData     = tableData.filter(r => r.modname === 'url');

        // Default type filter: hide "Text and Media Area" if present in data
        hiddenTypes = new Set();
        if (new Set(tableData.map(r => r.activityType)).has('Text and Media Area')) {
            hiddenTypes.add('Text and Media Area');
        }

        // Snapshot for Reset Table
        snapshotAllData     = [...allData];
        snapshotTeacherData = [...teacherData];
        snapshotOerData     = [...oerData];
        snapshotHiddenTypes = new Set(hiddenTypes);

        if (N === 1 && allRows.length > 0) {
            const nameEl = document.getElementById('courseNameDisplay');
            nameEl.textContent = allRows[0].courseName || `Course ${courseEntries[0].courseId}`;
            nameEl.href = `${courseEntries[0].baseUrl}/course/view.php?id=${courseEntries[0].courseId}`;
            document.getElementById('courseNameSection').style.display = 'block';
        }

        const logCount = tableData.filter(r => r.fromLog).length;
        setStatus(`Done. ${tableData.length} module(s) across ${N} course(s) — ${logCount} with confirmed log date.`);

        updateTabCounts();
        activeTab = 'all';
        renderActiveTab();

    } catch (err) {
        console.error(err);
        progressWrap.style.display = 'none';
        let msg = err.message;
        if (msg.includes('Invalid token') || msg.includes('Access control')) msg = 'Invalid token or insufficient permissions.';
        else if (msg.includes('Course not found')) msg = 'Course not found — check the course ID.';
        setStatus(msg, true);
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:64px 20px;color:#ef4444;font-size:13px;font-style:italic">${escapeHtml(msg)}</td></tr>`;
    }
});
