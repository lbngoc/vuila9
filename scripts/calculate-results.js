'use strict';
const fs = require('fs');

const GEN = 'data/generated';

function load(name) {
  const p = `${GEN}/${name}.json`;
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

// ── Scoring config — chỉnh trong src/_data/siteConfig.js ─────────────
const { points: POINTS, auto_lose_no_bet } = require('../src/_data/siteConfig');

// ── Resolution ─────────────────────────────────────────────────────────
//
// h = fixture.handicap (negative = home gives balls, e.g. -2.0)
// adj = margin + h  (margin = result_home - result_away)
//   adj > 0: home covers → Home WIN,  Away LOSE
//   adj = 0: push       → Home PUSH, Away PUSH, Draw WIN
//   adj < 0: away covers → Home LOSE, Away WIN
//
// 'draw' pick = betting on exact push. WIN if adj===0, else LOSE.
//
function resolveByPick(pickType, fixture) {
  const margin = fixture.result_home - fixture.result_away;
  const h = fixture.handicap != null ? parseFloat(fixture.handicap) : 0;
  const adj = margin + h;

  if (pickType === 'home') {
    if (adj > 0)  return 'WIN';
    if (adj === 0) return 'PUSH';
    return 'LOSE';
  }
  if (pickType === 'away') {
    if (adj < 0)  return 'WIN';
    if (adj === 0) return 'PUSH';
    return 'LOSE';
  }
  if (pickType === 'draw') {
    return adj === 0 ? 'WIN' : 'LOSE';
  }
  return null;
}

// ── Main ───────────────────────────────────────────────────────────────
function main() {
  const fixtures = load('fixtures');
  const bets     = load('bets');
  if (!fixtures || !bets) { console.log('calculate-results: missing data, skipping.'); return; }

  const fixtureMap = Object.fromEntries(fixtures.map(f => [f.fixture_id, f]));

  let resolved = 0;
  const enriched = bets.map(bet => {
    const fixture = fixtureMap[bet.fixture_id];
    if (!fixture || !fixture.is_finished) {
      return { ...bet, result: null, points: null, profit: null };
    }

    const result = resolveByPick(bet.pick_type, fixture);
    if (!result) return { ...bet, result: null, points: null, profit: null };

    resolved++;
    return { ...bet, result, points: POINTS[result] ?? 0 };
  });

  // ── Auto-lose: active users who didn't bet on a finished fixture ─────────
  let autoAdded = 0;
  if (auto_lose_no_bet) {
    const users = load('users');
    if (users) {
      const activeUsers     = users.filter(u => u.status === 'active');
      const finishedFixtures = fixtures.filter(f => f.is_finished);

      for (const fixture of finishedFixtures) {
        // Set of user_ids who actually placed a bet on this fixture
        const betters = new Set(
          enriched
            .filter(b => b.fixture_id === fixture.fixture_id)
            .map(b => b.user_id)
        );
        for (const user of activeUsers) {
          if (!betters.has(user.id)) {
            enriched.push({
              bet_id:     `auto_${user.id}_${fixture.fixture_id}`,
              created_at: fixture.kickoff_at,
              user_id:    user.id,
              fixture_id: fixture.fixture_id,
              pick_type:  null,
              result:     'LOSE',
              points:     POINTS.LOSE ?? 0,
              _auto_lose: true,
            });
            autoAdded++;
          }
        }
      }
      if (autoAdded) console.log(`calculate-results: auto-lose added ${autoAdded} entries`);
    }
  }

  fs.writeFileSync(`${GEN}/bets.json`, JSON.stringify(enriched, null, 2), 'utf8');
  console.log(`calculate-results: resolved ${resolved}/${bets.length} bets`);
  console.log('calculate-results: done');
}

main();
