'use strict';

const isOwnerOrSudo = require('../lib/isOwner');
const { createUpdater } = require('../scripts/vps-auto-update');

async function updateCommand(sock, chatId, message) {
  const senderId = message.key.participant || message.key.remoteJid;
  if (!message.key.fromMe && !isOwnerOrSudo(senderId, sock)) {
    await sock.sendMessage(chatId, {
      text: 'Amri hii inaruhusiwa kwa owner au sudo pekee.'
    }, { quoted: message });
    return;
  }

  await sock.sendMessage(chatId, { react: { text: '\u23f3', key: message.key } });
  await sock.sendMessage(chatId, { text: 'Ninaangalia GitHub na kuanza update salama...' }, { quoted: message });

  const updater = createUpdater();
  const result = updater.runOnce({ force: true });

  if (result.status === 'updated') {
    await sock.sendMessage(chatId, {
      text: `Update imekamilika (${result.commit.slice(0, 7)}). App itawaka upya kupitia process manager ya host.`
    }, { quoted: message });
    return;
  }

  const messages = {
    current: 'Bot tayari iko kwenye version ya mwisho ya branch iliyosanidiwa.',
    dirty: 'Update imesitishwa: kuna mabadiliko ya local kwenye Git checkout. Hifadhi au rudisha mabadiliko hayo kisha jaribu tena.',
    busy: 'Update nyingine inaendelea. Subiri imalizike kisha jaribu tena.',
    disabled: 'Auto-update imezimwa kwenye settings.',
    error: 'Update imeshindwa. Angalia log za host kwa maelezo zaidi.'
  };
  await sock.sendMessage(chatId, { text: messages[result.status] || messages.error }, { quoted: message });
}

module.exports = updateCommand;
