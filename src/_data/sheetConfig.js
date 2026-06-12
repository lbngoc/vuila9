'use strict';

// Tab view URLs for "Xem dữ liệu gốc" links — only populated when env vars are present.
const id = process.env.GOOGLE_SHEET_ID || '';
const sheetBase = id ? `https://docs.google.com/spreadsheets/d/${id}` : '';

module.exports = {
  // Tab view URLs — cho link "Xem dữ liệu gốc" trong page header
  fixtures_tab_url: id && process.env.FIXTURES_GID ? `${sheetBase}/edit#gid=${process.env.FIXTURES_GID}` : '',
  picks_tab_url:     id && process.env.PICKS_GID     ? `${sheetBase}/edit#gid=${process.env.PICKS_GID}`     : '',
};
