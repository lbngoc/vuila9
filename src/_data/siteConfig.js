'use strict';

// ── Configurable constants (read early so they can be used in arrays below) ──
const pick_lock_minutes = parseInt(process.env.PICK_LOCK_MINUTES)  || 60;    // default 60 phút
const demo_mode        = (process.env.DEMO_MODE        || 'false') === 'true'; // default false
const public_mode      = (process.env.PUBLIC_MODE      || 'true' ) === 'true'; // default true — hiện link Dữ liệu gốc

// NO_PICK: đặt trực tiếp tại đây — mọi thay đổi có git history
// Bật/tắt: NO_PICK < 0 → feature bật; NO_PICK >= 0 → feature tắt
const no_pick_point = -1;

module.exports = {
  site_name:      'Vui Là Chính',
  storage_prefix: 'vuila9',   // localStorage key prefix (synced with app.js)
  timezone:       process.env.TIMEZONE || 'Asia/Ho_Chi_Minh',
  public_mode,    // default: true — set PUBLIC_MODE=false để ẩn link "Dữ liệu gốc" đến Google Sheet

  // ── Pick lock ───────────────────────────────────────────────────────────
  // Số phút trước giờ đá mà dự đoán bị khoá.
  // Thay đổi qua env var PICK_LOCK_MINUTES (hoặc trực tiếp đổi số 60 ở trên).
  pick_lock_minutes,   // default: 60

  // ── Demo mode ───────────────────────────────────────────────────────────
  // Nếu true: hiện banner thông báo lịch cập nhật dữ liệu và reset demo.
  // Set DEMO_MODE=true trong Netlify Build env vars để bật.
  // Khung giờ do Apps Script time trigger quyết định — banner chỉ thông báo,
  // không tự động điều chỉnh hành vi của site.
  demo_mode,          // default: false

  // Giờ hiển thị trên banner — phải khớp với Apps Script trigger schedule.
  // Thay đổi qua Netlify Build env vars (không ảnh hưởng logic, chỉ thay đổi text banner).
  demo_update_time:    process.env.DEMO_UPDATE_TIME || '08:00,12:00,20:00',
  demo_reset_time:     process.env.DEMO_RESET_TIME  || '02:00',
  demo_update_display: (() => {
    const raw = process.env.DEMO_UPDATE_TIME || '08:00,12:00,20:00';
    return raw.split(',').map(s => { const h = parseInt(s.trim()); return `${h}–${h + 1} giờ`; }).join(' · ');
  })(),
  demo_reset_display: (() => {
    const raw = process.env.DEMO_RESET_TIME || '02:00';
    return raw.split(',').map(s => { const h = parseInt(s.trim()); return `${h}–${h + 1} giờ sáng`; }).join(' · ');
  })(),

  // ── Scoring config ──────────────────────────────────────────────────────
  // Thay đổi WIN/LOSE/NO_PICK trực tiếp tại đây — mọi chỉnh sửa có git history.
  //
  // Ví dụ:
  //   WIN: 3, LOSE:  0, NO_PICK:  0   → thắng +3, thua/bỏ giữ nguyên (NO_PICK tắt)
  //   WIN: 3, LOSE: -1, NO_PICK:  0   → thắng +3, thua -1, bỏ qua không tính (NO_PICK tắt)
  //   WIN: 3, LOSE: -1, NO_PICK: -1   → thắng +3, thua/bỏ đều -1 (NO_PICK bật)
  //
  // PUSH: xảy ra khi home/away pick trúng đúng ranh giới chấp (chấp nguyên bàn).
  //       Khác với 'draw' pick — draw pick trúng ranh giới cho WIN (+3).
  //
  // NO_PICK: < 0 → feature bật (ghi nhận trận bỏ qua + trừ điểm); >= 0 → feature tắt.
  points: {
    WIN:    1,   // chọn đúng (đội thắng/thua theo điểm chấp)
    PUSH:   2,   // hòa chấp chính xác — chấp nguyên bàn, home/away pick đúng ranh giới
    LOSE:  -1,   // chọn sai
    NO_PICK: no_pick_point,   // không gửi dự đoán; < 0 để bật feature
  },

  // ── Hướng dẫn chơi ─────────────────────────────────────────────────────
  how_to_play: [
    'Vào Lịch thi đấu, chọn đội bạn dự đoán thắng cho mỗi trận (đã tính điểm chấp).',
    `Mỗi trận chỉ được gửi 1 dự đoán — có thể đổi lựa chọn bất kỳ lúc nào trước ${pick_lock_minutes} phút khi bóng lăn.`,
    'Sau trận, điểm được tính theo kết quả thực tế có điểm chấp (không phải tỉ số trực tiếp).',
    'Người có tổng điểm cao nhất trên bảng xếp hạng là người thắng cuộc!',
    ...(no_pick_point < 0
      ? ['Trận đã kết thúc mà bạn không gửi dự đoán sẽ bị ghi nhận riêng là Bỏ qua.']
      : []),
  ],

  // ── Ghi chú điểm chấp ──────────────────────────────────────────────────
  // Chấp nguyên bàn (1, 2, 3...): có thể xảy ra hòa chấp (PUSH)
  handicap_note: 'Đội mạnh chấp trước một số bàn nguyên. Ví dụ: chấp 2 bàn, Argentina vs Austria — chọn Argentina thắng nếu Argentina thắng cách biệt từ 3 bàn trở lên (3-0, 4-1). Thắng cách đúng 2 bàn (2-0) → hòa chấp (không tính điểm). Thắng 1 bàn hoặc thua/hòa → dự đoán sai.',

  // Chấp lẻ (0.5, 1.5, 2.5...): không bao giờ có hòa chấp — chỉ thắng hoặc thua
  handicap_half_note: 'Đội mạnh chấp trước một số bàn lẻ (0.5, 1.5, 2.5...) — không bao giờ có hòa chấp. Ví dụ: chấp 1.5 bàn, Brazil vs Scotland — chọn Brazil thắng nếu Brazil thắng cách biệt từ 2 bàn trở lên (2-0, 3-1). Thắng đúng 1 bàn hoặc thua/hòa → dự đoán sai. Chấp lẻ nút "Hòa" bị tắt vì không thể xảy ra.',

  // ── GitHub / Open source links ──────────────────────────────────────────
  // Set GITHUB_URL trong Netlify Build env (phải bắt đầu bằng https://).
  // Templates guard bằng {% if siteConfig.github_url %} — không render nếu chưa set.
  github_url: (() => {
    const raw = process.env.GITHUB_URL || '';
    if (!raw.startsWith('https://')) return null;  // chặn javascript: và misconfiguration
    return raw.replace(/\/+$/, '');                 // trim trailing slash → tránh //commits/main
  })(),
};
