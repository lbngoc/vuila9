'use strict';
require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const path = require('path');

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const TABS = {
  users:    process.env.USERS_GID    || '0',
  fixtures: process.env.FIXTURES_GID || null,
  bets:     process.env.BETS_GID     || null,
};

async function fetchCsvWithRetry(sheetId, gid, retries = 1) {
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      if (attempt === retries) throw new Error(`Failed to fetch gid=${gid} after ${retries + 1} attempts: ${err.message}`);
      console.warn(`  Retry ${attempt + 1}...`);
    }
  }
}

async function main() {
  if (!SHEET_ID) {
    console.warn('fetch-sheet: GOOGLE_SHEET_ID not set — skipping, using existing CSVs.');
    process.exit(0);
  }

  fs.mkdirSync('data/raw', { recursive: true });
  let hasError = false;

  for (const [name, gid] of Object.entries(TABS)) {
    if (!gid) {
      console.warn(`fetch-sheet: GID for "${name}" not set, skipping.`);
      continue;
    }
    process.stdout.write(`Fetching ${name}...`);
    try {
      const csv = await fetchCsvWithRetry(SHEET_ID, gid);
      // Guard: Google redirects to HTML login page on 200 when sheet is private/quota-exceeded
      if (csv.trimStart().startsWith('<')) {
        throw new Error(`Response is HTML, not CSV — sheet may be private or quota exceeded`);
      }
      fs.writeFileSync(path.join('data/raw', `${name}.csv`), csv, 'utf8');
      const rows = csv.trim().split('\n').length - 1;
      console.log(` ${rows} rows`);
    } catch (err) {
      console.error(` ERROR — ${err.message}`);
      hasError = true;
    }
  }

  if (hasError) { console.error('fetch-sheet: completed with errors'); process.exit(1); }
  console.log('fetch-sheet: done');
}

main().catch((err) => { console.error(err); process.exit(1); });
