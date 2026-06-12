# Regression Test Plan

Checklist thủ công để verify các tính năng cốt lõi trước khi merge/release.
Chạy trên môi trường production (Netlify) hoặc local (`npm run dev`).

---

## T1 — Dark/Light Mode

| # | Bước | Expected |
|---|---|---|
| 1.1 | Mở trang, OS đang dùng dark mode | Trang render dark ngay — không flash trắng (FOUT) |
| 1.2 | Mở trang, OS đang dùng light mode | Trang render light ngay |
| 1.3 | Click toggle: ⊙ → ☀ → 🌙 → ⊙ | UI chuyển theme ngay, icon đúng |
| 1.4 | Reload sau khi chọn dark | Vẫn giữ dark (localStorage persist) |
| 1.5 | Mở tab mới | Cùng theme với tab cũ |

---

## T2 — Auth

Login gọi `/.netlify/functions/login` (server-side) → Apps Script verify → trả session.

| # | Bước | Expected |
|---|---|---|
| 2.1 | Login username/passcode sai | Lỗi "Username hoặc passcode không đúng" (cùng message cho cả user không tồn tại và sai passcode) |
| 2.2 | Login tài khoản `status=inactive` | Lỗi "Tài khoản chưa được kích hoạt" |
| 2.3 | Login đúng | Redirect `/my-picks/`, tên user hiện trên nav |
| 2.4 | Logout | Redirect `/`, nav về trạng thái chưa đăng nhập |
| 2.5 | Login quá 10 lần/phút | Lỗi "Quá nhiều yêu cầu. Vui lòng thử lại sau." |
| 2.6 | Register — username đã tồn tại | Lỗi "Username đã được sử dụng" (client-side từ snapshot) |
| 2.7 | Register hợp lệ | "Đăng ký thành công", tài khoản vào Sheet ở trạng thái `inactive` |

---

## T3 — Gửi dự đoán

| # | Bước | Expected |
|---|---|---|
| 3.1 | `/fixtures/` chưa đăng nhập → chọn pick | Hiện form username + passcode |
| 3.2 | `/fixtures/` đã đăng nhập → chọn pick | Hiện "Dự đoán với tài khoản: [tên]" |
| 3.3 | Xác nhận gửi dự đoán thành công | Badge "● Đã dự đoán", pick button có ring highlight |
| 3.4 | Reload `/fixtures/` sau khi gửi | Pick cũ vẫn highlight (pending localStorage) |
| 3.5 | Trận locked (< 5 phút trước kickoff) | Badge "🔒 Đã đóng", buttons disabled |
| 3.6 | Gửi dự đoán → community picks bar | Bar ba màu (đỏ/vàng/xanh) xuất hiện |
| 3.7 | Handicap lẻ (1.5, 2.5) | Nút "Hòa chấp" disabled + label "(chấp lẻ)" |
| 3.8 | Đổi dự đoán cho cùng trận | Dự đoán cũ bị ghi đè (upsert trong Sheet) |

---

## T4 — My Picks

| # | Bước | Expected |
|---|---|---|
| 4.1 | `/my-picks/` chưa đăng nhập | Nút "Đăng nhập", không có pick list |
| 4.2 | `/my-picks/` đã đăng nhập | Hiện đúng pick, ngày đặt |
| 4.3 | Pick vừa đặt (chưa qua build) | Badge "(chưa sync)" màu vàng |
| 4.4 | Pick đã confirmed trong build | Badge mất, hiện kết quả nếu trận đã FT |
| 4.5 | Tổng điểm | Đúng = sum(points) các trận có kết quả |

---

## T5 — Sync & Cache

| # | Bước | Expected |
|---|---|---|
| 5.1 | Gửi dự đoán → reload `/fixtures/` | Pick vẫn highlight |
| 5.2 | Gửi dự đoán device A → mở device B (cùng tài khoản) | Sau khi load, device B highlight đúng pick qua CSV sync |
| 5.3 | Netlify build mới sau khi đặt | `/my-picks/` hiện pick từ snapshot, badge "(chưa sync)" biến mất |

---

## T6 — Mobile UX

| # | Thiết bị | Expected |
|---|---|---|
| 6.1 | iOS Safari — mở `/login/` | Tap input không zoom trang (font-size ≥ 16px) |
| 6.2 | Màn hình 375px — `/fixtures/` | Pick buttons đủ lớn để tap (min-height 72px) |
| 6.3 | Màn hình 375px — `/leaderboard/` | Cột "Số cược" ẩn, bảng không overflow ngang |
| 6.4 | Mobile — nav | Menu mở/đóng đúng, theme toggle hiển thị |

---

## T7 — Leaderboard

| # | Bước | Expected |
|---|---|---|
| 7.1 | `/leaderboard/` | Xếp hạng đúng thứ tự điểm giảm dần |
| 7.2 | Top 3 | Có emoji 🥇🥈🥉 |
| 7.3 | Người dùng 0 điểm | Hiện "0", không có dấu "+" |

---

## Quick Checklist — Trước mỗi release

```
[ ] npm run build thành công (< 30s, không có lỗi 11ty)
[ ] Không có JS error trong console trên homepage
[ ] Login + logout flow hoạt động
[ ] Đặt dự đoán 1 trận → verify dòng mới trong Google Sheet
[ ] Dark/light toggle không flash khi reload
[ ] Mobile: input không zoom, pick buttons dễ tap
```

---

## Scope KHÔNG test tự động

Các phần dưới đây phụ thuộc Google Sheets live nên chỉ test thủ công:
- Apps Script auth & upsert logic
- GitHub Actions daily sync (xem log trên Actions tab)
- Netlify build hook trigger
