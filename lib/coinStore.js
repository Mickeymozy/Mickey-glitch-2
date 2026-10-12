const fs = require('fs');
const path = require('path');

const COINS_PER_BOT = 5;
const TZS_PER_COIN = 50;
const DEFAULT_FILE = path.join(process.cwd(), 'data', 'coin_wallets.json');

function storeFile() {
  return process.env.COIN_STORE_FILE || DEFAULT_FILE;
}

function emptyStore() {
  return { wallets: {}, transactions: [] };
}

function ensureStoreFile() {
  const file = storeFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(emptyStore(), null, 2), 'utf8');
  return file;
}

function loadStore() {
  try {
    const raw = fs.readFileSync(ensureStoreFile(), 'utf8');
    const parsed = JSON.parse(raw || '{}');
    return {
      wallets: parsed.wallets && typeof parsed.wallets === 'object' ? parsed.wallets : {},
      transactions: Array.isArray(parsed.transactions) ? parsed.transactions : []
    };
  } catch (error) {
    console.error('[coinStore] load failed:', error.message);
    return emptyStore();
  }
}

function saveStore(store) {
  fs.writeFileSync(ensureStoreFile(), JSON.stringify(store, null, 2), 'utf8');
  return store;
}

function walletFor(store, accountId) {
  const id = String(accountId || '');
  if (!id) throw new Error('accountId is required');
  if (!store.wallets[id]) store.wallets[id] = { balance: 0, updatedAt: new Date().toISOString() };
  return store.wallets[id];
}

function getWallet(accountId) {
  const store = loadStore();
  const wallet = walletFor(store, accountId);
  return {
    accountId: String(accountId),
    balance: Number(wallet.balance) || 0,
    deployableBots: Math.floor((Number(wallet.balance) || 0) / COINS_PER_BOT),
    updatedAt: wallet.updatedAt || null
  };
}

function listTransactions(accountId) {
  const store = loadStore();
  return store.transactions
    .filter((item) => !accountId || item.accountId === String(accountId))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function addTransaction(store, transaction) {
  const item = {
    id: transaction.id || `coin_tx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    ...transaction
  };
  store.transactions.push(item);
  return item;
}

function createPendingTopUp({ accountId, coins, amount, phone, transactionId }) {
  const store = loadStore();
  const item = addTransaction(store, {
    accountId: String(accountId),
    transactionId,
    orderId: null,
    type: 'COIN_PURCHASE',
    coins: Number(coins),
    amount: Number(amount),
    phone,
    provider: 'PALMPESA',
    status: 'PENDING'
  });
  saveStore(store);
  return item;
}

function createManualTopUpRequest({ accountId, amount, payerPhone, reference }) {
  const numericAmount = Number(amount);
  const receipt = String(reference || '').trim().toUpperCase();
  const phone = String(payerPhone || '').trim();
  if (!Number.isSafeInteger(numericAmount) || numericAmount < TZS_PER_COIN || numericAmount % TZS_PER_COIN !== 0) {
    throw new Error(`Kiasi kiwe TZS ${TZS_PER_COIN} au zaidi, na kigawanyike kwa ${TZS_PER_COIN}.`);
  }
  if (!receipt || receipt.length < 5 || receipt.length > 80 || !/^[A-Z0-9/-]+$/.test(receipt)) {
    throw new Error('Weka reference ya muamala yenye herufi 5 hadi 80.');
  }
  if (!/^\d{7,15}$/.test(phone)) throw new Error('Weka namba uliyolipia kwa muundo wa kimataifa.');

  const store = loadStore();
  const duplicate = store.transactions.some((item) => String(item.reference || '').toUpperCase() === receipt);
  if (duplicate) throw new Error('Reference hii ya muamala tayari imetumika.');
  const transaction = addTransaction(store, {
    accountId: String(accountId),
    transactionId: `MANUAL-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    reference: receipt,
    orderId: null,
    type: 'MANUAL_COIN_PURCHASE',
    coins: numericAmount / TZS_PER_COIN,
    amount: numericAmount,
    phone,
    provider: 'HALOTEL_MANUAL',
    receiver: '255615944741',
    recipientName: 'MICKDADI HAMZA SALIM',
    status: 'PENDING'
  });
  saveStore(store);
  return transaction;
}

function approveManualTopUp(transactionId, adminId) {
  if (!adminId) throw new Error('adminId is required');
  const store = loadStore();
  const transaction = findTransaction(store, transactionId);
  if (!transaction || transaction.type !== 'MANUAL_COIN_PURCHASE') throw new Error('Ombi la malipo halijapatikana.');
  if (transaction.status !== 'PENDING') throw new Error('Ombi hili tayari limefanyiwa uamuzi.');
  return applyPaymentStatus(transaction.id, 'COMPLETED', { adminId: String(adminId), approvedAt: new Date().toISOString() });
}

function rejectManualTopUp(transactionId, adminId, note = '') {
  if (!adminId) throw new Error('adminId is required');
  const store = loadStore();
  const transaction = findTransaction(store, transactionId);
  if (!transaction || transaction.type !== 'MANUAL_COIN_PURCHASE') throw new Error('Ombi la malipo halijapatikana.');
  if (transaction.status !== 'PENDING') throw new Error('Ombi hili tayari limefanyiwa uamuzi.');
  transaction.status = 'FAILED';
  transaction.adminId = String(adminId);
  transaction.adminNote = String(note).trim().slice(0, 240);
  transaction.updatedAt = new Date().toISOString();
  saveStore(store);
  return transaction;
}

function findTransaction(store, reference) {
  const value = String(reference || '');
  return store.transactions.find((item) =>
    item.id === value || item.orderId === value || item.transactionId === value || item.reference === value
  );
}

function applyPaymentStatus(reference, status, details = {}) {
  const store = loadStore();
  const transaction = findTransaction(store, reference);
  if (!transaction) return null;

  const normalizedStatus = String(status || '').toUpperCase();
  transaction.status = normalizedStatus === 'COMPLETED' ? 'SUCCESS' : normalizedStatus === 'FAILED' ? 'FAILED' : 'PENDING';
  transaction.updatedAt = new Date().toISOString();
  Object.assign(transaction, details);

  if (transaction.status === 'SUCCESS' && !transaction.creditedAt) {
    const wallet = walletFor(store, transaction.accountId);
    wallet.balance = (Number(wallet.balance) || 0) + Number(transaction.coins || 0);
    wallet.updatedAt = new Date().toISOString();
    transaction.creditedAt = wallet.updatedAt;
  }

  saveStore(store);
  return transaction;
}

function debitForDeployment(accountId, botId) {
  const store = loadStore();
  const wallet = walletFor(store, accountId);
  if ((Number(wallet.balance) || 0) < COINS_PER_BOT) return null;

  wallet.balance -= COINS_PER_BOT;
  wallet.updatedAt = new Date().toISOString();
  const transaction = addTransaction(store, {
    accountId: String(accountId),
    type: 'BOT_DEPLOYMENT',
    coins: -COINS_PER_BOT,
    amount: -COINS_PER_BOT * TZS_PER_COIN,
    botId: botId || null,
    provider: 'INTERNAL',
    status: 'SUCCESS'
  });
  saveStore(store);
  return { transaction, wallet: getWallet(accountId) };
}

function refundDeployment(accountId, botId, note = 'Bot haikufanikiwa ku-connect') {
  const store = loadStore();
  const deployment = store.transactions.find((item) =>
    item.accountId === String(accountId) && item.type === 'BOT_DEPLOYMENT' && item.botId === String(botId)
  );
  if (!deployment || deployment.status !== 'SUCCESS' || deployment.refundAt) return null;

  const wallet = walletFor(store, accountId);
  wallet.balance = (Number(wallet.balance) || 0) + COINS_PER_BOT;
  wallet.updatedAt = new Date().toISOString();
  deployment.status = 'REFUNDED';
  deployment.refundAt = wallet.updatedAt;
  addTransaction(store, {
    accountId: String(accountId),
    type: 'DEPLOYMENT_REFUND',
    coins: COINS_PER_BOT,
    amount: COINS_PER_BOT * TZS_PER_COIN,
    botId: String(botId),
    provider: 'INTERNAL',
    status: 'SUCCESS',
    note: String(note).slice(0, 240)
  });
  saveStore(store);
  return { wallet: getWallet(accountId), deployment };
}

function setWalletBalance({ accountId, balance, adminId, note = '' }) {
  const nextBalance = Number(balance);
  if (!Number.isSafeInteger(nextBalance) || nextBalance < 0) {
    throw new Error('balance must be a non-negative safe integer');
  }
  if (!adminId) throw new Error('adminId is required');

  const store = loadStore();
  const wallet = walletFor(store, accountId);
  const previousBalance = Number(wallet.balance) || 0;
  const delta = nextBalance - previousBalance;
  if (!Number.isSafeInteger(delta * TZS_PER_COIN)) {
    throw new Error('balance adjustment is too large');
  }
  wallet.balance = nextBalance;
  wallet.updatedAt = new Date().toISOString();

  if (delta !== 0) {
    addTransaction(store, {
      accountId: String(accountId),
      type: 'ADMIN_ADJUSTMENT',
      coins: delta,
      amount: delta * TZS_PER_COIN,
      previousBalance,
      balance: nextBalance,
      provider: 'ADMIN',
      status: 'SUCCESS',
      adminId: String(adminId),
      note: String(note).trim().slice(0, 240)
    });
  }

  saveStore(store);
  return getWallet(accountId);
}

module.exports = {
  COINS_PER_BOT,
  TZS_PER_COIN,
  getWallet,
  listTransactions,
  createPendingTopUp,
  createManualTopUpRequest,
  approveManualTopUp,
  rejectManualTopUp,
  applyPaymentStatus,
  debitForDeployment,
  refundDeployment,
  setWalletBalance
};
