'use strict';
const { ok, err, makeRateLimiter, parseCSV } = require('./_shared');

const isRateLimited = makeRateLimiter(60);

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, body: '' };
  if (event.httpMethod !== 'GET')     return err(405, 'Method not allowed', 'METHOD_NOT_ALLOWED');

  const ip = (event.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (isRateLimited(ip)) return err(429, 'Quá nhiều yêu cầu. Vui lòng thử lại sau.', 'RATE_LIMITED');

  const { GOOGLE_SHEET_ID, PICKS_GID } = process.env;
  if (!GOOGLE_SHEET_ID || !PICKS_GID) return err(503, 'Chưa cấu hình.', 'NOT_CONFIGURED');

  try {
    const url = `https://docs.google.com/spreadsheets/d/${GOOGLE_SHEET_ID}/export?format=csv&gid=${PICKS_GID}`;
    const res  = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return err(502, 'Không thể tải dữ liệu.', 'FETCH_ERROR');
    const rows = parseCSV(await res.text());
    return ok({ data: rows.map(r => ({
      pick_id:    r.pick_id,
      created_at: r.created_at,
      user_id:    r.user_id,
      fixture_id: r.fixture_id,
      pick_type:  r.pick_type,
    })) });
  } catch (e) {
    console.error('live-picks error:', e.message);
    return err(502, 'Không thể tải dữ liệu.', 'FETCH_ERROR');
  }
};
