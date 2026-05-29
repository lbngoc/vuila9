'use strict';
// Usage: node scripts/create-user.js <username> <display_name> <passcode> [id]
//
// Output: 1 CSV row sẵn sàng paste vào tab users của Google Sheet
// Ví dụ: node scripts/create-user.js ngoc "Ngọc Lương" mypassword123

const crypto = require('crypto');

function hashPasscode(username, passcode) {
  return crypto.createHash('sha256').update(username + passcode).digest('hex');
}

function generateId() {
  const stamp = Date.now().toString(36);
  const rand  = Math.random().toString(36).slice(2, 5);
  return `u_${stamp}_${rand}`;
}

const [,, username, display_name, passcode, customId] = process.argv;

if (!username || !display_name || !passcode) {
  console.error('Usage: node scripts/create-user.js <username> <display_name> <passcode> [id]');
  console.error('Example: node scripts/create-user.js ngoc "Ngọc Lương" mypassword123');
  process.exit(1);
}

const u = username.toLowerCase().trim();

if (!/^[a-z0-9_]{3,20}$/.test(u)) {
  console.error('Error: username chỉ được dùng chữ thường, số, dấu gạch dưới (3–20 ký tự).');
  process.exit(1);
}

if (passcode.trim().length < 6) {
  console.error('Error: passcode phải có ít nhất 6 ký tự.');
  process.exit(1);
}

const id           = customId ? customId.trim() : generateId();
const hash         = hashPasscode(u, passcode.trim());
const created_at   = new Date().toISOString().replace('T', ' ').slice(0, 19);

console.log('\n── Dán vào tab users của Google Sheet ──────────────────────────');
console.log('id,username,display_name,passcode,passcode_hash,created_at,status');
console.log(`${id},${u},${display_name.trim()},,${hash},${created_at},active`);
console.log('────────────────────────────────────────────────────────────────\n');
console.log(`username:     ${u}`);
console.log(`display_name: ${display_name.trim()}`);
console.log(`id:           ${id}`);
console.log(`hash:         ${hash.slice(0, 16)}...`);
