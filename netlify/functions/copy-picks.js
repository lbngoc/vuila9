'use strict';
const { ok, err, makeRateLimiter, setup, callScript } = require('./_shared');

const isRateLimited = makeRateLimiter(5);

exports.handler = async (event) => {
  const [body, early] = setup(event, isRateLimited);
  if (early) return early;

  if (body.website) return ok({ success: true, copiedCount: 0 });

  const { username, _session_hash, target_user_id } = body;

  if (!username)       return err(400, 'Thiếu thông tin người dùng.', 'MISSING_USERNAME');
  if (!_session_hash)  return err(400, 'Thiếu thông tin xác thực.', 'MISSING_AUTH');
  if (!target_user_id) return err(400, 'Thiếu thông tin người chơi cần sao chép.', 'MISSING_TARGET_USER');

  try {
    const data = await callScript({
      action:         'copy_predictions',
      username:       username.toLowerCase().trim(),
      _session_hash,
      target_user_id,
    });

    if (!data.success)
      return err(data.status || 400, data.error || 'Lỗi không xác định.', data.code || 'SCRIPT_ERROR');
    return ok({ success: true, copiedCount: data.copiedCount || 0, copiedFixtureIds: data.copiedFixtureIds || [] });

  } catch (e) {
    if (e.code === 'NOT_CONFIGURED') return err(503, 'Hệ thống chưa được cấu hình. Liên hệ admin.', 'NOT_CONFIGURED');
    console.error('Apps Script copy error:', e.message);
    return err(502, 'Không thể sao chép dự đoán. Vui lòng thử lại.', 'SCRIPT_ERROR');
  }
};
