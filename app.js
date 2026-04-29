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

function setStatus(msg, isError=false) {
    statusDiv.textContent = msg;
    statusDiv.className = isError
        ? 'mt-4 px-4 py-3 rounded-xl border-l-4 border-red-500 bg-red-50 text-sm text-red-700'
        : 'mt-4 px-4 py-3 rounded-xl border-l-4 border-sky-500 bg-slate-100 text-sm text-slate-700';
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
            document.getElementById('corsNotice').classList.remove('hidden');
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
    progressWrap.classList.remove('hidden');
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
            modname:      mod.modname         || '',
            courseIndex:  i,
            logUrl:       buildLogUrl(baseUrl, courseId, mod.id),
        };
    });

    setProgress(total, total, 'Done!');
    setTimeout(() => progressWrap.classList.add('hidden'), 1500);
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
    tbody.innerHTML = '';
    if (!rows?.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center py-14 text-slate-400 italic">No activities found.</td></tr>';
        rowCountEl.textContent = '0 entries';
        return;
    }

    const frag = document.createDocumentFragment();
    rows.forEach((row, idx) => {
        const tr = document.createElement('tr');
        tr.className = 'border-b border-slate-100 hover:bg-sky-50 transition-colors';

        const tdNum = document.createElement('td');
        tdNum.className = 'px-4 py-3 text-slate-400 text-xs font-mono';
        tdNum.textContent = idx + 1;

        const tdDate = document.createElement('td');
        tdDate.className = 'px-4 py-3 whitespace-nowrap';
        const badge = row.fromLog
            ? `<span class="ml-1.5 text-[10px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded-full">LOG</span>`
            : `<span class="ml-1.5 text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded-full" title="Could not read log page — using mod.added">EST</span>`;
        tdDate.innerHTML = `<span class="font-mono text-xs bg-slate-100 text-slate-700 px-2.5 py-1 rounded-lg font-semibold">${escapeHtml(row.date)}</span>${badge}`;

        const tdUser = document.createElement('td');
        tdUser.className = 'px-4 py-3';
        tdUser.innerHTML = row.profileUrl
            ? `<a href="${escapeHtml(row.profileUrl)}" target="_blank" rel="noopener" class="text-sky-700 font-semibold hover:text-sky-900 hover:underline">${escapeHtml(row.fullname)}</a>`
            : `<span class="text-slate-600">${escapeHtml(row.fullname)}</span>`;

        const tdName = document.createElement('td');
        tdName.className = 'px-4 py-3';
        tdName.innerHTML = row.activityUrl
            ? `<a href="${escapeHtml(row.activityUrl)}" target="_blank" rel="noopener" class="text-violet-700 font-semibold hover:text-violet-900 hover:underline">${escapeHtml(row.activityName)}</a>`
            : `<span class="text-slate-700 font-medium">${escapeHtml(row.activityName)}</span>`;

        const tdType = document.createElement('td');
        tdType.className = 'px-4 py-3';
        tdType.innerHTML = `<span class="text-xs font-semibold bg-sky-50 text-sky-800 border border-sky-200 px-3 py-1 rounded-full">${escapeHtml(row.activityType)}</span>`;

        const tdLog = document.createElement('td');
        tdLog.className = 'px-4 py-3 text-center';
        tdLog.innerHTML = `<a href="${escapeHtml(row.logUrl)}" target="_blank" rel="noopener"
            class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-sky-700 text-white text-xs font-bold rounded-full transition-colors whitespace-nowrap">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round"
                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
            </svg>
            View Logs
        </a>`;

        tr.append(tdNum, tdDate, tdUser, tdName, tdType, tdLog);
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

    const BASE = 'flex items-center gap-2 px-6 py-3 text-sm font-semibold';

    if (activeTab === 'teachers') {
        tTeachers.className = `${BASE} text-sky-700`;
        tTeachers.style.borderBottom = '2px solid #0284c7';
        cTeachers.className = 'bg-sky-100 text-sky-700 text-xs px-2 py-0.5 rounded-full font-bold';

        tOer.className = `${BASE} text-slate-400`;
        tOer.style.borderBottom = '2px solid transparent';
        cOer.className = 'bg-slate-100 text-slate-400 text-xs px-2 py-0.5 rounded-full font-bold';
    } else {
        tOer.className = `${BASE} text-sky-700`;
        tOer.style.borderBottom = '2px solid #0284c7';
        cOer.className = 'bg-sky-100 text-sky-700 text-xs px-2 py-0.5 rounded-full font-bold';

        tTeachers.className = `${BASE} text-slate-400`;
        tTeachers.style.borderBottom = '2px solid transparent';
        cTeachers.className = 'bg-slate-100 text-slate-400 text-xs px-2 py-0.5 rounded-full font-bold';
    }

    // download button reflects the active tab's data availability
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
    return m ? `${m[1]} - ` : '';
}

function exportCSV(rows, filename, label = '') {
    if (!rows.length) { setStatus('Nothing to export.', true); return; }
    const prefix = coursePrefix(currentCourseName);
    const hdr  = ['Date', 'Created By', 'Activity Name', 'Activity Type'];
    const body = rows.map(r => [
        r.date,
        r.fullname,
        prefix + r.activityName,
        r.activityType,
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

document.getElementById('fetchBtn').addEventListener('click', async () => {
    const rawUrl        = document.getElementById('moodleUrl').value.trim();
    const token         = document.getElementById('wsToken').value.trim();
    const courseId      = parseInt(document.getElementById('courseId').value.trim(), 10);
    const sessionCookie = document.getElementById('sessionKey').value.trim();

    if (!rawUrl)                          { setStatus('Please enter your Moodle site URL.', true); return; }
    if (!token)                           { setStatus('Web service token is required.', true); return; }
    if (isNaN(courseId) || courseId <= 0) { setStatus('Please enter a valid numeric Course ID.', true); return; }

    const baseUrl = rawUrl.endsWith('/') ? rawUrl.slice(0, -1) : rawUrl;
    currentCourseId = courseId;

    document.getElementById('corsNotice').classList.add('hidden');
    tbody.innerHTML = '<tr><td colspan="6" class="text-center py-14 text-slate-400 italic">Loading…</td></tr>';
    rowCountEl.textContent = 'loading…';
    setDownloadDisabled(downloadBtn, true);
    document.getElementById('courseNameSection').classList.add('hidden');
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
        document.getElementById('courseNameSection').classList.remove('hidden');

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
        tbody.innerHTML = `<tr><td colspan="6" class="text-center py-14 text-red-500 italic">${escapeHtml(msg)}</td></tr>`;
    }
});
