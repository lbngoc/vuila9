'use strict';
const fs   = require('fs');
const path = require('path');

const GEN  = 'data/generated';
const DEST = 'src/_data';

const TABS = ['users', 'fixtures', 'picks', 'leaderboard'];
const generatedAt = new Date().toISOString();

fs.mkdirSync(DEST, { recursive: true });

for (const name of TABS) {
  const src = path.join(GEN, `${name}.json`);
  if (!fs.existsSync(src)) { console.warn(`export-json: ${name}.json not found, skipping.`); continue; }

  const data = JSON.parse(fs.readFileSync(src, 'utf8'));
  const wrapped = { generated_at: generatedAt, data };
  fs.writeFileSync(path.join(DEST, `${name}.json`), JSON.stringify(wrapped, null, 2), 'utf8');
  const count = Array.isArray(data) ? data.length : '?';
  console.log(`export-json: ${name} → ${count} entries`);
}

console.log('export-json: done');
