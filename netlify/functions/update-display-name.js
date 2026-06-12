'use strict';
const { ok, err, makeRateLimiter, setup, callScript } = require('./_shared');

const isRateLimited = makeRateLimiter(5);

exports.handler = async (event) => {
  const [body, early] = setup(event, isRateLimited);
  if (early) return early;

  if (body.website) return ok({ success: true });

  const { username, _session_hash, display_name } = body;

  if (!username || !_session_hash || !display_name)
    return err(400, 'Thiếu thông tin bắt buộc.', 'MISSING_FIELDS');

  const name = display_name.trim();
  if (!name)          return err(400, 'Tên hiển thị không được để trống.', 'INVALID_DISPLAY_NAME');
  if (name.length > 50) return err(400, 'Tên hiển thị tối đa 50 ký tự.', 'INVALID_DISPLAY_NAME');

  try {
    const data = await callScript({
      action:        'update_display_name',
      username:      username.toLowerCase().trim(),
      _session_hash,
      display_name:  name,
    });

    if (!data.success)
      return err(data.status || 400, data.error || 'Lỗi không xác định.', data.code || 'SCRIPT_ERROR');
    return ok({ success: true });

  } catch (e) {
    if (e.code === 'NOT_CONFIGURED') return err(503, 'Hệ thống chưa được cấu hình. Liên hệ admin.', 'NOT_CONFIGURED');
    console.error('Apps Script error:', e.message);
    return err(502, 'Không thể cập nhật. Vui lòng thử lại.', 'SCRIPT_ERROR');
  }
};
