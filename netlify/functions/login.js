'use strict';
const { ok, err, makeRateLimiter, setup, callScript } = require('./_shared');

const isRateLimited = makeRateLimiter(10);

exports.handler = async (event) => {
  const [body, early] = setup(event, isRateLimited);
  if (early) return early;

  if (body.website) return ok({ success: true });

  const { username, passcode_hash } = body;

  if (!username || !passcode_hash)
    return err(400, 'Thiếu thông tin bắt buộc.', 'MISSING_FIELDS');

  const u = String(username).trim();
  if (!/^[a-zA-Z][a-zA-Z0-9_]{2,19}$/.test(u))
    return err(400, 'Username không hợp lệ.', 'INVALID_USERNAME');

  if (!/^[a-f0-9]{64}$/.test(String(passcode_hash)))
    return err(400, 'Request không hợp lệ.', 'INVALID_HASH');

  try {
    const data = await callScript({ action: 'login', username: u, passcode_hash: String(passcode_hash) });

    if (data.success) {
      return ok({
        success:      true,
        user_id:      data.user_id,
        username:     data.username,
        display_name: data.display_name,
        _ph:          data._ph,
      });
    }

    const code = data.code || 'ERROR';
    if (code === 'NOT_FOUND' || code === 'WRONG_PASSWORD')
      return err(401, 'Username hoặc passcode không đúng.', code);
    if (code === 'INACTIVE')
      return err(403, data.error || 'Tài khoản chưa được kích hoạt.', code);
    return err(400, data.error || 'Đăng nhập thất bại.', code);

  } catch (e) {
    if (e.code === 'NOT_CONFIGURED') return err(503, 'Hệ thống chưa được cấu hình.', 'NOT_CONFIGURED');
    console.error('Login error:', e.message);
    return err(502, 'Không thể kết nối. Vui lòng thử lại.', 'SCRIPT_ERROR');
  }
};
