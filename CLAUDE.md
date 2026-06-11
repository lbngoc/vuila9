# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

**Vui Là Chính (vuila9)** — static football prediction game for <50 users. Google Sheets = admin/database, Eleventy = static frontend, Netlify = hosting + serverless functions, GitHub Actions = daily data sync.

Live demo: https://vuila9.netlify.app

## Commands

```bash
npm run build       # full build: pipeline + TailwindCSS + 11ty
npm run dev         # local dev server (Eleventy + TailwindCSS watch, port 8080)
npm run pipeline    # fetch CSVs + full pipeline (không build CSS/11ty)
npm run fetch       # fetch CSVs from Google Sheets only
npm run calculate   # normalize → calculate → leaderboard → export JSON (không fetch)
```

Build target: <30 seconds. Publish directory: `dist`. Functions directory: `netlify/functions`.

## Folder Structure

```
/.github/workflows  # daily-sync.yml — fetch + calculate + commit src/_data/
/data/raw           # fetched CSVs — gitignored, regenerated each sync
/data/generated     # intermediate JSON — gitignored, temp workspace
/data/sample        # sample CSVs cho local dev (users, fixtures, picks)
/scripts            # fetch-sheet, normalize, calculate-results, build-leaderboard, export-json
                    # create-user.js — admin utility (không thuộc pipeline)
/netlify/functions  # submit-pick.js, register.js
/src
  /_data            # siteConfig.js (central config) + sheetConfig.js (CSV URLs) + committed JSON snapshot
  /_includes        # base.njk layout
  /pages            # Nunjucks page templates
  /assets/js        # app.js — Alpine.js components (appState, loginForm, myPicksPage)
  /assets/css       # TailwindCSS
/SETUP.md           # full setup & deploy guide
/TESTING.md         # QA regression checklist
/google-apps-script.js  # Google Apps Script webhook (deploy to Sheet)
```

## Architecture

```
Google Sheets (admin cập nhật)
  ↓ GitHub Actions (09:00, 14:00 & 21:00 ICT)
  fetch CSV → calculate → commit src/_data/ → push
  ↓ triggers Netlify auto-deploy
  Netlify builds static site from committed JSON

User xem dữ liệu live (picks, community predictions):
  Browser → fetch CSV trực tiếp từ Google Sheets (public) → cache localStorage
  (URLs inject qua sheetConfig.js → window.__SHEET_PICKS_URL__, __SHEET_USERS_URL__)

User gửi dự đoán / đăng ký:
  Browser → Netlify Function (format validation only)
          → Google Apps Script (auth + business logic)
          → Google Sheet
```

All scoring computed **at build time**. Sheet credentials live only in GitHub Actions secrets.

## Data Access Rules

Ba lớp với trách nhiệm tách biệt — không được trộn lẫn:

| Layer | Đọc dữ liệu | Ghi dữ liệu | Business logic |
|---|---|---|---|
| **Static build** | `src/_data/*.json` (committed snapshot) | `src/_data/*.json` via pipeline | Scoring, leaderboard |
| **Browser** | Fetch CSV trực tiếp từ Google Sheets public URL + cache localStorage | Không | Hiển thị, merge picks |
| **Netlify Function** | Không đọc data nào | Forward sang Apps Script | Format validation only |
| **Apps Script** | Google Sheet (authoritative) | Google Sheet | Auth, fixture check, upsert |

**Quy tắc cụ thể:**

- Netlify Functions **không được** dùng `fs.readFileSync`, `loadData()`, hay bất kỳ cơ chế nào để đọc `src/_data/*.json`. Không có `included_files` trong `netlify.toml`.
- Netlify Functions chỉ validate format (required fields, regex, enum) rồi forward sang Apps Script.
- Auth (`_session_hash` vs `passcode_hash`), fixture lock check, và upsert lookup đều do **Apps Script** thực hiện — nơi có data thực tế.
- Để pre-check duplicate username ở `register.js`, fetch CSV `https://docs.google.com/spreadsheets/d/${GOOGLE_SHEET_ID}/export?format=csv&gid=${USERS_GID}` với timeout 3s. Đây là fast-fail; Apps Script vẫn làm authoritative check.
- Browser fetch CSV từ Sheet (đã public Viewer) để hiển thị community picks và live picks, cache localStorage với TTL 5–15 phút.

## Data Flow

1. `scripts/fetch-sheet.js` — downloads Sheets tabs as CSV → `data/raw/`; skips gracefully if `GOOGLE_SHEET_ID` not set (dùng `data/sample/` cho local dev)
2. `scripts/normalize.js` — CSV → JSON; hashes passcodes; includes ALL users
3. `scripts/calculate-results.js` — resolves outcomes; imports `POINTS` từ `src/_data/siteConfig.js`
4. `scripts/build-leaderboard.js` — per-user ranking: points → wins → win_rate → username
5. `scripts/export-json.js` — wraps JSON với `generated_at`, copies `data/generated/` → `src/_data/` for Eleventy

**Local dev với sample data:** `data/raw/` gitignored. Chạy `npm run calculate` (bỏ qua fetch) để dùng `data/sample/*.csv` sẵn có.

## Central Config: `src/_data/siteConfig.js`

Single source of truth for scoring, site name, storage prefix, how-to-play copy. Both pipeline scripts and Eleventy templates read from this file (`require()` and `siteConfig.*` in templates).

```js
site_name: 'Vui Là Chính'
storage_prefix: 'vuila9'   // localStorage key prefix
points: { WIN: 3, PUSH: 0, LOSE: 0 }  // change here to adjust scoring
```

## Sheet Config: `src/_data/sheetConfig.js`

Injects Google Sheets CSV URLs for client-side live data fetch. Populated only when `GOOGLE_SHEET_ID` + GID env vars are present. Falls back to empty strings (templates guard with `{% if sheetConfig.picks_url %}`).

```js
picks_url:          // CSV export URL cho tab picks
users_url:         // CSV export URL cho tab users
fixtures_tab_url:  // link trực tiếp vào tab Fixtures (dùng trong header trang fixtures)
picks_tab_url:      // link trực tiếp vào tab Bets (dùng trong header trang leaderboard)
```

Templates inject URLs vào `window.__SHEET_PICKS_URL__` và `window.__SHEET_USERS_URL__` cho Alpine.js `fetchLivePicks()` / `fetchLiveUsers()`.

## Admin Utility: `scripts/create-user.js`

Tạo CSV row sẵn sàng paste vào Google Sheet — **không thuộc pipeline**, dùng thủ công:

```bash
node scripts/create-user.js <username> <display_name> <passcode> [id]
# Ví dụ: node scripts/create-user.js demo "Demo User" mypassword123
```

Output là 1 dòng CSV với `passcode_hash` đã hash — paste vào tab users, set `status=active`.

## Scoring Rules

| Result | Default | When |
|---|---|---|
| WIN | +3 | correct pick |
| PUSH | 0 | exact handicap boundary (home/away picks, whole-ball only) |
| LOSE | 0 | wrong pick — change to -1 to penalise |

`adj = (result_home - result_away) + handicap`
- `adj > 0` → home WIN / away LOSE
- `adj = 0` → home PUSH / away PUSH / draw-pick WIN
- `adj < 0` → home LOSE / away WIN

Draw pick: WIN if `adj === 0`, LOSE otherwise — never PUSH.

### Bet lock (PICK_LOCK_MINUTES)

Dự đoán bị khoá `PICK_LOCK_MINUTES` phút trước `kickoff_at` (default: 60).
Áp dụng ở 2 nơi:
- **normalize.js** — tính `is_locked` field trong `fixtures.json` (dùng tại build time)
- **pickForm.isLocked** (frontend) — đọc `window.PICK_LOCK_MINUTES` được inject từ `siteConfig.pick_lock_minutes`

Thay đổi giá trị: set env var `PICK_LOCK_MINUTES` trong GitHub Actions **và** Netlify Build, sau đó redeploy.

### No-pick point (points.NO_PICK)

Khi `points.NO_PICK < 0`, `calculate-results.js` thêm entry synthetic cho mỗi active user bỏ qua trận finished:
- `pick_type: null`, `result: 'NO_PICK'`, `points: POINTS.NO_PICK`, `_no_pick: true`
- Entry này xuất hiện trong `picks.json` → ảnh hưởng leaderboard (cột "Bỏ qua") và trang My Picks (hiện "— Không dự đoán · Bỏ qua")
- Giá trị điểm hardcoded tại `siteConfig.points.NO_PICK` trong `src/_data/siteConfig.js`
- Chỉ áp dụng user có `status: 'active'`
- Bật/tắt: `NO_PICK < 0` → bật; `NO_PICK >= 0` → tắt (không tạo entry, không hiện cột)

## Auth Flow

- Passcode stored as `sha256(username + passcode)` — `normalize.js` hashes raw passcode, or uses pre-computed `passcode_hash` column directly
- Login: client-side SHA-256 via Web Crypto API; checks `status === 'active'`
- Session: `{ user_id, username, display_name, _ph }` in localStorage under `{STORAGE_PREFIX}_user`
- Bet submission: `_session_hash` sent instead of raw passcode

## Pages

| URL | Template | Notes |
|---|---|---|
| `/` | index.njk | Leaderboard preview, upcoming fixtures, how-to-play |
| `/fixtures/` | fixtures.njk | Bet form: countdown timer, hover colors, contextual tips |
| `/leaderboard/` | leaderboard.njk | Full rankings, scoring legend from siteConfig.points |
| `/login/` | login.njk | Client-side auth, checks status=active |
| `/my-picks/` | my-picks.njk | Personal pick history (localStorage session) |
| `/register/` | register.njk | New account → Netlify function → Apps Script → status per `REGISTER_STATUS` (default: `active`) |

## Netlify Functions

- **`submit-pick.js`** — rate-limit · honeypot · format validation (required fields, pick_type enum) · forward `{username, fixture_id, pick_type, _session_hash}` to Apps Script. Auth và fixture check do Apps Script xử lý.
- **`register.js`** — rate-limit · honeypot · format validation (username regex, passcode length) · fetch users CSV để pre-check duplicate username · hash passcode · forward `action:'register'` to Apps Script.

## Key Implementation Details

- **Fixture ID format**: `xxx-yyy` (team codes, e.g., `ARG-AUT`) — không dùng numeric ID
- **Countdown**: `_now: Date.now()` + `setInterval(60s)` per `pickForm` Alpine instance
- **Pick hover colors**: home=red, draw=yellow, away=blue via Tailwind `group-hover`
- **Draw disabled**: `!Number.isInteger(Math.abs(parseFloat(handicap)))` — PUSH impossible for half-ball
- **Tip text**: `tip` getter explains when each pick wins using `minWin`, `maxHome`, `pushAt`
- **Upsert**: Apps Script tự tìm existing pick theo `(user_id, fixture_id)` — không cần `existing_pick_id` từ client
- **Handicap display**: `| replace("-", "") | replace(".0", "")` strips sign and trailing decimal
- **Live data**: `fetchLivePicks()` + `fetchLiveUsers()` — cache localStorage TTL 5/15 phút; fallback graceful nếu không có `sheetConfig` URLs

## Environment Variables

```
# Netlify (Functions):
GOOGLE_SCRIPT_URL=   # Apps Script webhook
APP_SECRET=          # shared secret với Apps Script
GOOGLE_SHEET_ID=     # để register.js fetch users CSV (pre-check duplicate)
USERS_GID=           # GID tab users

# GitHub Actions secrets (data sync):
GOOGLE_SHEET_ID=
USERS_GID=
FIXTURES_GID=
PICKS_GID=

# Game rules (GitHub Actions + Netlify Build — đọc tại build time):
PICK_LOCK_MINUTES=    # phút trước kickoff thì khoá dự đoán (default: 60)
                     # Ảnh hưởng: normalize.js (is_locked field), frontend pickForm.isLocked
# NO_PICK: không có env var — set points.NO_PICK < 0 trong siteConfig.js để bật feature

# Demo mode (Netlify Build env):
DEMO_MODE=           # 'true' → hiện banner demo ở cuối mọi trang: lịch cập nhật kết quả
                     # và reset dữ liệu giờ Việt Nam (default: false) — chỉ hiển thị UI
DEMO_UPDATE_TIME=    # Giờ ICT các lần update kết quả, phân cách dấu phẩy (default: '08:00,12:00,20:00')
                     # Chỉ ảnh hưởng text banner — phải khớp Apps Script trigger schedule
DEMO_RESET_TIME=     # Giờ ICT reset demo (default: '02:00') — hỗ trợ nhiều khung giờ bằng dấu ','

# Hiển thị (Netlify Build env):
PUBLIC_MODE=         # 'false' → ẩn link "Dữ liệu gốc" đến Google Sheet ở fixtures + leaderboard
                     # (default: true)

# Tuỳ chọn:
TIMEZONE=            # mặc định: Asia/Ho_Chi_Minh

# Open source / audit links (Netlify Build env — render vào template lúc build):
GITHUB_URL=          # link lịch sử data sync → commits/main?path=src%2F_data (footer)
```

Full setup: `SETUP.md`
