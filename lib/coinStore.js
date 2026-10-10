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
  applyPaymentStatus,
  debitForDeployment,
  setWalletBalance
};
