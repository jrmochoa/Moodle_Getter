#!/usr/bin/env node
/**
 * Claude Code Stop hook — project backup
 * Triggered once when Claude finishes responding.
 * Creates a timestamped snapshot in <project>/backups/.
 */

const fs   = require('fs');
const path = require('path');

// Use Claude's injected env var, fallback to relative path
const PROJECT_ROOT = process.env.CLAUDE_PROJECT_DIR || path.resolve(__dirname, '..', '..');
const BACKUPS_DIR  = path.join(PROJECT_ROOT, 'backups');

// Drain stdin (Claude Code always sends JSON; we don't need to inspect it)
let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { raw += chunk; });
process.stdin.on('end', () => {
    try { run(); } catch (err) {
        process.stderr.write(`[backup] ERROR: ${err.message}\n`);
        process.exit(0); // non-fatal — never block Claude
    }
});

// Top-level directories to exclude from every backup
const SKIP_NAMES = new Set(['backups', '.git', 'node_modules', '.claude']);

// Cooldown to avoid duplicate backups (30 seconds)
const COOLDOWN_FILE = path.join(BACKUPS_DIR, '.last_backup');
const COOLDOWN_MS   = 30_000;

function run() {
    // ── Cooldown check ────────────────────────────────────────────────────────
    if (fs.existsSync(COOLDOWN_FILE)) {
        const last = parseInt(fs.readFileSync(COOLDOWN_FILE, 'utf8'), 10);
        if (Date.now() - last < COOLDOWN_MS) {
            process.stderr.write('[backup] Skipped — cooldown active\n');
            process.exit(0);
        }
    }

    // ── Timestamp: MM-DD-YYYY hh.mm.ss AM/PM ─────────────────────────────────
    const now  = new Date();
    const mm   = pad(now.getMonth() + 1);
    const dd   = pad(now.getDate());
    const yyyy = now.getFullYear();
    const rawH = now.getHours();
    const ampm = rawH >= 12 ? 'PM' : 'AM';
    const hh   = pad(rawH % 12 || 12);
    const min  = pad(now.getMinutes());
    const ss   = pad(now.getSeconds());
    const timestamp = `${mm}-${dd}-${yyyy} ${hh}.${min}.${ss} ${ampm}`;

    const dest = path.join(BACKUPS_DIR, timestamp);

    fs.mkdirSync(dest, { recursive: true });
    copyDir(PROJECT_ROOT, dest, true);

    // Update cooldown timestamp
    fs.writeFileSync(COOLDOWN_FILE, String(Date.now()));

    process.stderr.write(`[backup] Saved → backups/${timestamp}\n`);
    process.exit(0);
}

function pad(n) { return String(n).padStart(2, '0'); }

/**
 * Recursively copy src → dst.
 * Skips SKIP_NAMES at every level (not just top level).
 */
function copyDir(src, dst) {
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
        if (SKIP_NAMES.has(entry.name)) continue;  // skip at every level
        const srcPath = path.join(src, entry.name);
        const dstPath = path.join(dst, entry.name);
        if (entry.isDirectory()) {
            fs.mkdirSync(dstPath, { recursive: true });
            copyDir(srcPath, dstPath);
        } else if (entry.isFile()) {
            fs.copyFileSync(srcPath, dstPath);
        }
    }
}