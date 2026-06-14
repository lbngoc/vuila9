'use strict';
require('dotenv').config({ path: '.env.local' });
const fs = require('fs');

const GEN = 'data/generated';

function load(name) {
  const p = `${GEN}/${name}.json`;
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

// ── Scoring config — chỉnh trong src/_data/siteConfig.js ─────────────
const { points: POINTS } = require('../src/_data/siteConfig');

// ── Resolution ─────────────────────────────────────────────────────────
//
// h = fixture.handicap (negative = home gives balls, e.g. -2.0)
// adj = margin + h  (margin = result_home - result_away)
//   adj > 0: home covers → Home WIN,  Away LOSE
//   adj = 0: push       → Home PUSH, Away PUSH, Draw WIN
//   adj < 0: away covers → Home LOSE, Away WIN
//
// 'draw' pick = exact push. WIN if adj===0, else LOSE.
//
function resolveByPick(pickType, fixture) {
  const margin = fixture.result_home - fixture.result_away;
  const h = fixture.handicap != null ? parseFloat(fixture.handicap) : 0;
  const adj = margin + h;

  if (pickType === 'home') return adj > 0 ? 'WIN' : 'LOSE';
  if (pickType === 'away') return adj < 0 ? 'WIN' : 'LOSE';
  if (pickType === 'draw') return adj === 0 ? 'PUSH' : 'LOSE';
  return null;
}

// ── Main ───────────────────────────────────────────────────────────────
function main() {
  const fixtures = load('fixtures');
  const picks    = load('picks');
  if (!fixtures || !picks) { console.log('calculate-results: missing data, skipping.'); return; }

  const fixtureMap = Object.fromEntries(fixtures.map(f => [f.fixture_id, f]));

  let resolved = 0;
  const enriched = picks.map(pick => {
    const fixture = fixtureMap[pick.fixture_id];
    if (!fixture || !fixture.is_finished) {
      return { ...pick, result: null, points: null, profit: null };
    }

    const result = resolveByPick(pick.pick_type, fixture);
    if (!result) return { ...pick, result: null, points: null, profit: null };

    resolved++;
    return { ...pick, result, points: POINTS[result] ?? 0 };
  });

  // ── No-pick: active users who didn't pick on a finished fixture ──────────
  let autoAdded = 0;
  if (POINTS.NO_PICK < 0) {
    const users = load('users');
    if (users) {
      const activeUsers      = users.filter(u => u.status === 'active');
      const finishedFixtures = fixtures.filter(f => f.is_finished);

      for (const fixture of finishedFixtures) {
        const pickers = new Set(
          enriched
            .filter(b => b.fixture_id === fixture.fixture_id)
            .map(b => b.user_id)
        );
        for (const user of activeUsers) {
          if (!pickers.has(user.id)) {
            enriched.push({
              pick_id:     `auto_${user.id}_${fixture.fixture_id}`,
              created_at: fixture.kickoff_at,
              user_id:    user.id,
              fixture_id: fixture.fixture_id,
              pick_type:  null,
              result:     'NO_PICK',
              points:     POINTS.NO_PICK ?? 0,
              _no_pick:    true,
            });
            autoAdded++;
          }
        }
      }
      if (autoAdded) console.log(`calculate-results: no-pick added ${autoAdded} entries`);
    }
  }

  fs.writeFileSync(`${GEN}/picks.json`, JSON.stringify(enriched, null, 2), 'utf8');
  console.log(`calculate-results: resolved ${resolved}/${picks.length} picks`);
  console.log('calculate-results: done');
}

main();
