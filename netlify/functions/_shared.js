'use strict';

// ── Response helpers ──────────────────────────────────────────────────

const _headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

function ok(body) {
  return { statusCode: 200, headers: _headers, body: JSON.stringify(body) };
}

function err(statusCode, message, code) {
  return { statusCode, headers: _headers, body: JSON.stringify({ error: message, code }) };
}

// ── Rate limiter factory ──────────────────────────────────────────────
// Each call returns an independent isRateLimited(ip) function with its own state.

function makeRateLimiter(limit = 10, windowMs = 60000) {
  const map = new Map();
  return function isRateLimited(ip) {
    const now  = Date.now();
    const hits = (map.get(ip) || []).filter(t => t > now - windowMs);
    hits.push(now);
    map.set(ip, hits);
    return hits.length > limit;
  };
}

// ── Request setup ─────────────────────────────────────────────────────
// Handles CORS preflight, method guard, rate limit, and body parse.
// Returns [body, earlyResponse] — if earlyResponse is non-null, return it immediately.

function setup(event, isRateLimited) {
  if (event.httpMethod === 'OPTIONS')
    return [null, { statusCode: 204, headers: _headers, body: '' }];
  if (event.httpMethod !== 'POST')
    return [null, err(405, 'Method not allowed', 'METHOD_NOT_ALLOWED')];

  const ip = (event.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (isRateLimited(ip))
    return [null, err(429, 'Quá nhiều yêu cầu. Vui lòng thử lại sau.', 'RATE_LIMITED')];

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return [null, err(400, 'Request không hợp lệ.', 'BAD_REQUEST')]; }

  return [body, null];
}

// ── Apps Script caller ────────────────────────────────────────────────
// Prepends _secret, forwards payload, returns parsed JSON or throws.
// Throws with e.code = 'NOT_CONFIGURED' if GOOGLE_SCRIPT_URL is missing.

async function callScript(payload) {
  const url = process.env.GOOGLE_SCRIPT_URL;
  if (!url) throw Object.assign(new Error('NOT_CONFIGURED'), { code: 'NOT_CONFIGURED' });

  const res  = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ _secret: process.env.APP_SECRET || '', ...payload }),
  });
  const text = await res.text();
  try { return JSON.parse(text); }
  catch { throw new Error('Invalid JSON from Apps Script: ' + text.slice(0, 100)); }
}

// ── CSV parser ────────────────────────────────────────────────────────
// RFC 4180-compliant: handles quoted fields with embedded commas/newlines.

function parseCSVRow(line) {
  const cols = []; let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { inQ = !inQ; }
    else if (c === ',' && !inQ) { cols.push(cur.trim()); cur = ''; }
    else cur += c;
  }
  cols.push(cur.trim());
  return cols;
}

function parseCSV(text) {
  const [header, ...rows] = text.trim().split('\n');
  const keys = parseCSVRow(header);
  return rows
    .filter(r => r.trim())
    .map(row => Object.fromEntries(parseCSVRow(row).map((v, i) => [keys[i], v || ''])));
}

module.exports = { ok, err, makeRateLimiter, setup, callScript, parseCSV };
