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
