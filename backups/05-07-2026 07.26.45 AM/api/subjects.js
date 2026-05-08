const fs   = require('fs');
const path = require('path');

const CORS = {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Accept, Content-Type',
};

const FILE = path.join(__dirname, '..', 'data', 'subjects.json');

module.exports = function handler(req, res) {
    Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
    if (req.method === 'OPTIONS') { res.status(204).end(); return; }

    try {
        const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
        res.status(200).json({ subjects: data });
    } catch {
        res.status(500).json({ error: 'Failed to read subjects' });
    }
};
