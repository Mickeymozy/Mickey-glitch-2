const fs = require('fs-extra');
const path = require('path');

const SESSION_BACKUP_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function isSessionRepairableError(error) {
    const text = String(error?.message || error || '').toLowerCase();
    return text.includes('bad mac') ||
        text.includes('failed to decrypt message with any known session') ||
        text.includes('session error');
}

function backupSignalState(authPath, timestamp = Date.now()) {
    if (!authPath || !fs.existsSync(authPath)) return null;

    const backupPath = `${authPath}_bad_mac_${timestamp}`;
    fs.ensureDirSync(backupPath);

    for (const entry of fs.readdirSync(authPath)) {
        if (entry === 'creds.json') continue;

        const source = path.join(authPath, entry);
        const destination = path.join(backupPath, entry);
        fs.moveSync(source, destination, { overwrite: true });
    }

    return backupPath;
}

function cleanupOldSessionBackups(authDir, now = Date.now(), maxAgeMs = SESSION_BACKUP_MAX_AGE_MS) {
    if (!authDir || !fs.existsSync(authDir)) return 0;

    let removed = 0;

    for (const entry of fs.readdirSync(authDir, { withFileTypes: true })) {
        const match = entry.name.match(/_(?:bad_mac|backup)_(\d+)$/);
        if (!match || !entry.isDirectory()) continue;

        const createdAt = Number(match[1]);
        if (!Number.isFinite(createdAt) || now - createdAt < maxAgeMs) continue;

        fs.removeSync(path.join(authDir, entry.name));
        removed++;
    }

    return removed;
}

module.exports = {
    isSessionRepairableError,
    backupSignalState,
    cleanupOldSessionBackups,
    SESSION_BACKUP_MAX_AGE_MS
};