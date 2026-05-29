'use strict';

// Injects Google Sheets CSV URLs for client-side live data fetch.
// Only populated when GOOGLE_SHEET_ID + respective GID env vars are present.
// Templates use: {% if sheetConfig.bets_url %}...{% endif %}
const id = process.env.GOOGLE_SHEET_ID || '';
const csvBase = id ? `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=` : '';

const sheetBase = id ? `https://docs.google.com/spreadsheets/d/${id}` : '';

module.exports = {
  bets_url:  id && process.env.BETS_GID  ? csvBase + process.env.BETS_GID  : '',
  users_url: id && process.env.USERS_GID ? csvBase + process.env.USERS_GID : '',

  // Tab view URLs — cho link "Xem dữ liệu gốc" trong page header
  fixtures_tab_url: id && process.env.FIXTURES_GID ? `${sheetBase}/edit#gid=${process.env.FIXTURES_GID}` : '',
  bets_tab_url:     id && process.env.BETS_GID     ? `${sheetBase}/edit#gid=${process.env.BETS_GID}`     : '',
};
