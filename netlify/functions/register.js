'use strict';
const crypto = require('crypto');
const { ok, err, makeRateLimiter, setup, callScript } = require('./_shared');

const isRateLimited = makeRateLimiter(5);

function hashPasscode(username, passcode) {
  return crypto.createHash('sha256').update(username + passcode).digest('hex');
}

exports.handler = async (event) => {
  const [body, early] = setup(event, isRateLimited);
  if (early) return early;

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

  try {
    const data = await callScript({
      action:        'register',
      username:      u,
      display_name:  display_name.trim(),
      passcode_hash: hashPasscode(u, p),
      created_at:    new Date().toISOString(),
    });

    if (data.success) return ok({ success: true, status: data.status || 'inactive' });

    if (data.code === 'DUPLICATE_USERNAME')
      return err(400, 'Username đã được sử dụng.', 'DUPLICATE_USERNAME');
    throw new Error(data.error || 'Apps Script failure');

  } catch (e) {
    if (e.code === 'NOT_CONFIGURED') return err(503, 'Hệ thống chưa được cấu hình.', 'NOT_CONFIGURED');
    console.error('Register error:', e.message);
    return err(502, 'Không thể hoàn tất đăng ký. Vui lòng thử lại.', 'SCRIPT_ERROR');
  }
};
