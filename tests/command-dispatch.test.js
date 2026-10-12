const fs = require('node:fs/promises');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const { invokeCommand } = require('../lib/commandInvoker');
const { parseCommandArgs } = require('../commands/checkupdates');
const statusModulePath = require.resolve('../commands/autostatus');
const { handleStatusUpdate, handleAutoStatus } = require('../commands/autostatus');
const CONFIG_PATH = path.join(__dirname, '../data/autoStatus.json');

test('checkupdates parses full command text with custom prefixes', () => {
  assert.deepEqual(parseCommandArgs('.checkupdates auto'), ['auto']);
  assert.deepEqual(parseCommandArgs('!checkupdates status'), ['status']);
  assert.deepEqual(parseCommandArgs(['status']), ['status']);
});

test('status handler is exported under both compatibility names', () => {
  assert.equal(typeof handleStatusUpdate, 'function');
  assert.equal(typeof handleAutoStatus, 'function');
  assert.equal(handleStatusUpdate, handleAutoStatus);
});

test('invokeCommand passes real chatId, senderId, text and message to modern handlers', async () => {
  const msg = {
    key: {
      participant: '255712345678@s.whatsapp.net',
      remoteJid: '123456@g.us',
      fromMe: false
    },
    message: {
      conversation: '.add 255612130873'
    }
  };

  let seen;
  const command = async (sock, chatId, senderId, text, message, isSenderAdmin) => {
    seen = { chatId, senderId, text, message, isSenderAdmin };
    return 'ok';
  };

  const result = await invokeCommand(command, { id: 'bot' }, '123456@g.us', msg, true, '255612130873', {}, {}, {}, 'bot');

  assert.equal(result, 'ok');
  assert.equal(seen.chatId, '123456@g.us');
  assert.equal(seen.senderId, '255712345678@s.whatsapp.net');
  assert.equal(seen.text, '255612130873');
  assert.equal(seen.message, msg);
  assert.equal(seen.isSenderAdmin, true);
});

test('invokeCommand supports legacy handlers that receive message as third argument', async () => {
  const msg = {
    key: {
      participant: '255700000001@s.whatsapp.net',
      remoteJid: '987654@g.us',
      fromMe: false
    },
    message: {
      conversation: '.tagall'
    }
  };

  let seen;
  const command = async (sock, chatId, message) => {
    seen = { chatId, message };
    return 'legacy';
  };

  const result = await invokeCommand(command, { id: 'bot' }, '987654@g.us', msg, false, '', {}, {}, {}, 'bot');

  assert.equal(result, 'legacy');
  assert.equal(seen.chatId, '987654@g.us');
  assert.equal(seen.message, msg);
});


test('handleStatusUpdate auto-views and auto-likes status updates even without a participant field', async () => {
  const originalConfig = await fs.readFile(CONFIG_PATH, 'utf8').catch(() => null);
  const nextConfig = JSON.stringify({ enabled: true, viewEnabled: true, likeEnabled: true, forwardEnabled: false, forwardNumber: '' }, null, 2);

  await fs.mkdir(path.dirname(CONFIG_PATH), { recursive: true });
  await fs.writeFile(CONFIG_PATH, nextConfig, 'utf8');
  delete require.cache[statusModulePath];

  const { handleStatusUpdate: freshHandleStatusUpdate } = require('../commands/autostatus');
  let viewCount = 0;
  let reactionCount = 0;

  const sock = {
    user: { id: '255000000000@s.whatsapp.net' },
    readMessages: async () => {
      viewCount += 1;
    },
    sendMessage: async () => {
      reactionCount += 1;
    }
  };

  await freshHandleStatusUpdate(sock, {
    key: {
      remoteJid: 'status@broadcast',
      id: 'status-123',
      participant: undefined
    },
    message: {
      conversation: 'hello there'
    }
  });

  assert.equal(viewCount, 1);
  assert.equal(reactionCount, 1);

  if (originalConfig === null) {
    await fs.unlink(CONFIG_PATH).catch(() => {});
  } else {
    await fs.writeFile(CONFIG_PATH, originalConfig, 'utf8');
  }
  delete require.cache[statusModulePath];
});
