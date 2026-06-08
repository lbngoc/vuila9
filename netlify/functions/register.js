'use strict';
const crypto = require('crypto');

function hashPasscode(username, passcode) {
  return crypto.createHash('sha256').update(username + passcode).digest('hex');
}

// Pre-check duplicate username from live Sheet CSV (fast fail, not authoritative)
async function checkUsernameTaken(username) {
  const id  = process.env.GOOGLE_SHEET_ID;
  const gid = process.env.USERS_GID;
  if (!id || !gid) return false; // skip if not configured — Apps Script does authoritative check
  try {
    const url = `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`;
    const res  = await fetch(url, { signal: AbortSignal.timeout(3000) });
    const text = await res.text();
    return text.trim().split('\n').slice(1).some(row => {
      // RFC 4180: parse quoted fields so display_name with commas doesn't shift columns
      const cols = []; let cur = '', inQ = false;
      for (const ch of row) {
        if (ch === '"') { inQ = !inQ; }
        else if (ch === ',' && !inQ) { cols.push(cur.trim()); cur = ''; }
        else cur += ch;
      }
      cols.push(cur.trim());
      return cols[1]?.toLowerCase() === username.toLowerCase();
    });
  } catch {
    return false; // timeout or error → skip, let Apps Script handle
  }
}

// ── Rate limiter ───────────────────────────────────────────────────────
const rateLimitMap = new Map();
function isRateLimited(ip) {
  const now  = Date.now();
  const hits = (rateLimitMap.get(ip) || []).filter(t => t > now - 60000);
  hits.push(now);
  rateLimitMap.set(ip, hits);
  return hits.length > 5;
}

// ── Response helpers ───────────────────────────────────────────────────
const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
function ok(body)  { return { statusCode: 200, headers, body: JSON.stringify(body) }; }
function err(code, message, errorCode) {
  return { statusCode: code, headers, body: JSON.stringify({ error: message, code: errorCode }) };
}

// ── Handler ────────────────────────────────────────────────────────────
exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST')   return err(405, 'Method not allowed', 'METHOD_NOT_ALLOWED');

  const ip = (event.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (isRateLimited(ip)) return err(429, 'Quá nhiều yêu cầu.', 'RATE_LIMITED');

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return err(400, 'Request không hợp lệ.', 'BAD_REQUEST'); }

  if (body.website) return ok({ success: true });

  const { username, display_name, passcode } = body;

  if (!username || !display_name || !passcode)
    return err(400, 'Thiếu thông tin bắt buộc.', 'MISSING_FIELDS');

  const u = String(username).trim();
  if (!/^[a-zA-Z][a-zA-Z0-9_]{2,19}$/.test(u))
    return err(400, 'Username phải bắt đầu bằng chữ cái, chỉ dùng chữ cái, số, gạch dưới (3–20 ký tự).', 'INVALID_USERNAME');

  const p = String(passcode).trim();
  if (p.length < 6)
    return err(400, 'Passcode phải có ít nhất 6 ký tự.', 'PASSCODE_TOO_SHORT');

  if (await checkUsernameTaken(u))
    return err(400, 'Username đã được sử dụng.', 'DUPLICATE_USERNAME');

  const scriptUrl = process.env.GOOGLE_SCRIPT_URL;
  if (!scriptUrl) return err(503, 'Hệ thống chưa được cấu hình.', 'NOT_CONFIGURED');

  const payload = {
    _secret:       process.env.APP_SECRET || '',
    action:        'register',
    username:      u,
    display_name:  display_name.trim(),
    passcode_hash: hashPasscode(u, p),
    created_at:    new Date().toISOString(),
  };

  try {
    const res  = await fetch(scriptUrl, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); }
    catch { throw new Error('Invalid JSON: ' + text.slice(0, 100)); }

    if (!data.success) {
      if (data.code === 'DUPLICATE_USERNAME')
        return err(400, 'Username đã được sử dụng.', 'DUPLICATE_USERNAME');
      throw new Error(data.error || 'Apps Script failure');
    }
    // Pass through status so frontend can show the correct post-register message
    return ok({ success: true, status: data.status || 'inactive' });

  } catch (e) {
    console.error('Register error:', e.message);
    return err(502, 'Không thể hoàn tất đăng ký. Vui lòng thử lại.', 'SCRIPT_ERROR');
  }
};
