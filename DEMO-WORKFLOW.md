# Demo Workflow — Vui Là Chính

Hướng dẫn setup chu kỳ tự động cho môi trường demo: điền tỉ số ngẫu nhiên → sync dữ liệu → hiển thị leaderboard → reset về ban đầu cuối ngày.

---

## Tổng quan chu kỳ

```
[ICT - mỗi ngày]

08:00  runDemoUpdate()
         │ fillRandomScores(5)   → Sheet: 5 trận upcoming → finished, tỉ số random
         │ SpreadsheetApp.flush()
         └ triggerGitHubSync()   → GitHub Actions: fetch Sheet → calculate
                                    → commit src/_data/ → push
                                    → Netlify: auto-deploy (~3 phút tổng)

12:00  runDemoUpdate()            → thêm 5 trận nữa, leaderboard cập nhật

20:00  runDemoUpdate()            → thêm 5 trận nữa, leaderboard cập nhật

02:00  resetDemoData()  *(sáng hôm sau)*
         │ restoreTabFromCsv(users)    → Sheet về sample: 5 demo users
         │ restoreTabFromCsv(bets)     → Sheet về sample: 27 bets
         │ restoreTabFromCsv(fixtures) → Sheet về sample: 104 fixtures, 6 finished
         └ triggerGitHubSync()         → sync src/_data/ về state ban đầu
```

**Kết quả:** Visitor vào demo lúc 08:05–02:00 thấy leaderboard có điểm số thực.
Lúc 02:05 trở đi site về trạng thái "mới bắt đầu".

---

## Bước 1 — Script Properties

Vào Apps Script → **Project Settings → Script Properties** → thêm:

| Key | Giá trị | Bắt buộc |
|-----|---------|----------|
| `APP_SECRET` | *(cùng với Netlify)* | ✅ đã có |
| `NETLIFY_BUILD_HOOK` | URL từ Netlify Build Hooks | ✅ đã có |
| `GITHUB_TOKEN` | GitHub Fine-grained PAT (xem Bước 2) | ✅ **mới** |
| `GITHUB_REPO` | `lbngoc/vuila9` | mặc định |
| `RANDOM_SCORE_COUNT` | `5` | mặc định |
| `SEED_BRANCH` | `main` | mặc định |
| `RESET_TABS` | `users,bets,fixtures` | mặc định |

---

## Bước 2 — Tạo GitHub Token

1. GitHub → **Settings → Developer settings → Personal access tokens → Fine-grained tokens**
2. **Generate new token**:
   - Token name: `apps-script-demo`
   - Expiration: 1 năm
   - Repository access: **Only select repositories** → chọn `vuila9`
   - Permissions:
     - **Actions**: Read and write
3. Copy token → dán vào Script Properties: `GITHUB_TOKEN`

> Đây là token giống với token dùng cho cron-job.org (nếu đã setup). Có thể dùng lại cùng token.

---

## Bước 3 — Setup Triggers

Apps Script → **Triggers** (⏰ ở sidebar trái) → **+ Add Trigger** × 3:

### Trigger 1 — runDemoUpdate (sáng)
| Trường | Giá trị |
|--------|---------|
| Function to run | `runDemoUpdate` |
| Event source | Time-driven |
| Type of time based trigger | Day timer |
| Time of day | **1:00 AM – 2:00 AM** *(= 08:00–09:00 ICT)* |
| Failure notification | Immediately |

### Trigger 2 — runDemoUpdate (trưa)
| Trường | Giá trị |
|--------|---------|
| Function to run | `runDemoUpdate` |
| Event source | Time-driven |
| Type | Day timer |
| Time of day | **5:00 AM – 6:00 AM** *(= 12:00–13:00 ICT)* |

### Trigger 3 — runDemoUpdate (tối)
| Trường | Giá trị |
|--------|---------|
| Function to run | `runDemoUpdate` |
| Event source | Time-driven |
| Type | Day timer |
| Time of day | **1:00 PM – 2:00 PM** *(= 20:00–21:00 ICT)* |

### Trigger 4 — resetDemoData (sáng sớm)
| Trường | Giá trị |
|--------|---------|
| Function to run | `resetDemoData` |
| Event source | Time-driven |
| Type | Day timer |
| Time of day | **7:00 PM – 8:00 PM** *(= 02:00–03:00 ICT hôm sau)* |

> Apps Script triggers dùng timezone của Script Project.  
> Vào **Project Settings → Time zone** → đặt `Asia/Ho_Chi_Minh`.

---

## Bước 4 — Test thủ công

Sau khi setup, chạy thử từng function trước khi để tự động:

```
Apps Script editor → dropdown → chọn function → ▶ Run
```

**Thứ tự test:**

1. **`fillRandomScores`** → kiểm tra Sheet: 5 trận upcoming đổi thành finished có tỉ số
2. **`triggerGitHubSync`** → vào GitHub Actions tab xác nhận workflow đang chạy
3. Đợi ~3 phút → mở https://vuila9.netlify.app/leaderboard → thấy điểm số
4. **`resetDemoData`** → kiểm tra Sheet về sample state, GitHub Actions chạy lại
5. Đợi ~3 phút → site về trạng thái ban đầu

---

## Cấu hình tùy chỉnh

### Thay đổi số trận random mỗi lần

Script Properties → `RANDOM_SCORE_COUNT` = `3` (hoặc số bất kỳ)

### Chỉ reset bets (giữ nguyên users và fixtures)

Script Properties → `RESET_TABS` = `bets`

### Dùng sample data từ branch khác

Script Properties → `SEED_BRANCH` = `dev`

### Chạy 4 lần/ngày thay vì 3

Thêm Trigger 5 cho `runDemoUpdate` lúc **3:00 AM – 4:00 AM** UTC (= 10:00 ICT).

---

## Luồng dữ liệu chi tiết

```
Apps Script fillRandomScores()
  └→ Google Sheet: fixtures tab
       └→ triggerGitHubSync() → GitHub API: workflow_dispatch
            └→ GitHub Actions: daily-sync.yml
                 ├─ fetch-sheet.js   (đọc Sheet CSV)
                 ├─ normalize.js     (hash passcodes, validate)
                 ├─ calculate-results.js  (tính WIN/PUSH/LOSE)
                 ├─ build-leaderboard.js  (xếp hạng)
                 └─ export-json.js → commit src/_data/*.json → push
                      └→ Netlify: auto-deploy (detect new commit)
                           └→ https://vuila9.netlify.app ← visible ~3 min
```

---

## Monitoring

| Nơi | Xem gì |
|-----|--------|
| Apps Script → Executions | Log từng lần trigger chạy |
| GitHub → Actions tab | Trạng thái daily-sync runs |
| Netlify → Deploys | Deploy log và thời gian build |
| Sheet → Version history | Lịch sử thay đổi dữ liệu |

---

## Troubleshooting

**`triggerGitHubSync` log "Failed HTTP 401"**  
→ Token hết hạn hoặc sai. Tạo lại token, cập nhật Script Properties.

**`triggerGitHubSync` log "Failed HTTP 404"**  
→ Sai `GITHUB_REPO` hoặc workflow file name. Kiểm tra `GITHUB_REPO` = `lbngoc/vuila9`.

**`fillRandomScores` log "No upcoming fixtures"**  
→ Tất cả fixtures đã `finished`. Chạy `resetDemoData()` trước để khôi phục.

**Site không cập nhật sau 5 phút**  
→ Vào GitHub Actions tab xem workflow có chạy không. Nếu không có run mới → token lỗi.  
→ Trigger thủ công: GitHub → Actions → Daily data sync → Run workflow.

**Apps Script trigger không chạy đúng giờ**  
→ Kiểm tra **Project Settings → Time zone** = `Asia/Ho_Chi_Minh`.  
→ Apps Script time triggers có thể trễ ±15 phút — bình thường.
