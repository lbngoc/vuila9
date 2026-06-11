'use strict';

// Injects Google Sheets CSV URLs for client-side live data fetch.
// Only populated when GOOGLE_SHEET_ID + respective GID env vars are present.
// Templates use: {% if sheetConfig.picks_url %}...{% endif %}
const id = process.env.GOOGLE_SHEET_ID || '';
const csvBase = id ? `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=` : '';

const sheetBase = id ? `https://docs.google.com/spreadsheets/d/${id}` : '';

module.exports = {
  picks_url:  id && process.env.PICKS_GID  ? csvBase + process.env.PICKS_GID  : '',
  users_url: id && process.env.USERS_GID ? csvBase + process.env.USERS_GID : '',

  // Tab view URLs — cho link "Xem dữ liệu gốc" trong page header
  fixtures_tab_url: id && process.env.FIXTURES_GID ? `${sheetBase}/edit#gid=${process.env.FIXTURES_GID}` : '',
  picks_tab_url:     id && process.env.PICKS_GID     ? `${sheetBase}/edit#gid=${process.env.PICKS_GID}`     : '',
};
