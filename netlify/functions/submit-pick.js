'use strict';
const { ok, err, makeRateLimiter, setup, callScript } = require('./_shared');

const isRateLimited = makeRateLimiter(10);

exports.handler = async (event) => {
  const [body, early] = setup(event, isRateLimited);
  if (early) return early;

  if (body.website) return ok({ success: true, pick_id: 'ignored' });

  const { fixture_id, pick_type, username, _session_hash, _recovery, client_created_at } = body;

  if (!fixture_id || !pick_type || !username)
    return err(400, 'Thiếu thông tin bắt buộc.', 'MISSING_FIELDS');
  if (!/^[a-zA-Z0-9]{2,5}-[a-zA-Z0-9]{2,5}$/.test(fixture_id))
    return err(400, 'fixture_id không hợp lệ.', 'INVALID_FIXTURE_ID');
  if (!_session_hash)
    return err(400, 'Thiếu thông tin xác thực.', 'MISSING_AUTH');
  if (!['home', 'draw', 'away'].includes(pick_type))
    return err(400, 'Loại dự đoán không hợp lệ.', 'INVALID_PICK_TYPE');

  const allowLateResubmit = process.env.ALLOW_LATE_RESUBMIT === 'true';
  const isRecovery = allowLateResubmit && _recovery === true
    && typeof client_created_at === 'string' && !isNaN(Date.parse(client_created_at));

  try {
    const data = await callScript({
      username:      username.toLowerCase().trim(),
      fixture_id,
      pick_type,
      _session_hash,
      created_at:    isRecovery ? client_created_at : new Date().toISOString(),
      ...(isRecovery && { _recovery: true }),
    });

    if (!data.success)
      return err(data.status || 400, data.error || 'Lỗi không xác định.', data.code || 'SCRIPT_ERROR');
    return ok({ success: true, pick_id: data.pick_id, updated: data.updated || false });

  } catch (e) {
    if (e.code === 'NOT_CONFIGURED') return err(503, 'Hệ thống chưa được cấu hình. Liên hệ admin.', 'NOT_CONFIGURED');
    console.error('Apps Script error:', e.message);
    return err(502, 'Không thể lưu dự đoán. Vui lòng thử lại.', 'SCRIPT_ERROR');
  }
};
