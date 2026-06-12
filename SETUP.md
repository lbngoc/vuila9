# Setup Google Sheets & Apps Script

---

## Chạy local trước khi deploy

### Cài đặt

```bash
npm install
```

Yêu cầu: **Node.js 18+**

---

### Option A — Chỉ frontend (không cần Google Sheets)

Dữ liệu mẫu có sẵn trong `data/sample/`. Copy vào `data/raw/` (thư mục pipeline đọc):

```bash
cp data/sample/*.csv data/raw/
npm run calculate   # normalize → calculate → export JSON vào src/_data/
npm run dev         # TailwindCSS watch + Eleventy (port 8080)
```

Mở **http://localhost:8080** — đầy đủ dữ liệu mẫu, không cần cấu hình thêm.

> Tính năng không hoạt động ở mode này: gửi dự đoán và đăng ký (cần Netlify Functions).

#### Dữ liệu mẫu (`data/sample/`)

**`users.csv`** (5 users vui nhộn)
```
id,username,display_name,passcode,passcode_hash,created_at,status
u_000,lam_mau,Mẫu Chính,123456,,2026-05-25T16:24:25.115Z,active
u_001,vui_la_9,Vui Là Chính,111111,,2026-05-26T00:00:00.000Z,active
u_002,choi_cho_vui,Chơi Cho Vui,222222,,2026-05-26T00:00:00.000Z,active
u_003,thich_la_chon,Thích Là Chọn,333333,,2026-05-26T00:00:00.000Z,active
u_004,sao_cung_duoc,Sao Cũng Được,444444,,2026-05-26T00:00:00.000Z,active
```

**`fixtures.csv`** (rút gọn — 6 trận đầu đã có kết quả, xem đầy đủ tại `data/sample/fixtures.csv`)
```
fixture_id,league,kickoff_at,home_team,away_team,handicap,status,result_home,result_away,note
MEX-RSA,Bảng A,2026-06-11T19:00:00.000Z,Mexico,Nam Phi,-1,finished,3,1,dữ liệu test
KOR-CZE,Bảng A,2026-06-12T02:00:00.000Z,Hàn Quốc,Séc,0,finished,1,1,dữ liệu test
CAN-BIH,Bảng B,2026-06-12T19:00:00.000Z,Canada,Bosnia,-0.5,finished,2,1,dữ liệu test
USA-PAR,Bảng D,2026-06-13T01:00:00.000Z,Mỹ,Paraguay,-1,finished,3,0,dữ liệu test
BRA-MAR,Bảng C,2026-06-13T22:00:00.000Z,Brazil,Ma Rốc,-2,finished,3,0,dữ liệu test
QAT-SUI,Bảng B,2026-06-13T19:00:00.000Z,Qatar,Thụy Sĩ,+0.5,finished,1,2,dữ liệu test
```

**`picks.csv`** (rút gọn — 27 picks, xem đầy đủ tại `data/sample/picks.csv`)
```
pick_id,created_at,user_id,fixture_id,pick_type
bet_001,2026-06-10T08:00:00.000Z,u_000,MEX-RSA,home
bet_002,2026-06-10T08:05:00.000Z,u_001,MEX-RSA,draw
bet_003,2026-06-10T08:10:00.000Z,u_002,MEX-RSA,home
bet_004,2026-06-10T08:15:00.000Z,u_003,MEX-RSA,home
```

**Login thử:** username `lam_mau`, passcode `123456`

---

### Option B — Chạy đầy đủ với Netlify CLI (bao gồm Functions)

Netlify CLI chạy Functions local giống y hệt production — cần thiết để test gửi dự đoán và đăng ký.

#### Bước 1: Cài Netlify CLI

```bash
npm install -g netlify-cli
```

Kiểm tra:
```bash
netlify --version
```

#### Bước 2: Tạo `.env.local`

```env
GOOGLE_SCRIPT_URL=https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec
APP_SECRET=any-random-string-for-local-testing
# Cần để test live-picks và live-users (bỏ trống nếu không test live data):
GOOGLE_SHEET_ID=your-sheet-id
PICKS_GID=987654321
USERS_GID=0
```

> Nếu chưa có Apps Script thật: dùng giá trị giả. Validation sẽ chạy đúng, chỉ lỗi ở bước cuối khi gọi Apps Script.

#### Bước 3: Copy dữ liệu mẫu và build

```bash
cp data/sample/*.csv data/raw/
npm run build      # pipeline + TailwindCSS + 11ty
```

#### Bước 4: Chạy Netlify Dev

```bash
netlify dev
```

Netlify CLI tự nhận:
- `dist/` làm publish directory
- `netlify/functions/` làm functions directory
- `.env.local` làm environment variables

→ Local server: **http://localhost:8888**
→ Functions tại: `http://localhost:8888/.netlify/functions/submit-pick`

> **Live reload:** `netlify dev` không watch Eleventy. Để có hot-reload đầy đủ, chạy thêm `npm run dev` ở terminal riêng (port 8080) — hoặc dùng `netlify dev` + `npm run css` + rebuild thủ công khi cần test functions.

#### Test function local bằng curl

```bash
# Test login
curl -X POST http://localhost:8888/.netlify/functions/login \
  -H "Content-Type: application/json" \
  -d '{"username":"lam_mau","passcode_hash":"<sha256(username+passcode)>"}'

# Test submit-pick (sau khi đã login lấy _session_hash từ localStorage)
curl -X POST http://localhost:8888/.netlify/functions/submit-pick \
  -H "Content-Type: application/json" \
  -d '{"fixture_id":"MEX-RSA","pick_type":"home","username":"lam_mau","_session_hash":"<hash>"}'

# Test register
curl -X POST http://localhost:8888/.netlify/functions/register \
  -H "Content-Type: application/json" \
  -d '{"username":"newuser","display_name":"New User","passcode":"mypassword123"}'

# Test live-picks (GET — cần GOOGLE_SHEET_ID + PICKS_GID trong .env.local)
curl http://localhost:8888/.netlify/functions/live-picks

# Test live-users (GET — cần GOOGLE_SHEET_ID + USERS_GID trong .env.local)
curl http://localhost:8888/.netlify/functions/live-users
```

---

## Bước 1 — Tạo Google Sheet

1. Tạo spreadsheet mới: **"Vui Là Chính - WC 2026"**
2. Tạo 3 tabs (click dấu `+` góc dưới trái):
   - `users`
   - `fixtures`
   - `picks`

### Tab `users` — header row (row 1):
```
id | username | display_name | passcode | passcode_hash | created_at | status
```

> `passcode` — raw passcode for admin-created users (hashed at build time by `normalize.js`)
> `passcode_hash` — pre-computed SHA-256 hash; populated by the registration endpoint; leave blank for admin-created users

### Tab `fixtures` — header row:
```
fixture_id | league | kickoff_at | home_team | away_team | handicap | status | result_home | result_away
```

### Tab `picks` — header row:
```
pick_id | created_at | user_id | fixture_id | pick_type
```

---

## Bước 2 — Lấy Sheet ID và GIDs

**Sheet ID** — từ URL:
```
https://docs.google.com/spreadsheets/d/{SHEET_ID}/edit
```

**GID của mỗi tab** — click vào tab → xem URL:
```
...#gid={GID}
```

---

## Bước 3 — Set sheet public

Share → "Anyone with the link" → **Viewer**

Test URL (thay `{SHEET_ID}` và `{GID}`):
```
https://docs.google.com/spreadsheets/d/{SHEET_ID}/export?format=csv&gid={GID}
```
→ Phải download được CSV khi mở trên browser ẩn danh.

---

## Bước 4 — Tạo Apps Script

1. Trong Google Sheet → **Extensions → Apps Script**
2. Xoá code mặc định, paste toàn bộ `google-apps-script.js`
3. **Project Settings** (gear icon) → **Script Properties** → Add:
   - `APP_SECRET` = một chuỗi ngẫu nhiên (copy từ `.env.local`)
   - `NETLIFY_BUILD_HOOK` = URL từ Netlify Build Hooks (xem Bước 6)
   - `REGISTER_STATUS` = `active` (mặc định) hoặc `inactive` nếu muốn admin duyệt thủ công

---

## Bước 5 — Deploy Apps Script

1. Click **Deploy → New deployment**
2. Chọn type: **Web app**
3. Cấu hình:
   - Description: `Vui Là Chính webhook v1`
   - Execute as: **Me**
   - Who has access: **Anyone**
4. Click **Deploy** → Copy **Web app URL**
5. Test bằng curl (thay URL và secret):

**Test gửi dự đoán:**
```bash
curl -X POST "https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec" \
  -H "Content-Type: application/json" \
  -d '{
    "_secret": "your-app-secret",
    "user_id": "u_000",
    "fixture_id": "MEX-RSA",
    "pick_type": "home",
    "created_at": "2026-05-23T10:00:00.000Z"
  }'
```

→ Kết quả mong đợi: `{"success":true,"pick_id":"bet_20260523_..."}`

**Test upsert (đổi dự đoán):** Gửi lại request trên với `"existing_pick_id": "bet_..."` → cập nhật row thay vì tạo mới.

→ Kết quả mong đợi: `{"success":true,"pick_id":"bet_...","updated":true}`

**Test đăng ký user mới:**
```bash
curl -X POST "https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec" \
  -H "Content-Type: application/json" \
  -d '{
    "_secret": "your-app-secret",
    "action": "register",
    "username": "testuser",
    "display_name": "Test User",
    "passcode_hash": "abc123...",
    "created_at": "2026-05-23T10:00:00.000Z"
  }'
```

→ Kết quả mong đợi: `{"success":true,"status":"active"}` (hoặc `"inactive"` tuỳ `REGISTER_STATUS`)
→ User được tạo trong tab `users` với `status` theo giá trị Script Property `REGISTER_STATUS`

---

## Bước 6 — Netlify Build Hook

1. Netlify dashboard → Site → **Build & deploy → Build hooks**
2. Add build hook: Name "Admin trigger", Branch "main"
3. Copy URL → thêm vào Apps Script Properties: `NETLIFY_BUILD_HOOK`

---

## Bước 7 — Cập nhật .env.local

```env
GOOGLE_SCRIPT_URL=https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec
APP_SECRET=your-random-secret-string
GOOGLE_SHEET_ID=your-sheet-id
USERS_GID=0
FIXTURES_GID=123456789
PICKS_GID=987654321

# Luật chơi (tùy chọn — bỏ trống = dùng giá trị mặc định)
PICK_LOCK_MINUTES=60    # khoá dự đoán N phút trước giờ đá (mặc định: 60)
# NO_PICK: không có env var — đổi points.NO_PICK trong src/_data/siteConfig.js
PUBLIC_MODE=true       # false → ẩn link "Dữ liệu gốc" ở fixtures + leaderboard (mặc định: true)
```

---

## Bước 8 — Test pipeline end-to-end

Sau khi đã paste dữ liệu vào Sheet:

```bash
npm run fetch      # download CSVs từ Google Sheets → data/raw/
npm run calculate  # normalize → calculate → build leaderboard → export JSON
npm run build      # pipeline + TailwindCSS + 11ty
npm run dev        # local dev server (port 8080)
```

> Nếu dùng dữ liệu mẫu (`data/sample/`), copy thủ công:
> ```bash
> cp data/sample/*.csv data/raw/
> npm run calculate
> npm run dev
> ```

→ Kiểm tra `src/_data/leaderboard.json` có đủ data.

---

## Tạo user thủ công (admin)

Script `scripts/create-user.js` nhận username, tên hiển thị, passcode và in ra CSV row sẵn sàng paste vào Sheet:

```bash
node scripts/create-user.js <username> <display_name> <passcode> [id]
```

**Ví dụ:**
```bash
# ID tự sinh
node scripts/create-user.js ngoc "Ngọc Lương" mypassword123

# ID tự đặt (tiện khi muốn dùng chuỗi dễ đọc)
node scripts/create-user.js hung "Hùng" mypassword123 u006
```

**Output** (dán thẳng vào row mới của tab `users`):
```
id,username,display_name,passcode,passcode_hash,created_at,status
u006,hung,Hùng,,<hash>,2026-05-25 15:22:42,active
```

> Cột `passcode` để trống — hash đã được tính sẵn vào `passcode_hash`. User đăng nhập bằng passcode gốc, không thể đọc ngược từ hash.

---

## Kích hoạt user mới (admin workflow)

1. Mở Google Sheet → tab `users`
2. Tìm row user vừa đăng ký (`status: inactive`)
3. Đổi `status` → `active`
4. Trigger rebuild (Build Hook hoặc `npm run build` local)

---

## Cập nhật kết quả trận đấu (admin workflow)

1. Mở Google Sheet → tab `fixtures`
2. Điền `result_home` và `result_away` cho trận đã kết thúc
3. Đổi `status` → `finished`
4. Click Netlify Build Hook URL để trigger rebuild ngay (không chờ đến lần sync tiếp theo)

Sau ~1 phút site sẽ update leaderboard tự động.

---

## GitHub Actions — Daily Sync (tự động 3 lần/ngày)

Workflow `.github/workflows/daily-sync.yml` fetch data từ Google Sheets, tính toán lại, commit `src/_data/*.json` vào repo → trigger Netlify rebuild tự động.

**Lịch chạy:** 3 lần/ngày theo giờ ICT (UTC+7):
| Giờ UTC | Giờ ICT | Mục đích |
|---------|---------|----------|
| 02:00   | 09:00   | Sau các trận đêm khuya (01:00 ICT) |
| 07:00   | 14:00   | Sau các trận sáng (07:00 ICT) |
| 14:00   | 21:00   | Trước khung betting tối (trước lock 00:00) |

**Manual trigger:** GitHub → Actions → Daily data sync → Run workflow.

> **Lưu ý quan trọng:** GitHub Actions scheduled cron không đảm bảo chạy đúng giờ. Xem phần [Giới hạn của GitHub Actions cron](#giới-hạn-của-github-actions-cron--external-trigger) bên dưới.

### Bước 1 — Thêm Secrets vào GitHub repo

GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**

**Bắt buộc:**

| Secret | Lấy từ |
|---|---|
| `GOOGLE_SHEET_ID` | URL Google Sheet (`/d/{ID}/edit`) |
| `USERS_GID` | GID tab `users` (xem URL khi click vào tab) |
| `FIXTURES_GID` | GID tab `fixtures` |
| `PICKS_GID` | GID tab `picks` |

**Tùy chọn — luật chơi** (bỏ qua = dùng mặc định):

| Secret | Mô tả | Mặc định |
|---|---|---|
| `PICK_LOCK_MINUTES` | Phút trước kickoff để khoá dự đoán | `60` |
| `points.NO_PICK` | Xem mục NO_PICK bên dưới — bật/tắt bằng cách đổi giá trị trong `siteConfig.js` | `-1` |
| `PUBLIC_MODE` | `false` → ẩn link "Dữ liệu gốc" đến Sheet ở fixtures + leaderboard | `true` |

> Các giá trị này cũng có thể set trong `.env.local` để test local.

### Bước 2 — Test chạy thủ công

Sau khi thêm secrets:

1. GitHub → **Actions → Daily data sync → Run workflow → Run workflow**
2. Xem log — phải thấy các bước fetch, calculate chạy thành công
3. Nếu có data mới: GitHub tự tạo 1 commit `data: sync YYYY-MM-DD HH:MM UTC`
4. Commit đó trigger Netlify rebuild → site cập nhật trong ~1 phút

### Bước 3 — Xem audit trail

```bash
git log --oneline src/_data/leaderboard.json
# d3a1bc2 data: sync 2026-06-15 12:00 UTC
# a7f9e11 data: sync 2026-06-15 00:00 UTC
# 58b2799 feat: complete MVP...
```

Mỗi lần sync là 1 snapshot đầy đủ — xem diff để thấy ai thay đổi điểm số:

```bash
git diff HEAD~1 src/_data/leaderboard.json
```

---

## Netlify — Cấu hình cuối

Sau khi có GitHub Actions setup, Netlify **không cần** Sheet credentials cho build (data đã được commit sẵn vào `src/_data/`).

**Site configuration → Environment variables → Add variable**

### Netlify Functions (bắt buộc để gửi dự đoán, đăng nhập & đăng ký hoạt động)

| Variable | Dùng bởi | Mô tả |
|---|---|---|
| `GOOGLE_SCRIPT_URL` | tất cả | Apps Script web app URL (từ Bước 5) |
| `APP_SECRET` | tất cả | Cùng giá trị với Apps Script Properties |
| `GOOGLE_SHEET_ID` | `live-picks`, `live-users`, `register` | Sheet ID |
| `USERS_GID` | `live-users` | GID tab `users` |
| `PICKS_GID` | `live-picks` | GID tab `picks` |

> Thiếu `GOOGLE_SCRIPT_URL` hoặc `APP_SECRET` thì đăng nhập, gửi dự đoán và đăng ký sẽ báo lỗi 503.  
> Thiếu `GOOGLE_SHEET_ID`/`PICKS_GID`/`USERS_GID` thì `live-picks`/`live-users` trả 503 — trang vẫn hiển thị, chỉ mất community picks và live data.

### Netlify Build — Luật chơi (tùy chọn)

Các biến này được đọc tại **build time** (trong `siteConfig.js` và pipeline scripts). Nếu không set, site dùng giá trị mặc định.

| Variable | Mô tả | Mặc định |
|---|---|---|
| `PICK_LOCK_MINUTES` | Phút trước kickoff để khoá form dự đoán | `60` |
| `points.NO_PICK` | Xem mục NO_PICK bên dưới — bật/tắt bằng cách đổi giá trị trong `siteConfig.js` | `-1` |
| `PUBLIC_MODE` | `false` → ẩn link "Dữ liệu gốc" đến Sheet ở fixtures + leaderboard | `true` |
| `DEMO_MODE` | `true` → hiện banner lịch demo ở cuối mọi trang | `false` |
| `DEMO_UPDATE_TIME` | Giờ ICT cập nhật kết quả, phân cách dấu phẩy — khớp Apps Script triggers | `08:00,12:00,20:00` |
| `DEMO_RESET_TIME` | Giờ ICT reset demo — hỗ trợ nhiều khung giờ bằng dấu phẩy | `02:00` |

> **Lưu ý scope:** Chọn scope **"Builds"** (không phải "Functions") khi thêm các biến này vào Netlify. Sau khi thay đổi phải **trigger redeploy** để có hiệu lực.

---

## Cấu hình luật chơi

Hai tham số điều chỉnh luật chơi, set qua **env vars** tại cả 3 nơi: `.env.local` (local), GitHub Actions Secrets (data sync), và Netlify Build env vars (live site).

---

### PICK_LOCK_MINUTES — Thời gian khoá dự đoán

**Mặc định: `60` phút trước giờ đá.**

Khi thời điểm hiện tại ≥ `kickoff_at − PICK_LOCK_MINUTES`, form dự đoán bị khoá (hiện badge "🔒 Đã đóng").

| Giá trị | Ý nghĩa |
|---|---|
| `60` (mặc định) | Khoá 1 tiếng trước giờ bóng lăn |
| `30` | Khoá 30 phút — cho phép dự đoán muộn hơn |
| `120` | Khoá 2 tiếng — yêu cầu dự đoán sớm hơn |
| `0` | Không khoá trước — chỉ khoá khi kickoff (không khuyến khích) |

**Cách thay đổi:**

1. Set `PICK_LOCK_MINUTES=<giá trị>` trong GitHub Actions Secrets **và** Netlify Build env vars
2. Trigger redeploy (push commit hoặc Netlify Build Hook)
3. Text hướng dẫn trên trang chủ tự cập nhật theo giá trị mới

> Ảnh hưởng: `normalize.js` (`is_locked` field trong fixtures), `pickForm.isLocked` (frontend), và text `how_to_play[1]` trên trang chủ.

---

### NO_PICK — Ghi nhận riêng khi bỏ trận

Không dùng env var — bật/tắt bằng cách đổi giá trị `points.NO_PICK` trong `src/_data/siteConfig.js`:

```js
points: {
  WIN:    1,
  PUSH:   2,
  LOSE:  -1,
  NO_PICK: -1,   // < 0 → bật; >= 0 → tắt (không tạo entry, không hiện cột "Bỏ qua")
},
```

**So sánh hành vi:**

| | `NO_PICK >= 0` (tắt) | `NO_PICK < 0` (bật) |
|---|---|---|
| User bỏ trận | Không xuất hiện trong leaderboard trận đó | `played++`, `no_picks++`, `+POINTS.NO_PICK điểm` |
| My Bets | Không thấy trận đó | Hiện "— Không dự đoán · Bỏ qua" |
| Cột "Bỏ qua" | Ẩn | Hiện (desktop) |

**Cách bật:**

1. Đổi `NO_PICK: -1` (hoặc giá trị âm khác) trong `src/_data/siteConfig.js`
2. Commit → push → Netlify tự deploy

> **Lưu ý:** Chỉ áp dụng cho user có `status: active`. User `inactive` không bị ảnh hưởng.

---

## Giới hạn của GitHub Actions cron — External Trigger

### Vấn đề

GitHub Actions scheduled cron **không đảm bảo chạy đúng giờ**. Job được queue vào đúng giờ đã định, nhưng chỉ chạy khi có runner available — có thể trễ 3–4 tiếng trong giờ cao điểm.

Thực tế đo được (2026-05-27/28):

| Scheduled (UTC) | Actual (UTC) | Lệch | ICT actual |
|---|---|---|---|
| 02:00 | 06:04 | +4h04m | 13:04 |
| 07:00 | 10:44 | +3h44m | 17:44 |
| **14:00** | **17:25** | **+3h25m** | **00:25 hôm sau** |

Lần sync 14:00 UTC (dự kiến 21:00 ICT — trước cửa sổ lock nửa đêm) thực tế chạy lúc **00:25 ICT**, tức là sau giờ lock betting. Đây là rủi ro thực tế nếu chỉ dùng GitHub cron.

### Giải pháp: External Trigger qua cron-job.org

Dùng service bên ngoài gọi vào `workflow_dispatch` endpoint của GitHub API — timing chính xác đến phút, không phụ thuộc vào tải GitHub.

#### Bước 1 — Tạo GitHub Personal Access Token

1. GitHub → **Settings → Developer settings → Personal access tokens → Fine-grained tokens**
2. **Generate new token**:
   - Token name: `cron-trigger`
   - Expiration: 1 năm (hoặc no expiration)
   - Repository access: chọn **Only select repositories** → chọn repo này
   - Permissions → **Actions** → chọn **Read and write**
3. **Generate token** → Copy token (chỉ thấy 1 lần)

#### Bước 2 — Tạo cron jobs trên cron-job.org

1. Đăng ký miễn phí tại **cron-job.org**
2. **Dashboard → CREATE CRONJOB** — tạo 3 jobs:

**Job 1 — Sáng (02:00 UTC):**
```
Title:     Data sync — sáng
URL:       https://api.github.com/repos/{owner}/{repo}/actions/workflows/daily-sync.yml/dispatches
Method:    POST
Headers:   Authorization: Bearer <token>
           Accept: application/vnd.github+json
           Content-Type: application/json
Body:      {"ref":"main"}
Schedule:  0 2 * * * (02:00 UTC mỗi ngày)
```

**Job 2 — Trưa (07:00 UTC):**
```
Title:     Data sync — trưa
Schedule:  0 7 * * * (07:00 UTC mỗi ngày)
(các thông số khác giống Job 1)
```

**Job 3 — Tối (14:00 UTC):**
```
Title:     Data sync — tối
Schedule:  0 14 * * * (14:00 UTC mỗi ngày)
(các thông số khác giống Job 1)
```

> Thay `{owner}` và `{repo}` bằng tên GitHub user và tên repo thực tế.

#### Bước 3 — Xoá schedule trong workflow (tùy chọn)

Sau khi external trigger hoạt động ổn định, có thể xoá `schedule:` trong `.github/workflows/daily-sync.yml` để tránh chạy trùng — chỉ giữ `workflow_dispatch:`. Workflow vẫn chạy được thủ công từ GitHub Actions tab.

```yaml
on:
  # schedule:  ← xoá hoặc comment out khi dùng external trigger
  #   - cron: '0 2 * * *'
  #   - cron: '0 7 * * *'
  #   - cron: '0 14 * * *'
  workflow_dispatch:
```

#### Kiểm tra hoạt động

Sau khi tạo xong, vào cron-job.org → job detail → **History** để xem log lần chạy. Job thành công khi GitHub API trả về `HTTP 204 No Content`.

---

## Kiến trúc hoàn chỉnh

```
Google Sheets (admin cập nhật kết quả)
        │
        │ GitHub Actions (07:00 & 19:00 ICT)
        ↓
  npm run fetch → npm run calculate
        │
        ↓ commit src/_data/*.json
  GitHub repo (main branch)
        │
        │ auto-deploy trigger
        ↓
  Netlify (build static site từ committed JSON)
        │
        ↓
  Site live (leaderboard cập nhật)

Browser xem live picks / community predictions:
  Browser → GET /.netlify/functions/live-picks | live-users
          → Netlify Function fetch CSV server-side từ Google Sheets (GID không lộ ra browser)
          → cache localStorage (TTL 5/15 phút)

User gửi dự đoán / đăng ký:
  Browser → POST /.netlify/functions/*
          → format validation only
          → Google Apps Script (auth + business logic)
          → Google Sheet
```

### Trách nhiệm từng layer

| Layer | Làm gì |
|---|---|
| **Netlify Function** | Validate format đầu vào · Forward sang Apps Script |
| **Apps Script** | Verify auth (`_session_hash`) · Check fixture status/lock · Upsert pick · Write Sheet |
| **Browser** | Fetch qua Netlify Functions (live-picks, live-users) · localStorage cache |

Functions **không đọc** `src/_data/*.json` và **không có** business logic.
