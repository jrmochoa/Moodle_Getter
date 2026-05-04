const https = require('https');
const http  = require('http');
const url   = require('url');

const CORS = {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Accept, Content-Type, Cookie',
};

module.exports = function handler(req, res) {
    if (req.method === 'OPTIONS') {
        res.writeHead(204, CORS);
        res.end();
        return;
    }

    const { url: target, accept, cookie } = req.query;
    if (!target) {
        res.writeHead(400, { ...CORS, 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'url required' }));
        return;
    }

    let parsed;
    try { parsed = url.parse(target); }
    catch {
        res.writeHead(400, { ...CORS, 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Bad URL' }));
        return;
    }

    const proto = parsed.protocol === 'https:' ? https : http;
    const reqHeaders = {
        'Accept':     accept || 'application/json',
        'User-Agent': 'Mozilla/5.0',
    };
    if (cookie) reqHeaders['Cookie'] = cookie.startsWith('MoodleSession=')
        ? cookie : `MoodleSession=${cookie}`;

    // Forward client IP so Moodle's reverse-proxy-aware session check passes
    const clientIp = req.headers['x-forwarded-for'] || req.headers['x-real-ip'];
    if (clientIp) reqHeaders['X-Forwarded-For'] = clientIp.split(',')[0].trim();

    const options = {
        hostname: parsed.hostname,
        port:     parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path:     parsed.path,
        method:   'GET',
        headers:  reqHeaders,
    };

    const upReq = proto.request(options, upRes => {
        const ct = upRes.headers['content-type'] || 'application/octet-stream';
        const chunks = [];
        upRes.on('data', chunk => chunks.push(chunk));
        upRes.on('end', () => {
            const body = Buffer.concat(chunks);
            res.writeHead(upRes.statusCode, { ...CORS, 'Content-Type': ct });
            res.end(body);
        });
    });
    upReq.on('error', err => {
        if (!res.headersSent) {
            res.writeHead(502, { ...CORS, 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
        }
    });
    upReq.end();
};
