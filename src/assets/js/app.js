// Alpine.js components for Vui Là Chính (vuila9)

const _STORAGE        = window.STORAGE_PREFIX || 'vuila9';
const _KEY            = _STORAGE + '_user';
const _PENDING_KEY    = _STORAGE + '_pending_picks';
const _LIVE_CACHE_KEY = _STORAGE + '_live_picks';
const _USERS_CACHE_KEY = _STORAGE + '_live_users';
const _LIVE_PICKS_TTL  =  5 * 60 * 1000;  //  5 min — community picks refresh cadence
const _LIVE_USERS_TTL = 15 * 60 * 1000;  // 15 min — authenticate() luôn force-fresh nên TTL này chỉ dùng cho background calls

async function sha256(message) {
  const data = new TextEncoder().encode(message);
  const buf  = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── Live picks helpers ─────────────────────────────────────────────────

function parseCSVRow(line) {
  const cols = []; let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { inQ = !inQ; }
    else if (c === ',' && !inQ) { cols.push(cur.trim()); cur = ''; }
    else cur += c;
  }
  cols.push(cur.trim());
  return cols;
}

function parseCSV(text) {
  const [header, ...rows] = text.trim().split('\n');
  const keys = parseCSVRow(header);
  return rows
    .filter(r => r.trim())
    .map(row => Object.fromEntries(parseCSVRow(row).map((v, i) => [keys[i], v || ''])));
}

let _liveBetsFlight = null;  // dedup concurrent fetches from N fixture cards

async function fetchLivePicks() {
  try {
    const cached = JSON.parse(localStorage.getItem(_LIVE_CACHE_KEY) || 'null');
    if (cached && Date.now() - cached.fetched_at < _LIVE_PICKS_TTL) return cached.data;
  } catch {}

  const url = window.__SHEET_PICKS_URL__;
  if (!url) return null;

  // Return in-flight promise if one is already running (prevents N concurrent CSV fetches)
  if (_liveBetsFlight) return _liveBetsFlight;

  _liveBetsFlight = (async () => {
    try {
      const res  = await fetch(url);
      const text = await res.text();
      const data = parseCSV(text);
      localStorage.setItem(_LIVE_CACHE_KEY, JSON.stringify({ fetched_at: Date.now(), data }));
      return data;
    } catch {
      try { return JSON.parse(localStorage.getItem(_LIVE_CACHE_KEY) || 'null')?.data || null; }
      catch { return null; }
    } finally {
      _liveBetsFlight = null;
    }
  })();
  return _liveBetsFlight;
}

// ── Live users helpers ────────────────────────────────────────────────

// force=true: bỏ qua cache, luôn fetch mới (dùng khi login để kiểm tra status thực tế)
async function fetchLiveUsers(force = false) {
  if (!force) {
    try {
      const cached = JSON.parse(localStorage.getItem(_USERS_CACHE_KEY) || 'null');
      if (cached && Date.now() - cached.fetched_at < _LIVE_USERS_TTL) return cached.data;
    } catch {}
  }

  const url = window.__SHEET_USERS_URL__;
  if (!url) return null;

  try {
    const res  = await fetch(url);
    const text = await res.text();
    const data = parseCSV(text);
    localStorage.setItem(_USERS_CACHE_KEY, JSON.stringify({ fetched_at: Date.now(), data }));
    return data;
  } catch {
    // Network error: trả về cached cũ nếu có
    try { return JSON.parse(localStorage.getItem(_USERS_CACHE_KEY) || 'null')?.data || null; }
    catch { return null; }
  }
}

// Xoá cache users (gọi sau đăng ký để lần login tiếp thấy user mới)
function invalidateUsersCache() {
  try { localStorage.removeItem(_USERS_CACHE_KEY); } catch {}
}

// ── Shared authentication helper ─────────────────────────────────────
//
// Trả về session { user_id, username, display_name, _ph } hoặc throw { code }
//   code: 'NOT_FOUND' | 'WRONG_PASSWORD' | 'INACTIVE' | 'ERROR'
//
// Chiến lược:
//   - passcode hash: ưu tiên static build (đáng tin hơn — normalize.js xử lý cả admin-created users)
//   - status:        luôn lấy từ live CSV (force-fresh) để kích hoạt admin có hiệu lực ngay
//   - fallback:      nếu live fetch lỗi → dùng static status
//
async function authenticate(username, passcode) {
  const hash      = await sha256(username + passcode);
  const buildData = window.__USERS_DATA__ || [];
  const buildUser = buildData.find(u => u.username === username) || null;

  // Fetch live CSV (force fresh) — vừa để check status, vừa hỗ trợ user mới đăng ký chưa rebuild
  const liveUsers = await fetchLiveUsers(true);
  const liveUser  = liveUsers ? liveUsers.find(u => u.username === username) || null : null;

  // Không tồn tại ở cả hai nguồn
  if (!buildUser && !liveUser) throw { code: 'NOT_FOUND' };

  // Kiểm tra passcode:
  //   buildUser.passcode_hash: đã normalize, đáng tin (kể cả admin tạo bằng raw passcode)
  //   liveUser.passcode_hash:  dùng khi user mới đăng ký qua web (Apps Script lưu hash trực tiếp)
  const expectedHash = buildUser?.passcode_hash || liveUser?.passcode_hash || '';
  if (!expectedHash || expectedHash !== hash) throw { code: 'WRONG_PASSWORD' };

  // Kiểm tra status — live CSV ưu tiên (phản ánh admin kích hoạt mới nhất)
  const status = liveUser?.status || buildUser?.status || 'inactive';
  if (status !== 'active') throw { code: 'INACTIVE' };

  // Trả về session (buildUser ưu tiên — display_name đã normalize)
  const src = buildUser || liveUser;
  return {
    user_id:      src.id,
    username:     src.username,
    display_name: src.display_name,
    _ph:          hash,
  };
}

function aggregatePicks(allBets, fixtureId) {
  const rows = allBets.filter(b => b.fixture_id === fixtureId);
  return {
    home:  rows.filter(b => b.pick_type === 'home').length,
    draw:  rows.filter(b => b.pick_type === 'draw').length,
    away:  rows.filter(b => b.pick_type === 'away').length,
    total: rows.length,
  };
}

function savePendingPick(fixtureId, pickType, pickId) {
  try {
    const pending = JSON.parse(localStorage.getItem(_PENDING_KEY) || '[]');
    const idx     = pending.findIndex(b => b.fixture_id === fixtureId);
    const entry   = { fixture_id: fixtureId, pick_type: pickType, pick_id: pickId, created_at: new Date().toISOString(), _pending: true };
    if (idx >= 0) pending[idx] = entry;
    else pending.push(entry);
    localStorage.setItem(_PENDING_KEY, JSON.stringify(pending));
    // Invalidate live cache so community picks refresh on next fetch (Bug 4)
    localStorage.removeItem(_LIVE_CACHE_KEY);
  } catch {}
}

// Sync own picks: remove _PENDING_KEY entries confirmed in CSV, keep fresh ones (Bug 1)
async function syncOwnPicks(session) {
  if (!session) return;
  const all = await fetchLivePicks();
  if (!all) return;
  try {
    const confirmedFixtures = new Set(
      all.filter(b => b.user_id === session.user_id).map(b => b.fixture_id)
    );
    if (!confirmedFixtures.size) return;
    const pending = JSON.parse(localStorage.getItem(_PENDING_KEY) || '[]');
    const stillPending = pending.filter(b => !confirmedFixtures.has(b.fixture_id));
    localStorage.setItem(_PENDING_KEY, JSON.stringify(stillPending));
  } catch {}
}

// ── Alpine components ─────────────────────────────────────────────────

function appState() {
  return {
    mobileMenuOpen: false,
    _user: null,
    refreshing: false,
    _dots: '.',
    _dotsInterval: null,
    renameModal: false,
    renameValue: '',
    renameError: '',
    renameLoading: false,
    init() {
      try { this._user = JSON.parse(localStorage.getItem(_KEY) || 'null'); }
      catch { this._user = null; }
      window.addEventListener('funnybet:login', (e) => { this._user = e.detail; });

      // Ctrl+Shift+R (Windows/Linux) hoặc Cmd+Shift+R (macOS) → làm mới cache
      // preventDefault() để chặn browser hard-reload thay bằng soft-refresh của app
      window.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'r') {
          e.preventDefault();
          this.refreshCache();
        }
      });
    },
    get currentUser() { return this._user; },
    logout() {
      localStorage.removeItem(_KEY);
      this._user = null;
      window.location.href = '/';
    },
    openRenameModal() {
      this.renameValue   = this._user?.display_name || '';
      this.renameError   = '';
      this.renameLoading = false;
      this.renameModal   = true;
    },
    async submitRename() {
      const name = this.renameValue.trim();
      if (!name)          { this.renameError = 'Tên hiển thị không được để trống.'; return; }
      if (name.length > 50) { this.renameError = 'Tên hiển thị tối đa 50 ký tự.'; return; }
      this.renameLoading = true;
      this.renameError   = '';
      try {
        const res  = await fetch('/.netlify/functions/update-display-name', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ username: this._user.username, _session_hash: this._user._ph, display_name: name }),
        });
        const data = await res.json();
        if (!data.success) { this.renameError = data.error || 'Có lỗi xảy ra.'; return; }
        this._user = { ...this._user, display_name: name };
        localStorage.setItem(_KEY, JSON.stringify(this._user));
        this.renameModal = false;
      } catch {
        this.renameError = 'Không thể kết nối. Vui lòng thử lại.';
      } finally {
        this.renameLoading = false;
      }
    },
    async refreshCache() {
      if (this.refreshing) return;
      this.refreshing = true;
      this._dots = '.';
      this._dotsInterval = setInterval(() => {
        this._dots = this._dots.length >= 3 ? '.' : this._dots + '.';
      }, 400);
      try {
        localStorage.removeItem(_LIVE_CACHE_KEY);
        localStorage.removeItem(_USERS_CACHE_KEY);
        const all = await fetchLivePicks();
        if (all) window.dispatchEvent(new CustomEvent('funnybet:refresh', { detail: all }));
      } catch {} finally {
        clearInterval(this._dotsInterval);
        this._dotsInterval = null;
        this.refreshing = false;
      }
    },
  };
}

function loginForm(_usersData) { // _usersData kept for backward compat, not used (authenticate() reads window.__USERS_DATA__)
  return {
    username: '',
    passcode: '',
    error: '',
    loading: false,
    async submit() {
      this.error = '';
      const u = this.username.trim();
      const p = this.passcode.trim();
      if (!u || !p) { this.error = 'Vui lòng nhập đầy đủ thông tin.'; return; }
      if (p.length < 6) { this.error = 'Passcode phải có ít nhất 6 ký tự.'; return; }
      this.loading = true;
      try {
        const session = await authenticate(u, p);
        localStorage.setItem(_KEY, JSON.stringify(session));
        window.location.href = '/my-picks/';
      } catch (err) {
        if (err.code === 'NOT_FOUND' || err.code === 'WRONG_PASSWORD')
          this.error = 'Username hoặc passcode không đúng.';
        else if (err.code === 'INACTIVE')
          this.error = 'Tài khoản chưa được kích hoạt. Liên hệ admin để được hỗ trợ.';
        else
          this.error = 'Lỗi kết nối. Vui lòng thử lại.';
      } finally {
        this.loading = false;
      }
    },
  };
}

// ── Theme store ───────────────────────────────────────────────────────

document.addEventListener('alpine:init', () => {
  Alpine.store('theme', {
    mode: localStorage.getItem('theme') || 'auto',
    get label() { return { auto: '⊙', light: '☀', dark: '🌙' }[this.mode]; },
    cycle() {
      this.mode = { auto: 'light', light: 'dark', dark: 'auto' }[this.mode];
      localStorage.setItem('theme', this.mode);
      this._apply();
    },
    _apply() {
      const dark = this.mode === 'dark' || (this.mode === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
      document.documentElement.classList.toggle('dark', dark);
    },
    init() {
      this._apply();
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        if (this.mode === 'auto') this._apply();
      });
    },
  });
});

function leaderboardPage(staticRows) {
  return {
    rows: staticRows,
    showCopyModal: false,
    copyTarget: null,
    copyLoading: false,
    copyMessage: '',
    isCopyError: false,
    async init() {
      const [liveUsers, liveBets] = await Promise.all([fetchLiveUsers(), fetchLivePicks()]);
      if (!liveUsers) return;
      const enriched = staticRows.map(u => ({
        ...u,
        total_submitted: liveBets ? liveBets.filter(b => b.user_id === u.user_id).length : null,
      }));
      const knownIds = new Set(staticRows.map(u => u.user_id));
      const fresh = liveUsers
        .filter(u => u.status === 'active' && !knownIds.has(u.id))
        .map(u => {
          const userPicks = liveBets ? liveBets.filter(b => b.user_id === u.id) : [];
          const scored = userPicks.filter(b => b.result);
          return {
            user_id:         u.id,
            username:        u.username,
            display_name:    u.display_name,
            played:          scored.length,
            total_submitted: userPicks.length,
            wins:    scored.filter(b => b.result === 'WIN').length,
            draws:   scored.filter(b => b.result === 'PUSH').length,
            losses:  scored.filter(b => b.result === 'LOSE').length,
            no_picks: scored.filter(b => b.result === 'NO_PICK').length,
            points:  scored.reduce((s, b) => s + (parseFloat(b.points) || 0), 0),
            _new: true,
          };
        });
      this.rows = [...enriched, ...fresh];

      // Listen for cache refresh to update submitted counts dynamically
      window.addEventListener('funnybet:refresh', (e) => {
        const freshPicks = e.detail;
        this.rows = this.rows.map(u => ({
          ...u,
          total_submitted: freshPicks ? freshPicks.filter(b => b.user_id === u.user_id).length : null,
        }));
      });
    },
    openCopyModal(targetUser) {
      this.copyTarget = targetUser;
      this.copyMessage = '';
      this.isCopyError = false;
      this.showCopyModal = true;
    },
    async confirmCopy() {
      if (!this.copyTarget || this.copyLoading) return;
      const u = (() => { try { return JSON.parse(localStorage.getItem(_KEY) || 'null'); } catch { return null; } })();
      if (!u) {
        this.copyMessage = 'Bạn cần đăng nhập để thực hiện tính năng này.';
        this.isCopyError = true;
        return;
      }

      this.copyLoading = true;
      this.copyMessage = '';
      this.isCopyError = false;

      try {
        const res = await fetch('/.netlify/functions/copy-picks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: u.username,
            _session_hash: u._ph,
            target_user_id: this.copyTarget.user_id,
          }),
        });

        const data = await res.json();
        if (res.ok) {
          if (data.copiedCount > 0) {
            // Clear pending picks for these copied fixtures if any to prevent UI override
            if (data.copiedFixtureIds && data.copiedFixtureIds.length > 0) {
              try {
                const pending = JSON.parse(localStorage.getItem(_PENDING_KEY) || '[]');
                const filtered = pending.filter(b => !data.copiedFixtureIds.includes(b.fixture_id));
                localStorage.setItem(_PENDING_KEY, JSON.stringify(filtered));
              } catch {}
            }

            // Invalidate cache and trigger reload
            localStorage.removeItem(_LIVE_CACHE_KEY);
            const freshPicks = await fetchLivePicks();
            if (freshPicks) {
              window.dispatchEvent(new CustomEvent('funnybet:refresh', { detail: freshPicks }));
            }

            this.copyMessage = `✅ Đã sao chép thành công ${data.copiedCount} dự đoán của ${this.copyTarget.display_name}!`;
            this.isCopyError = false;

            setTimeout(() => {
              this.showCopyModal = false;
              this.copyTarget = null;
              this.copyMessage = '';
            }, 2000);
          } else {
            this.copyMessage = '⚠️ Người chơi này không có dự đoán nào chưa đóng để sao chép.';
            this.isCopyError = true;
          }
        } else {
          this.copyMessage = `❌ ${data.error || 'Lỗi không xác định.'}`;
          this.isCopyError = true;
        }
      } catch (err) {
        this.copyMessage = '❌ Lỗi kết nối. Vui lòng thử lại.';
        this.isCopyError = true;
      } finally {
        this.copyLoading = false;
      }
    },
  };
}

function myPicksPage(buildPicksData, fixturesData) {
  return {
    user: null,
    picks: [],
    fixtures: {},
    init() {
      try { this.user = JSON.parse(localStorage.getItem(_KEY) || 'null'); }
      catch { this.user = null; }
      if (!this.user) return;
      for (const f of fixturesData) this.fixtures[f.fixture_id] = f;
      this._loadPicks(buildPicksData);
      // Sync from live Sheet then reload
      syncOwnPicks(this.user).then(() => this._loadPicks(buildPicksData));
    },
    _loadPicks(buildPicksData) {
      const buildPicks = buildPicksData.filter(b => b.user_id === this.user.user_id);

      let pending = [];
      try { pending = JSON.parse(localStorage.getItem(_PENDING_KEY) || '[]'); } catch {}

      // Start with pending (most recent pick for each fixture)
      const map      = new Map(pending.map(b => [b.fixture_id, { ...b, _pending: true }]));
      const finished = new Set();

      buildPicks.forEach(b => {
        if (b.result != null) {
          // Finished: build is authoritative (has result + points) — always wins
          map.set(b.fixture_id, b);
          finished.add(b.fixture_id);
        } else {
          const pendingEntry = map.get(b.fixture_id);
          if (!pendingEntry) {
            // No pending entry: use build as-is
            map.set(b.fixture_id, b);
          } else {
            // Upcoming + pending: pending has the more recent pick; build has the rest
            map.set(b.fixture_id, { ...b, pick_type: pendingEntry.pick_type, _pending: pendingEntry._pending });
          }
        }
      });

      // Cleanup pending for finished fixtures (confirmed via result)
      if (finished.size > 0) {
        try {
          localStorage.setItem(_PENDING_KEY, JSON.stringify(
            pending.filter(b => !finished.has(b.fixture_id))
          ));
        } catch {}
      }

      this.picks = Array.from(map.values())
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    },
    formatDate(iso) {
      if (!iso) return '—';
      return new Date(iso).toLocaleDateString('vi-VN', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
        timeZone: window.SITE_TIMEZONE || 'Asia/Ho_Chi_Minh',
      });
    },
    pickLabel(pick) {
      if (pick._no_pick) return '— Không dự đoán';
      const f = this.fixtures[pick.fixture_id];
      return {
        home: f ? `${f.home_team} thắng` : 'Đội nhà thắng',
        draw: 'Hòa chấp',
        away: f ? `${f.away_team} thắng` : 'Đội khách thắng',
      }[pick.pick_type] || pick.pick_type;
    },
    resultLabel(r) {
      return { WIN: 'Thắng', PUSH: 'Hòa chấp', LOSE: 'Thua', NO_PICK: 'Bỏ qua' }[r] || r;
    },
    resultClass(r) {
      if (r === 'WIN')    return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300';
      if (r === 'LOSE')   return 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300';
      if (r === 'NO_PICK') return 'bg-pink-100 text-pink-600 dark:bg-pink-900 dark:text-pink-300';
      return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300';
    },
    ptDisplay(pts) {
      if (pts == null) return '—';
      return (pts > 0 ? '+' : '') + pts;
    },
    get totalPoints() { return this.picks.reduce((s, b) => s + (b.points ?? 0), 0); },
    get resolvedCount() { return this.picks.filter(b => b.result != null).length; },
    doLogout() {
      localStorage.removeItem(_KEY);
      window.location.href = '/';
    },
  };
}
