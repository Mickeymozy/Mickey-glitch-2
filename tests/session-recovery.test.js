const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs-extra');
const os = require('os');
const path = require('path');

const {
  isSessionRepairableError,
  backupSignalState,
  cleanupOldSessionBackups,
  SESSION_BACKUP_MAX_AGE_MS
} = require('../lib/sessionRecovery');

test('session recovery detects Bad MAC errors', () => {
  assert.equal(isSessionRepairableError(new Error('Bad MAC')), true);
  assert.equal(isSessionRepairableError(new Error('network timeout')), false);
});

test('session recovery preserves creds and backs up Signal keys', () => {
  const authPath = fs.mkdtempSync(path.join(os.tmpdir(), 'mickey-auth-'));
  fs.writeFileSync(path.join(authPath, 'creds.json'), '{}');
  fs.writeFileSync(path.join(authPath, 'session-123.json'), '{}');

  try {
    const backupPath = backupSignalState(authPath, 123);

    assert.equal(fs.existsSync(path.join(authPath, 'creds.json')), true);
    assert.equal(fs.existsSync(path.join(authPath, 'session-123.json')), false);
    assert.equal(fs.existsSync(path.join(backupPath, 'session-123.json')), true);
  } finally {
    fs.removeSync(authPath);
    fs.removeSync(`${authPath}_bad_mac_123`);
  }
});

test('session recovery removes only expired backup directories', () => {
  const authDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mickey-auth-backups-'));
  const now = Date.now();
  const expiredPath = path.join(authDir, `bot_bad_mac_${now - SESSION_BACKUP_MAX_AGE_MS - 1}`);
  const recentPath = path.join(authDir, `bot_backup_${now - SESSION_BACKUP_MAX_AGE_MS + 1}`);
  const activePath = path.join(authDir, 'bot-active');

  fs.ensureDirSync(expiredPath);
  fs.ensureDirSync(recentPath);
  fs.ensureDirSync(activePath);

  try {
    assert.equal(cleanupOldSessionBackups(authDir, now), 1);
    assert.equal(fs.existsSync(expiredPath), false);
    assert.equal(fs.existsSync(recentPath), true);
    assert.equal(fs.existsSync(activePath), true);
  } finally {
    fs.removeSync(authDir);
  }
});