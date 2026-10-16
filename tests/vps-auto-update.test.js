'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const { createUpdater } = require('../scripts/vps-auto-update');
const repoRoot = path.resolve(__dirname, '..');

function temporaryStateFile() {
  return path.join(os.tmpdir(), `mickey-auto-update-${Date.now()}-${Math.random()}.json`);
}

test('VPS updater leaves a working tree with tracked changes untouched', () => {
  const calls = [];
  const updater = createUpdater({
    stateFile: temporaryStateFile(),
    logger: { warn() {}, info() {}, error() {} },
    runCommand(command, args) {
      calls.push([command, args]);
      if (args[0] === 'rev-parse') return repoRoot;
      if (args[0] === 'status') return ' M index.js';
      throw new Error('Updater should stop before fetching a dirty checkout.');
    }
  });

  assert.equal(updater.runOnce().status, 'dirty');
  assert.equal(calls.length, 2);
});

test('VPS updater fast-forwards, installs dependencies, then asks PM2 to restart', () => {
  const stateFile = temporaryStateFile();
  const calls = [];
  const updater = createUpdater({
    stateFile,
    logger: { warn() {}, info() {}, error() {} },
    runCommand(command, args) {
      calls.push([command, args]);
      if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return repoRoot;
      if (args[0] === 'status') return '';
      if (args[0] === 'rev-list') return '1';
      if (args[0] === 'rev-parse' && args[1] === 'HEAD') return 'abc123';
      if (command === 'pm2' && args[0] === 'jlist') return JSON.stringify([{ pm2_env: { pm_cwd: repoRoot, pm_exec_path: path.join(repoRoot, 'index.js'), pm_id: 4 } }]);
      return '';
    }
  });

  try {
    const result = updater.runOnce();
    assert.deepEqual(result, { status: 'updated', commit: 'abc123' });
    assert.deepEqual(calls.map(([command]) => command), ['git', 'git', 'git', 'git', 'git', 'git', 'npm', 'pm2', 'pm2']);
    assert.equal(calls[3][1][0], 'merge');
    assert.equal(calls[6][1][0], 'ci');
    assert.deepEqual(calls[7][1], ['jlist']);
    assert.deepEqual(calls[8][1], ['restart', '4']);
    assert.equal(fs.existsSync(stateFile), false);
  } finally {
    fs.rmSync(stateFile, { force: true });
  }
});

test('VPS updater retries dependency installation after a failed install', () => {
  const stateFile = temporaryStateFile();
  let failInstall = true;
  const calls = [];
  const updater = createUpdater({
    stateFile,
    logger: { warn() {}, info() {}, error() {} },
    runCommand(command, args) {
      calls.push([command, args]);
      if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return repoRoot;
      if (args[0] === 'status') return '';
      if (args[0] === 'rev-list') return '1';
      if (args[0] === 'rev-parse' && args[1] === 'HEAD') return 'abc123';
      if (command === 'pm2' && args[0] === 'jlist') return JSON.stringify([{ pm2_env: { pm_cwd: repoRoot, pm_exec_path: path.join(repoRoot, 'index.js'), pm_id: 4 } }]);
      if (command === 'npm' && failInstall) {
        failInstall = false;
        throw new Error('install failed');
      }
      return '';
    }
  });

  try {
    assert.equal(updater.runOnce().status, 'error');
    const callsBeforeRetry = calls.length;
    assert.deepEqual(updater.runOnce(), { status: 'updated', commit: 'abc123' });
    assert.equal(calls.slice(callsBeforeRetry).some(([, args]) => args[0] === 'fetch'), false);
    assert.equal(fs.existsSync(stateFile), false);
  } finally {
    fs.rmSync(stateFile, { force: true });
  }
});
