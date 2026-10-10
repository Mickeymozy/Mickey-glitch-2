const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const coinStore = require('../lib/coinStore');

test('PalmPesa completion credits coins once and deployment debits five coins', () => {
  const file = path.join(os.tmpdir(), `mickey-coins-${Date.now()}-${Math.random()}.json`);
  const previousFile = process.env.COIN_STORE_FILE;
  process.env.COIN_STORE_FILE = file;

  try {
    const pending = coinStore.createPendingTopUp({
      accountId: 'account_test',
      coins: 10,
      amount: 500,
      phone: '255700000000',
      transactionId: 'TXN-TEST-1'
    });

    assert.equal(coinStore.getWallet('account_test').balance, 0);
    coinStore.applyPaymentStatus(pending.transactionId, 'PENDING', { orderId: 'ORDER-TEST-1' });
    assert.equal(coinStore.getWallet('account_test').balance, 0);

    coinStore.applyPaymentStatus('ORDER-TEST-1', 'COMPLETED');
    coinStore.applyPaymentStatus('ORDER-TEST-1', 'COMPLETED');
    assert.equal(coinStore.getWallet('account_test').balance, 10);

    const deployment = coinStore.debitForDeployment('account_test', 'bot_test');
    assert.equal(deployment.wallet.balance, 5);
    assert.equal(coinStore.debitForDeployment('account_test', 'bot_test-2').wallet.balance, 0);
    assert.equal(coinStore.debitForDeployment('account_test', 'bot_test-3'), null);
  } finally {
    if (previousFile === undefined) delete process.env.COIN_STORE_FILE;
    else process.env.COIN_STORE_FILE = previousFile;
    fs.rmSync(file, { force: true });
  }
});

test('admin balance changes are validated and recorded in wallet history', () => {
  const file = path.join(os.tmpdir(), `mickey-coins-admin-${Date.now()}-${Math.random()}.json`);
  const previousFile = process.env.COIN_STORE_FILE;
  process.env.COIN_STORE_FILE = file;

  try {
    assert.equal(coinStore.setWalletBalance({
      accountId: 'account_admin_test',
      balance: 25,
      adminId: 'admin_test',
      note: 'Support adjustment'
    }).balance, 25);

    const adjustment = coinStore.listTransactions('account_admin_test')[0];
    assert.equal(adjustment.type, 'ADMIN_ADJUSTMENT');
    assert.equal(adjustment.coins, 25);
    assert.equal(adjustment.adminId, 'admin_test');
    assert.equal(adjustment.note, 'Support adjustment');
    assert.throws(() => coinStore.setWalletBalance({
      accountId: 'account_admin_test', balance: -1, adminId: 'admin_test'
    }), /non-negative/);
  } finally {
    if (previousFile === undefined) delete process.env.COIN_STORE_FILE;
    else process.env.COIN_STORE_FILE = previousFile;
    fs.rmSync(file, { force: true });
  }
});
