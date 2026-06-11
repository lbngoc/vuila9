'use strict';

const rateLimitMap = new Map();
const RATE_LIMIT   = 5;
const RATE_WINDOW  = 60000;

function isRateLimited(ip) {
  const now   = Date.now();
  const floor = now - RATE_WINDOW;
  const hits  = (rateLimitMap.get(ip) || []).filter(t => t > floor);
  hits.push(now);
  rateLimitMap.set(ip, hits);
  return hits.length > RATE_LIMIT;
}

const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
function ok(body)  { return { statusCode: 200, headers, body: JSON.stringify(body) }; }
function err(code, message, errorCode) {
  return { statusCode: code, headers, body: JSON.stringify({ error: message, code: errorCode }) };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST')   return err(405, 'Method not allowed', 'METHOD_NOT_ALLOWED');

  const ip = (event.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (isRateLimited(ip)) return err(429, 'Quá nhiều yêu cầu. Vui lòng chờ 1 phút.', 'RATE_LIMITED');

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return err(400, 'Request không hợp lệ.', 'BAD_REQUEST'); }

  if (body.website) return ok({ success: true });

  const { username, _session_hash, display_name } = body;

  if (!username || !_session_hash || !display_name)
    return err(400, 'Thiếu thông tin bắt buộc.', 'MISSING_FIELDS');

  const name = display_name.trim();
  if (!name)        return err(400, 'Tên hiển thị không được để trống.', 'INVALID_DISPLAY_NAME');
  if (name.length > 50) return err(400, 'Tên hiển thị tối đa 50 ký tự.', 'INVALID_DISPLAY_NAME');

  const scriptUrl = process.env.GOOGLE_SCRIPT_URL;
  if (!scriptUrl) return err(503, 'Hệ thống chưa được cấu hình. Liên hệ admin.', 'NOT_CONFIGURED');

  const payload = {
    _secret:       process.env.APP_SECRET || '',
    action:        'update_display_name',
    username:      username.toLowerCase().trim(),
    _session_hash,
    display_name:  name,
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

    if (!data.success)
      return err(data.status || 400, data.error || 'Lỗi không xác định.', data.code || 'SCRIPT_ERROR');
    return ok({ success: true });

  } catch (e) {
    console.error('Apps Script error:', e.message);
    return err(502, 'Không thể cập nhật. Vui lòng thử lại.', 'SCRIPT_ERROR');
  }
};
