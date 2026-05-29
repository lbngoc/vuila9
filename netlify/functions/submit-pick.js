'use strict';

// ── Rate limiter ───────────────────────────────────────────────────────
const rateLimitMap = new Map();
const RATE_LIMIT   = 10;
const RATE_WINDOW  = 60000;

function isRateLimited(ip) {
  const now   = Date.now();
  const floor = now - RATE_WINDOW;
  const hits  = (rateLimitMap.get(ip) || []).filter(t => t > floor);
  hits.push(now);
  rateLimitMap.set(ip, hits);
  return hits.length > RATE_LIMIT;
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
  if (isRateLimited(ip)) return err(429, 'Quá nhiều yêu cầu. Vui lòng chờ 1 phút.', 'RATE_LIMITED');

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return err(400, 'Request không hợp lệ.', 'BAD_REQUEST'); }

  if (body.website) return ok({ success: true, bet_id: 'ignored' });

  const { fixture_id, pick_type, username, _session_hash } = body;

  // Format validation only — auth and business logic handled by Apps Script
  if (!fixture_id || !pick_type || !username)
    return err(400, 'Thiếu thông tin bắt buộc.', 'MISSING_FIELDS');
  if (!/^[a-zA-Z0-9]{2,5}-[a-zA-Z0-9]{2,5}$/.test(fixture_id))
    return err(400, 'fixture_id không hợp lệ.', 'INVALID_FIXTURE_ID');
  if (!_session_hash)
    return err(400, 'Thiếu thông tin xác thực.', 'MISSING_AUTH');
  if (!['home', 'draw', 'away'].includes(pick_type))
    return err(400, 'Loại dự đoán không hợp lệ.', 'INVALID_PICK_TYPE');

  const scriptUrl = process.env.GOOGLE_SCRIPT_URL;
  if (!scriptUrl) return err(503, 'Hệ thống chưa được cấu hình. Liên hệ admin.', 'NOT_CONFIGURED');

  const payload = {
    _secret:       process.env.APP_SECRET || '',
    username:      username.toLowerCase().trim(),
    fixture_id,
    pick_type,
    _session_hash,
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
    catch { throw new Error('Invalid JSON from Apps Script: ' + text.slice(0, 100)); }

    if (!data.success) {
      return err(data.status || 400, data.error || 'Lỗi không xác định.', data.code || 'SCRIPT_ERROR');
    }
    return ok({ success: true, bet_id: data.bet_id, updated: data.updated || false });

  } catch (e) {
    console.error('Apps Script error:', e.message);
    return err(502, 'Không thể lưu dự đoán. Vui lòng thử lại.', 'SCRIPT_ERROR');
  }
};
