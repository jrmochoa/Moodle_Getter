const https = require('https');
const http  = require('http');
const url   = require('url');

const CORS = {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Accept, Content-Type, Cookie',
};

module.exports = function handler(req, res) {
    Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));

    if (req.method === 'OPTIONS') { res.status(204).end(); return; }

    const { url: target, accept, cookie } = req.query;
    if (!target) { res.status(400).json({ error: 'url required' }); return; }

    let parsed;
    try { parsed = url.parse(target); }
    catch { res.status(400).json({ error: 'Bad URL' }); return; }

    const proto = parsed.protocol === 'https:' ? https : http;
    const reqHeaders = {
        'Accept':     accept || 'application/json',
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

    const upstream = proto.request(options, upRes => {
        const ct = upRes.headers['content-type'] || 'application/octet-stream';
        res.setHeader('Content-Type', ct);
        res.status(upRes.statusCode);
        upRes.pipe(res);
    });
    upstream.on('error', err => res.status(502).json({ error: err.message }));
    upstream.end();
};
