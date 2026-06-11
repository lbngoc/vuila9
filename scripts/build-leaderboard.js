'use strict';
const fs = require('fs');

const GEN = 'data/generated';

function load(name) {
  const p = `${GEN}/${name}.json`;
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function round4(n) { return Math.round(n * 10000) / 10000; }

function main() {
  const users = load('users');
  const picks = load('picks');
  if (!users || !picks) { console.log('build-leaderboard: missing data, skipping.'); return; }

  const userMap = Object.fromEntries(users.map(u => [u.id, u]));

  const stats = {};
  for (const pick of picks) {
    if (pick.result === null) continue;
    if (!stats[pick.user_id]) {
      stats[pick.user_id] = { played: 0, wins: 0, pushes: 0, losses: 0, no_picks: 0, points: 0 };
    }
    const s = stats[pick.user_id];
    s.played++;
    s.points += pick.points;
    if (pick.result === 'WIN')        s.wins++;
    else if (pick.result === 'PUSH')  s.pushes++;
    else if (pick.result === 'LOSE')  s.losses++;
    else if (pick.result === 'NO_PICK') s.no_picks++;
  }

  const leaderboard = Object.entries(stats).map(([user_id, s]) => {
    const user     = userMap[user_id];
    const win_rate = s.played > 0 ? round4(s.wins / s.played) : 0;
    return {
      user_id,
      username:     user ? user.username     : user_id,
      display_name: user ? user.display_name : user_id,
      played:       s.played,
      wins:         s.wins,
      draws:        s.pushes,
      losses:       s.losses,
      no_picks:      s.no_picks,
      points:       s.points,
      win_rate,
    };
  });

  // Sort: points DESC → wins DESC → win_rate DESC → username ASC
  leaderboard.sort((a, b) => {
    if (b.points   !== a.points)   return b.points   - a.points;
    if (b.wins     !== a.wins)     return b.wins     - a.wins;
    if (b.win_rate !== a.win_rate) return b.win_rate - a.win_rate;
    return a.username.localeCompare(b.username);
  });

  fs.writeFileSync(`${GEN}/leaderboard.json`, JSON.stringify(leaderboard, null, 2), 'utf8');
  console.log(`build-leaderboard: ${leaderboard.length} users ranked`);
  console.log('build-leaderboard: done');
}

main();
