'use strict';

const { execFileSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const ADMIN_ENV_DIR = process.env.MICKEY_DATA_DIR
  ? path.resolve(ROOT, process.env.MICKEY_DATA_DIR)
  : path.join(ROOT, 'data');
const ADMIN_ENV_FILE = path.join(ADMIN_ENV_DIR, '.mickey-admin-env.json');
const UPDATE_STATE = path.join(os.tmpdir(), `mickey-glitch-update-${crypto.createHash('sha1').update(ROOT).digest('hex').slice(0, 12)}.json`);

function loadSettings() {
  let managed = {};
  try {
    managed = JSON.parse(fs.readFileSync(ADMIN_ENV_FILE, 'utf8'));
  } catch (_) {}

  const get = (key, fallback) => typeof managed[key] === 'string' && managed[key]
    ? managed[key]
    : process.env[key] || fallback;
  const interval = Number(get('VPS_AUTO_UPDATE_INTERVAL_MS', '300000'));

  return {
    enabled: get('VPS_AUTO_UPDATE_ENABLED', 'true').toLowerCase() === 'true',
    repository: get('VPS_AUTO_UPDATE_REPOSITORY', 'https://github.com/Mickeymozy/Mickey-glitch-2.git'),
    branch: get('VPS_AUTO_UPDATE_BRANCH', 'main'),
    intervalMs: Number.isFinite(interval) && interval >= 30000 ? interval : 300000,
    startDelayMs: Number(get('VPS_AUTO_UPDATE_START_DELAY_MS', '60000')) || 60000
  };
}

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: options.timeout || 120000,
    maxBuffer: 4 * 1024 * 1024
  }).trim();
}

function createUpdater({ runCommand = run, logger = console, stateFile = UPDATE_STATE, settings = loadSettings } = {}) {
  let running = false;

  function runOnce() {
    if (running) return { status: 'busy' };
    running = true;

    try {
      const configuration = settings();
      if (!configuration.enabled) return { status: 'disabled' };
      if (!/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?$/.test(configuration.repository)) {
        throw new Error('Repository URL si GitHub HTTPS URL sahihi.');
      }
      if (!/^[A-Za-z0-9._/-]+$/.test(configuration.branch) || configuration.branch.startsWith('-')) {
        throw new Error('Branch name si sahihi.');
      }

      const root = runCommand('git', ['rev-parse', '--show-toplevel']);
      if (path.resolve(root) !== ROOT) throw new Error('PM2 cwd si root ya Git repository.');

      const changes = runCommand('git', ['status', '--porcelain']);
      if (changes) {
        logger.warn('[AutoUpdate] Kuna mabadiliko ya tracked files; update imesitishwa bila kubadilisha files.');
        return { status: 'dirty' };
      }

      let pending = null;
      try {
        pending = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
      } catch (_) {}

      if (!pending) {
        runCommand('git', ['fetch', '--quiet', '--no-tags', configuration.repository, `refs/heads/${configuration.branch}`]);
        const commits = runCommand('git', ['rev-list', '--count', 'HEAD..FETCH_HEAD']);
        if (!Number(commits)) return { status: 'current' };

        runCommand('git', ['merge', '--ff-only', 'FETCH_HEAD']);
        const commit = runCommand('git', ['rev-parse', 'HEAD']);
        fs.writeFileSync(stateFile, JSON.stringify({ commit, startedAt: new Date().toISOString() }), 'utf8');
        pending = { commit };
        logger.info(`[AutoUpdate] Commit mpya ${commit}; inasakinisha dependencies.`);
      }

      runCommand('npm', ['ci', '--omit=dev', '--no-audit', '--no-fund'], { timeout: 10 * 60 * 1000 });
      const processes = JSON.parse(runCommand('pm2', ['jlist']));
      const app = processes.find((item) => {
        const environment = item.pm2_env || {};
        return path.resolve(environment.pm_cwd || '') === ROOT &&
          path.resolve(environment.pm_exec_path || '') === path.join(ROOT, 'index.js');
      });
      if (!app) throw new Error('PM2 haijapata process ya app kuu ya index.js.');

      runCommand('pm2', ['restart', String(app.pm_id)], { timeout: 2 * 60 * 1000 });
      fs.rmSync(stateFile, { force: true });
      logger.info(`[AutoUpdate] ${pending.commit} imewekwa; PM2 imeombwa kuwasha app upya.`);
      return { status: 'updated', commit: pending.commit };
    } catch (error) {
      logger.error(`[AutoUpdate] Update haikukamilika; itajaribiwa tena: ${error.message}`);
      return { status: 'error', error };
    } finally {
      running = false;
    }
  }

  return { runOnce };
}

function start() {
  const updater = createUpdater();
  let nextCheckAt = Date.now() + loadSettings().startDelayMs;
  const check = () => {
    if (Date.now() < nextCheckAt) return;
    const configuration = loadSettings();
    nextCheckAt = Date.now() + configuration.intervalMs;
    const result = updater.runOnce();
    if (result.status === 'disabled') nextCheckAt = Date.now() + 30000;
  };

  setInterval(check, 30000);
  const configuration = loadSettings();
  console.log(configuration.enabled
    ? `[AutoUpdate] Inafuatilia ${configuration.repository} (${configuration.branch}) kila dakika ${Math.round(configuration.intervalMs / 60000)}.`
    : '[AutoUpdate] Imezimwa kupitia VPS_AUTO_UPDATE_ENABLED; itaendelea kuangalia mabadiliko ya settings.');
}

if (require.main === module) start();

module.exports = { createUpdater, start };
