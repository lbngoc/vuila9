/**
 * Google Apps Script — Vui Là Chính (vuila9) webhook
 *
 * Cách deploy:
 * 1. Mở Google Sheet → Extensions → Apps Script
 * 2. Paste toàn bộ file này vào Code.gs
 * 3. Project Settings → Script Properties → thêm:
 *    APP_SECRET        = (cùng giá trị với APP_SECRET trong Netlify env vars)
 *    NETLIFY_BUILD_HOOK = URL từ Netlify Build Hooks
 *    PICK_LOCK_MINUTES  = số phút trước kickoff để khoá dự đoán (mặc định: 60)
 *                        ← phải khớp với giá trị PICK_LOCK_MINUTES trong Netlify Build env
 *    REGISTER_STATUS   = trạng thái user sau khi đăng ký: 'active' hoặc 'inactive'
 *                        (mặc định: 'active') — đặt 'inactive' nếu muốn admin duyệt thủ công
 * 4. Deploy → New deployment → Web app:
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 5. Copy URL → lưu vào GOOGLE_SCRIPT_URL trong Netlify env vars
 */

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);

    const expected = PropertiesService.getScriptProperties().getProperty('APP_SECRET');
    if (!expected || payload._secret !== expected) {
      return jsonResponse({ error: 'Unauthorized', code: 'UNAUTHORIZED', status: 401 });
    }

    if (payload.action === 'register')         return handleRegister(payload);
    if (payload.action === 'update_display_name') return handleUpdateDisplayName(payload);
    return handlePick(payload);

  } catch (err) {
    console.error(err);
    return jsonResponse({ error: err.message, code: 'INTERNAL_ERROR', status: 500 });
  }
}

// ── Helpers ────────────────────────────────────────────────────────────

function findUser(ss, username) {
  const sheet = ss.getSheetByName('users');
  if (!sheet) return null;
  const data = sheet.getDataRange().getValues();
  // columns: id(0) username(1) display_name(2) passcode(3) passcode_hash(4) created_at(5) status(6)
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][1]).toLowerCase() === username.toLowerCase()) {
      const storedHash  = String(data[i][4]).trim();
      const rawPasscode = String(data[i][3]).trim();
      const uname       = String(data[i][1]).toLowerCase();
      // Mirror normalize.js logic: prefer stored passcode_hash; fall back to computing from
      // raw passcode (supports admin-created users who have passcode but no passcode_hash column)
      const passcode_hash = storedHash || computeSHA256(uname + rawPasscode);
      return {
        user_id:  String(data[i][0]),
        username: String(data[i][1]),
        passcode_hash,
        status:   String(data[i][6]),
      };
    }
  }
  return null;
}

// SHA-256 hex digest — mirrors sha256() in app.js and hashPasscode() in normalize.js
function computeSHA256(message) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256, message, Utilities.Charset.UTF_8
  );
  return bytes.map(b => ('0' + (b & 0xFF).toString(16)).slice(-2)).join('');
}

function findFixture(ss, fixture_id) {
  const sheet = ss.getSheetByName('fixtures');
  if (!sheet) return null;
  const data = sheet.getDataRange().getValues();
  // columns: fixture_id(0) league(1) kickoff_at(2) home_team(3) away_team(4) handicap(5) status(6) result_home(7) result_away(8)
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === fixture_id) {
      return {
        fixture_id: String(data[i][0]),
        kickoff_at: String(data[i][2]),
        status:     String(data[i][6]),
      };
    }
  }
  return null;
}

// ── Pick submission ────────────────────────────────────────────────────

function handlePick(payload) {
  if (!payload.username || !payload.fixture_id || !payload.pick_type || !payload._session_hash) {
    return jsonResponse({ error: 'Thiếu thông tin bắt buộc.', code: 'MISSING_FIELDS', status: 400 });
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // 1. Auth — lookup user, verify session hash, check active
  const user = findUser(ss, payload.username);
  if (!user) {
    return jsonResponse({ error: 'Username không tồn tại.', code: 'USER_NOT_FOUND', status: 401 });
  }
  if (user.status !== 'active') {
    return jsonResponse({ error: 'Tài khoản chưa được kích hoạt. Liên hệ admin.', code: 'INACTIVE_USER', status: 403 });
  }
  if (user.passcode_hash !== payload._session_hash) {
    return jsonResponse({ error: 'Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại.', code: 'INVALID_SESSION', status: 401 });
  }

  // 2. Fixture validation — check exists, not finished, not locked
  const fixture = findFixture(ss, payload.fixture_id);
  if (!fixture) {
    return jsonResponse({ error: 'Trận đấu không tồn tại.', code: 'FIXTURE_NOT_FOUND', status: 404 });
  }
  if (fixture.status === 'finished') {
    return jsonResponse({ error: 'Trận đấu đã kết thúc.', code: 'MATCH_FINISHED', status: 400 });
  }
  const lockMinutes = parseInt(PropertiesService.getScriptProperties().getProperty('PICK_LOCK_MINUTES')) || 60;
  const kickoffMs   = new Date(fixture.kickoff_at).getTime();
  if (Date.now() >= kickoffMs - lockMinutes * 60 * 1000) {
    return jsonResponse({ error: `Đã đóng nhận dự đoán (khoá trước ${lockMinutes} phút khi đá).`, code: 'LOCKED', status: 400 });
  }

  // 3. Upsert — find existing pick by (user_id, fixture_id)
  const picksSheet = ss.getSheetByName('picks');
  if (!picksSheet) return jsonResponse({ error: 'Sheet "picks" not found', code: 'INTERNAL_ERROR', status: 500 });

  const picksData = picksSheet.getDataRange().getValues();
  // columns: pick_id(0) created_at(1) user_id(2) fixture_id(3) pick_type(4)
  for (let i = 1; i < picksData.length; i++) {
    if (String(picksData[i][2]) === user.user_id && String(picksData[i][3]) === payload.fixture_id) {
      const existingId = String(picksData[i][0]);
      picksSheet.getRange(i + 1, 2).setValue(payload.created_at);
      picksSheet.getRange(i + 1, 5).setValue(payload.pick_type);
      return jsonResponse({ success: true, pick_id: existingId, updated: true });
    }
  }

  // 4. Append new pick
  const stamp  = Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyyMMdd_HHmmss');
  const rand   = Math.random().toString(36).slice(2, 6);
  const pick_id = `pick_${stamp}_${rand}`;

  picksSheet.appendRow([pick_id, payload.created_at, user.user_id, payload.fixture_id, payload.pick_type]);
  return jsonResponse({ success: true, pick_id });
}

// ── Update display name ────────────────────────────────────────────────

function handleUpdateDisplayName(payload) {
  if (!payload.username || !payload._session_hash || !payload.display_name) {
    return jsonResponse({ error: 'Thiếu thông tin bắt buộc.', code: 'MISSING_FIELDS', status: 400 });
  }

  const ss   = SpreadsheetApp.getActiveSpreadsheet();
  const user = findUser(ss, payload.username);
  if (!user)
    return jsonResponse({ error: 'Username không tồn tại.', code: 'USER_NOT_FOUND', status: 401 });
  if (user.status !== 'active')
    return jsonResponse({ error: 'Tài khoản chưa được kích hoạt.', code: 'INACTIVE_USER', status: 403 });
  if (user.passcode_hash !== payload._session_hash)
    return jsonResponse({ error: 'Phiên đăng nhập không hợp lệ.', code: 'INVALID_SESSION', status: 401 });

  const sheet = ss.getSheetByName('users');
  const data  = sheet.getDataRange().getValues();
  // columns: id(0) username(1) display_name(2) ...
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === user.user_id) {
      sheet.getRange(i + 1, 3).setValue(payload.display_name);
      return jsonResponse({ success: true });
    }
  }
  return jsonResponse({ error: 'Không tìm thấy người dùng.', code: 'USER_NOT_FOUND', status: 404 });
}

// ── User registration ──────────────────────────────────────────────────

function handleRegister(payload) {
  if (!payload.username || !payload.display_name || !payload.passcode_hash) {
    return jsonResponse({ error: 'Thiếu thông tin bắt buộc.', code: 'MISSING_FIELDS', status: 400 });
  }

  const props = PropertiesService.getScriptProperties();
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('users');
  if (!sheet) return jsonResponse({ error: 'Sheet "users" not found', code: 'INTERNAL_ERROR', status: 500 });

  // Authoritative duplicate check
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][1]).toLowerCase() === payload.username.toLowerCase()) {
      return jsonResponse({ error: 'Username đã được sử dụng.', code: 'DUPLICATE_USERNAME', status: 400 });
    }
  }

  const stamp          = Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyyMMdd_HHmmss');
  const rand           = Math.random().toString(36).slice(2, 6);
  const user_id        = `u_${stamp}_${rand}`;
  const allowedStatus  = ['active', 'inactive'];
  const registerStatus = allowedStatus.includes(props.getProperty('REGISTER_STATUS'))
    ? props.getProperty('REGISTER_STATUS')
    : 'active';

  // columns: id, username, display_name, passcode (empty), passcode_hash, created_at, status
  sheet.appendRow([user_id, payload.username, payload.display_name, '', payload.passcode_hash, new Date().toISOString(), registerStatus]);
  return jsonResponse({ success: true, status: registerStatus });
}

// ── Netlify rebuild trigger ────────────────────────────────────────────

function onResultUpdate(e) {
  const sheet = e.source.getActiveSheet();
  if (sheet.getName() !== 'fixtures') return;
  const col     = e.range.getColumn();
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  if (headers[col - 1] === 'result_home' || headers[col - 1] === 'result_away') {
    triggerNetlifyBuild();
  }
}

function triggerNetlifyBuild() {
  const url = PropertiesService.getScriptProperties().getProperty('NETLIFY_BUILD_HOOK');
  if (!url) return;
  UrlFetchApp.fetch(url, { method: 'post', payload: '' });
  console.log('Netlify build triggered.');
}

// Gọi GitHub Actions workflow_dispatch để chạy daily-sync
// (fetch Sheet → calculate → commit src/_data/ → push → Netlify auto-deploy)
function triggerGitHubSync() {
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty('GITHUB_TOKEN');
  const repo  = props.getProperty('GITHUB_REPO') || 'lbngoc/vuila9';

  if (!token) { console.warn('[triggerGitHubSync] GITHUB_TOKEN not set — skipping'); return; }

  const res = UrlFetchApp.fetch(
    `https://api.github.com/repos/${repo}/actions/workflows/daily-sync.yml/dispatches`,
    {
      method: 'post',
      headers: {
        'Authorization':        `Bearer ${token}`,
        'Accept':               'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type':         'application/json',
      },
      payload:           JSON.stringify({ ref: 'main' }),
      muteHttpExceptions: true,
    }
  );
  const code = res.getResponseCode();
  if (code === 204) {
    console.log('[triggerGitHubSync] Dispatched — GitHub Actions will fetch, calculate, commit, rebuild Netlify.');
  } else {
    console.error(`[triggerGitHubSync] Failed HTTP ${code}: ${res.getContentText()}`);
  }
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.TEXT);
}

// ── Demo: random scores + sync ────────────────────────────────────────────
//
// fillRandomScores(): lấy top X trận upcoming gần nhất, điền tỉ số ngẫu nhiên
//   Script Properties:
//     RANDOM_SCORE_COUNT = 5  → số trận cần điền (default: 5)
//
// runDemoUpdate(): fillRandomScores → flush → triggerGitHubSync
//   Đây là function gắn với time trigger để cập nhật demo tự động.
//
function fillRandomScores() {
  const props = PropertiesService.getScriptProperties();
  const count = parseInt(props.getProperty('RANDOM_SCORE_COUNT')) || 5;

  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('fixtures');
  if (!sheet) { console.error('[fillRandomScores] fixtures sheet not found'); return 0; }

  const data = sheet.getDataRange().getValues();
  // columns: fixture_id(0) league(1) kickoff_at(2) … status(6) result_home(7) result_away(8)

  const upcoming = [];
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][6]).trim() === 'upcoming' && data[i][2]) {
      upcoming.push({ rowIdx: i + 1, kickoff: new Date(String(data[i][2])) });
    }
  }
  upcoming.sort((a, b) => a.kickoff - b.kickoff);  // sắp xếp sớm nhất trước

  const toScore = upcoming.slice(0, count);
  if (toScore.length === 0) {
    console.log('[fillRandomScores] No upcoming fixtures — nothing to score');
    return 0;
  }

  const ts   = Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd HH:mm');
  const note = `runDemoUpdate - ${ts}`;

  for (const f of toScore) {
    // Tỉ số thực tế: thường 0-3 mỗi đội, có trọng số về trận ít bàn
    const home = weightedRandom([0, 1, 2, 3], [25, 40, 25, 10]);
    const away = weightedRandom([0, 1, 2, 3], [30, 40, 20, 10]);
    sheet.getRange(f.rowIdx, 7).setValue('finished');  // status
    sheet.getRange(f.rowIdx, 8).setValue(home);         // result_home
    sheet.getRange(f.rowIdx, 9).setValue(away);         // result_away
    sheet.getRange(f.rowIdx, 10).setValue(note);        // note
  }

  console.log(`[fillRandomScores] Scored ${toScore.length} fixtures (top ${count} upcoming)`);
  return toScore.length;
}

// Random có trọng số: values=[0,1,2,3], weights=[25,40,25,10] → %
function weightedRandom(values, weights) {
  const total = weights.reduce((s, w) => s + w, 0);
  let r = Math.random() * total;
  for (let i = 0; i < values.length; i++) {
    r -= weights[i];
    if (r <= 0) return values[i];
  }
  return values[values.length - 1];
}

// Kết hợp: điền tỉ số → flush → trigger GitHub Actions sync
// Gắn vào time trigger để chạy tự động (ví dụ: 08:00 và 15:00 ICT)
function runDemoUpdate() {
  const scored = fillRandomScores();
  if (scored === 0) { console.log('[runDemoUpdate] Nothing scored — skipping sync'); return; }
  SpreadsheetApp.flush();   // đảm bảo Sheet ghi xong trước khi GitHub Actions fetch
  triggerGitHubSync();
  console.log('[runDemoUpdate] Done — results visible on site in ~3 minutes');
}

// ── Demo reset ────────────────────────────────────────────────────────────
//
// Khôi phục Sheet về đúng trạng thái demo ban đầu (data/sample/ trong repo),
// sau đó trigger GitHub Actions sync để src/_data/ cũng được reset.
//
// Seed data được fetch trực tiếp từ GitHub raw URL — luôn dùng đúng version
// đang có trên branch main.
//
// Cấu hình (Script Properties):
//   SEED_BRANCH = main               → branch chứa sample data (default: main)
//   RESET_TABS  = users,picks,fixtures → danh sách tab cần reset (default: tất cả 3)
//
// Cách dùng:
//   A. Thủ công : Apps Script editor → chọn resetDemoData → Run
//   B. Tự động  : Triggers → Add Trigger → resetDemoData → Time-driven
//                 → Day timer → 23:00–00:00
//
function resetDemoData() {
  const props  = PropertiesService.getScriptProperties();
  const repo = props.getProperty('GITHUB_REPO') || 'lbngoc/vuila9';
  const branch = props.getProperty('SEED_BRANCH') || 'main';
  const tabs   = (props.getProperty('RESET_TABS') || 'users,picks,fixtures').split(',').map(s => s.trim());

  const BASE_URL = `https://raw.githubusercontent.com/${repo}/${branch}/data/sample`;
  const log = [];

  for (const tab of tabs) {
    try {
      const result = restoreTabFromCsv(tab, `${BASE_URL}/${tab}.csv`);
      log.push(result);
    } catch (err) {
      log.push(`${tab}: ERROR — ${err.message}`);
      console.error(`[resetDemoData] ${tab} failed:`, err);
    }
  }

  SpreadsheetApp.flush();
  triggerGitHubSync();   // sync lại src/_data/ về sample state, Netlify auto-rebuild
  log.push('GitHub sync triggered');
  console.log('[resetDemoData] ' + new Date().toISOString() + ' — ' + log.join(' | '));
}

// Fetch CSV từ URL, ghi đè toàn bộ nội dung tab (giữ formatting)
function restoreTabFromCsv(tabName, csvUrl) {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(tabName);
  if (!sheet) throw new Error(`Tab "${tabName}" not found in spreadsheet`);

  const res = UrlFetchApp.fetch(csvUrl, { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) {
    throw new Error(`HTTP ${res.getResponseCode()} fetching ${csvUrl}`);
  }

  // Utilities.parseCsv() xử lý quoted fields đúng RFC 4180
  const rows = Utilities.parseCsv(res.getContentText());
  if (!rows || rows.length === 0) throw new Error('Empty CSV response');

  sheet.clearContents();  // xoá values, giữ formatting/conditional rules
  sheet.getRange(1, 1, rows.length, rows[0].length).setValues(rows);

  return `${tabName}: restored ${rows.length - 1} rows`;
}

// ── Test (chạy thủ công trong Apps Script editor) ──────────────────────

function testSubmitBet() {
  const mockEvent = {
    postData: {
      contents: JSON.stringify({
        _secret:       PropertiesService.getScriptProperties().getProperty('APP_SECRET'),
        username:      'vuila9',
        fixture_id:    'ARG-AUT',
        pick_type:     'home',
        _session_hash: 'REPLACE_WITH_SESSION_HASH',
        created_at:    new Date().toISOString(),
      }),
    },
  };
  console.log(doPost(mockEvent).getContent());
}

function testRegister() {
  const mockEvent = {
    postData: {
      contents: JSON.stringify({
        _secret:       PropertiesService.getScriptProperties().getProperty('APP_SECRET'),
        action:        'register',
        username:      'vuila9',
        display_name:  'Làm Mẫu Thôi',
        passcode_hash: '123456',
        created_at:    new Date().toISOString(),
      }),
    },
  };
  console.log(doPost(mockEvent).getContent());
}
