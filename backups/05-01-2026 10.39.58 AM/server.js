/**
 * Local CORS proxy for Moodle Activity Report
 * Serves index.html and proxies all requests to Moodle (including session cookies).
 *
 * Run:        node server.js
 * Then open:  http://localhost:8080
 *
 * No npm packages needed — uses only Node.js built-ins.
 */
const http  = require('http');
const https = require('https');
const fs    = require('fs');
const path  = require('path');
const url   = require('url');

const PORT = 8080;
const HTML = path.join(__dirname, 'index.html');
const STRATEGIES_FILE = path.join(__dirname, 'data', 'strategies.json');
const SUBJECTS_FILE   = path.join(__dirname, 'data', 'subjects.json');

const DEFAULT_STRATEGIES = [
    { "name": "assessment-assisted discussion", "keywords": ["assessment-assisted"], "isDefault": true },
    { "name": "collaborative learning",         "keywords": ["collaborative"], "isDefault": true },
    { "name": "content discussion",             "keywords": ["content discussion"], "isDefault": true },
    { "name": "drill/practice/exercise",        "keywords": ["drill", "practice", "exercise"], "isDefault": true },
    { "name": "election",                       "keywords": ["election"], "isDefault": true },
    { "name": "enrichment",                     "keywords": ["enrichment"], "isDefault": true },
    { "name": "entrance exam",                  "keywords": ["entrance exam", "entrance"], "isDefault": true },
    { "name": "evaluation - student",           "keywords": ["evaluation student"], "isDefault": true },
    { "name": "evaluation - student services",  "keywords": ["evaluation student services"], "isDefault": true },
    { "name": "evaluation - teacher",           "keywords": ["evaluation teacher"], "isDefault": true },
    { "name": "evaluation - parents",           "keywords": ["evaluation parents"], "isDefault": true },
    { "name": "family day",                     "keywords": ["family day"], "isDefault": true },
    { "name": "focus group discussion",         "keywords": ["focus group", "fgd"], "isDefault": true },
    { "name": "formative assessment",           "keywords": ["formative"], "isDefault": true },
    { "name": "game",                           "keywords": ["game"], "isDefault": true },
    { "name": "interactive lecture demonstration", "keywords": ["interactive lecture", "ild"], "isDefault": true },
    { "name": "listening activity",             "keywords": ["listening"], "isDefault": true },
    { "name": "motivation",                     "keywords": ["motivation"], "isDefault": true },
    { "name": "peer assessment",                "keywords": ["peer assessment", "peer"], "isDefault": true },
    { "name": "performance task",               "keywords": ["performance task", "pt"], "isDefault": true },
    { "name": "Playground",                     "keywords": ["playground"], "isDefault": true },
    { "name": "post-assessment",                "keywords": ["post-assessment", "post assessment", "posttest"], "isDefault": true },
    { "name": "pre-assessment",                 "keywords": ["pre-assessment", "pre assessment", "pretest"], "isDefault": true },
    { "name": "project presentation",           "keywords": ["project presentation", "project"], "isDefault": true },
    { "name": "quiz bee",                       "keywords": ["quiz bee"], "isDefault": true },
    { "name": "reading activity",               "keywords": ["reading"], "isDefault": true },
    { "name": "reference material",             "keywords": ["reference"], "isDefault": true },
    { "name": "remediation",                    "keywords": ["remediation"], "isDefault": true },
    { "name": "research",                       "keywords": ["research"], "isDefault": true },
    { "name": "reviewer",                       "keywords": ["reviewer"], "isDefault": true },
    { "name": "self-assessment",                "keywords": ["self-assessment", "self assessment"], "isDefault": true },
    { "name": "speaking activity",              "keywords": ["speaking"], "isDefault": true },
    { "name": "sports fest",                    "keywords": ["sports fest", "sports"], "isDefault": true },
    { "name": "stakeholders engagement",        "keywords": ["stakeholders"], "isDefault": true },
    { "name": "summative assessment",           "keywords": ["summative"], "isDefault": true },
    { "name": "synchronous discussion",         "keywords": ["synchronous"], "isDefault": true },
    { "name": "tutorial",                       "keywords": ["tutorial"], "isDefault": true },
    { "name": "viewing activity",               "keywords": ["viewing"], "isDefault": true },
    { "name": "lab activity",                   "keywords": ["lab"], "isDefault": true },
    { "name": "writing activity",               "keywords": ["writing"], "isDefault": true },
    { "name": "file upload and monitoring sheet", "keywords": ["monitoring sheet", "file upload"], "isDefault": true },
    { "name": "periodic test",                  "keywords": ["periodic test", "periodic"], "isDefault": true },
    { "name": "summary of scores",              "keywords": ["summary of scores", "summary"], "isDefault": true }
];

const DEFAULT_SUBJECTS = [
    { "name": "Christian Living and Values Education", "keywords": ["Christian Living", "Values Education", "CLE"], "isDefault": true },
    { "name": "Computer",      "keywords": ["Computer", "ICT", "Programming"],                "isDefault": true },
    { "name": "English",       "keywords": ["English", "Reading"],                            "isDefault": true },
    { "name": "Filipino",      "keywords": ["Filipino", "Tagalog"],                           "isDefault": true },
    { "name": "MAPEH",         "keywords": ["MAPEH", "Music", "Arts", "PE", "Health"],        "isDefault": true },
    { "name": "Mathematics",   "keywords": ["Math", "Mathematics", "Algebra", "Geometry"],    "isDefault": true },
    { "name": "Science",       "keywords": ["Science", "Physics", "Chemistry", "Biology"],    "isDefault": true },
    { "name": "Social Studies","keywords": ["Social Studies", "History", "Geography"],         "isDefault": true },
    { "name": "TLE",           "keywords": ["TLE", "Technology", "Livelihood"],               "isDefault": true }
];

// Ensure data/ dir and seed files exist on startup
fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
if (!fs.existsSync(STRATEGIES_FILE)) {
    fs.writeFileSync(STRATEGIES_FILE, JSON.stringify(DEFAULT_STRATEGIES, null, 2), 'utf8');
}
if (!fs.existsSync(SUBJECTS_FILE)) {
    fs.writeFileSync(SUBJECTS_FILE, JSON.stringify(DEFAULT_SUBJECTS, null, 2), 'utf8');
}

const CORS = {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Accept, Content-Type, Cookie',
};

function proxyTo(targetUrl, cookie, acceptHeader, res) {
    let parsed;
    try { parsed = url.parse(targetUrl); }
    catch { res.writeHead(400, CORS); res.end(JSON.stringify({ error: 'Bad URL' })); return; }

    const proto = parsed.protocol === 'https:' ? https : http;
    const reqHeaders = {
        'Accept':     acceptHeader || 'application/json',
        'User-Agent': 'Mozilla/5.0 MoodleReportProxy/1.0',
    };
    if (cookie) reqHeaders['Cookie'] = cookie.startsWith('MoodleSession=')
        ? cookie : `MoodleSession=${cookie}`;

    const options = {
        hostname: parsed.hostname,
        port:     parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path:     parsed.path,
        method:   'GET',
        headers:  reqHeaders,
    };

    const req = proto.request(options, upstream => {
        // Detect content type from upstream
        const ct = upstream.headers['content-type'] || 'application/octet-stream';
        res.writeHead(upstream.statusCode, { ...CORS, 'Content-Type': ct });
        upstream.pipe(res);
    });
    req.on('error', err => {
        res.writeHead(502, CORS);
        res.end(JSON.stringify({ error: err.message }));
    });
    req.end();
}

http.createServer((req, res) => {
    const parsed = url.parse(req.url, true);

    if (req.method === 'OPTIONS') {
        res.writeHead(204, CORS); res.end(); return;
    }

    // GET /strategies — return saved strategies list
    if (req.method === 'GET' && parsed.pathname === '/strategies') {
        try {
            const data = JSON.parse(fs.readFileSync(STRATEGIES_FILE, 'utf8'));
            res.writeHead(200, { ...CORS, 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ strategies: data }));
        } catch {
            res.writeHead(500, { ...CORS, 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Failed to read strategies' }));
        }
        return;
    }

    // GET /subjects
    if (req.method === 'GET' && parsed.pathname === '/subjects') {
        try {
            const data = JSON.parse(fs.readFileSync(SUBJECTS_FILE, 'utf8'));
            res.writeHead(200, { ...CORS, 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ subjects: data }));
        } catch {
            res.writeHead(500, { ...CORS, 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Failed to read subjects' }));
        }
        return;
    }

    // POST /subjects
    if (req.method === 'POST' && parsed.pathname === '/subjects') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                const payload = JSON.parse(body);
                if (!payload || !Array.isArray(payload.subjects) || payload.subjects.length === 0) {
                    res.writeHead(400, { ...CORS, 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Invalid payload' }));
                    return;
                }
                fs.writeFileSync(SUBJECTS_FILE, JSON.stringify(payload.subjects, null, 2), 'utf8');
                res.writeHead(200, { ...CORS, 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true }));
            } catch {
                res.writeHead(500, { ...CORS, 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Failed to save subjects' }));
            }
        });
        req.on('error', () => {
            res.writeHead(500, { ...CORS, 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Failed to save subjects' }));
        });
        return;
    }

    // POST /strategies — persist updated strategies list
    if (req.method === 'POST' && parsed.pathname === '/strategies') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                const payload = JSON.parse(body);
                if (!payload || !Array.isArray(payload.strategies) || payload.strategies.length === 0) {
                    res.writeHead(400, { ...CORS, 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Invalid payload' }));
                    return;
                }
                fs.writeFileSync(STRATEGIES_FILE, JSON.stringify(payload.strategies, null, 2), 'utf8');
                res.writeHead(200, { ...CORS, 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true }));
            } catch {
                res.writeHead(500, { ...CORS, 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Failed to save strategies' }));
            }
        });
        req.on('error', () => {
            res.writeHead(500, { ...CORS, 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Failed to save strategies' }));
        });
        return;
    }

    // /proxy?url=<encoded-moodle-url>[&cookie=<session-cookie>][&accept=<header>]
    if (parsed.pathname === '/proxy') {
        const target = parsed.query.url;
        if (!target) {
            res.writeHead(400, CORS);
            res.end(JSON.stringify({ error: 'Missing ?url= parameter' }));
            return;
        }
        const cookie = parsed.query.cookie || '';
        const accept = parsed.query.accept  || 'application/json';
        proxyTo(target, cookie, accept, res);
        return;
    }

    // Serve static files (output.css, app.js) or fall back to index.html
    const MIME = {
        '.css': 'text/css; charset=utf-8',
        '.js':  'application/javascript; charset=utf-8',
    };
    const staticPath = path.join(__dirname, parsed.pathname);
    const ext = path.extname(staticPath);
    if (MIME[ext] && fs.existsSync(staticPath)) {
        fs.readFile(staticPath, (err, data) => {
            if (err) { res.writeHead(404, CORS); res.end('Not found'); return; }
            res.writeHead(200, { ...CORS, 'Content-Type': MIME[ext] });
            res.end(data);
        });
        return;
    }
    fs.readFile(HTML, (err, data) => {
        if (err) { res.writeHead(404); res.end('index.html not found in: ' + __dirname); return; }
        res.writeHead(200, { ...CORS, 'Content-Type': 'text/html; charset=utf-8' });
        res.end(data);
    });

}).listen(PORT, '127.0.0.1', () => {
    console.log('');
    console.log('  Moodle Activity Report — Local Server');
    console.log('  ======================================');
    console.log(`  Open:  http://localhost:${PORT}`);
    console.log('  Stop:  Ctrl+C');
    console.log('');
});
