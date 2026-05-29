'use strict';
const fs     = require('fs');
const crypto = require('crypto');
const { parse } = require('csv-parse/sync');

function hashPasscode(username, passcode) {
  return crypto.createHash('sha256').update(username + passcode).digest('hex');
}

const RAW = 'data/raw';
const GEN = 'data/generated';
fs.mkdirSync(GEN, { recursive: true });

function readCsv(name) {
  const src = `${RAW}/${name}.csv`;
  if (!fs.existsSync(src)) { console.warn(`normalize: ${name}.csv not found, skipping.`); return null; }
  const content = fs.readFileSync(src, 'utf8');
  return parse(content, { columns: true, skip_empty_lines: true, trim: true });
}

function toIso(str) {
  if (!str || !str.trim()) return null;
  // Support "2026-06-13 21:00:00" → treat as UTC
  const normalized = str.trim().replace(' ', 'T');
  const d = new Date(normalized.includes('Z') || normalized.includes('+') ? normalized : normalized + 'Z');
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function toFloat(str) { const n = parseFloat(str); return isNaN(n) ? null : n; }
function toInt(str)   { const n = parseInt(str, 10); return isNaN(n) ? null : n; }

// ── Users ──────────────────────────────────────────────────────────────
const rawUsers = readCsv('users');
if (rawUsers) {
  const users = rawUsers
    .filter(r => r.id && r.id.trim())
    .map(r => {
      const username = r.username.trim().toLowerCase();
      // Support both raw passcode (admin-created) and pre-computed hash (web-registered)
      const passcode_hash = (r.passcode_hash && r.passcode_hash.trim())
        ? r.passcode_hash.trim()
        : hashPasscode(username, r.passcode ? r.passcode.trim() : '');
      return {
        id:            r.id.trim(),
        username,
        display_name:  r.display_name.trim(),
        passcode_hash,
        created_at:    toIso(r.created_at),
        status:        (r.status || '').trim() || 'inactive',
      };
    });
  fs.writeFileSync(`${GEN}/users.json`, JSON.stringify(users, null, 2), 'utf8');
  const active = users.filter(u => u.status === 'active').length;
  console.log(`normalize: users → ${users.length} total, ${active} active`);
}

// ── Fixtures ───────────────────────────────────────────────────────────
const rawFixtures = readCsv('fixtures');
if (rawFixtures) {
  const now         = Date.now();
  const lockMinutes = parseInt(process.env.BET_LOCK_MINUTES) || 60;
  const fixtures = rawFixtures.map(r => {
    const kickoffIso = toIso(r.kickoff_at);
    const kickoffMs  = kickoffIso ? new Date(kickoffIso).getTime() : 0;
    const lockMs     = kickoffMs - lockMinutes * 60 * 1000;
    const isFinished = r.status.trim() === 'finished' && r.result_home !== '' && r.result_away !== '';
    return {
      fixture_id:   r.fixture_id.trim(),
      league:       r.league.trim(),
      kickoff_at:   kickoffIso,
      home_team:    r.home_team.trim(),
      away_team:    r.away_team.trim(),
      handicap:     r.handicap ? r.handicap.trim() || null : null,
      status:       r.status.trim(),
      result_home:  isFinished ? toInt(r.result_home) : null,
      result_away:  isFinished ? toInt(r.result_away) : null,
      is_finished:  isFinished,
      is_locked:    now >= lockMs,
    };
  });
  fs.writeFileSync(`${GEN}/fixtures.json`, JSON.stringify(fixtures, null, 2), 'utf8');
  console.log(`normalize: fixtures → ${fixtures.length} total, ${fixtures.filter(f => f.is_finished).length} finished`);
}

// ── Bets ───────────────────────────────────────────────────────────────
const rawBets = readCsv('bets');
if (rawBets) {
  const bets = rawBets
    .filter(r => r.bet_id?.trim() && r.user_id?.trim() && r.fixture_id?.trim())
    .map(r => ({
      bet_id:     r.bet_id.trim(),
      created_at: toIso(r.created_at),
      user_id:    r.user_id.trim(),
      fixture_id: r.fixture_id.trim(),
      pick_type:  r.pick_type.trim(),
    }));
  fs.writeFileSync(`${GEN}/bets.json`, JSON.stringify(bets, null, 2), 'utf8');
  console.log(`normalize: bets → ${bets.length} total`);
}

console.log('normalize: done');
