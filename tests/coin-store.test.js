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

test('manual transfer requests credit coins only after one admin approval', () => {
  const file = path.join(os.tmpdir(), `mickey-manual-coins-${Date.now()}-${Math.random()}.json`);
  const previousFile = process.env.COIN_STORE_FILE;
  process.env.COIN_STORE_FILE = file;

  try {
    const pending = coinStore.createManualTopUpRequest({
      accountId: 'account_manual_test',
      amount: 2500,
      payerPhone: '255615000000',
      reference: 'HALO12345'
    });

    assert.equal(pending.coins, 50);
    assert.equal(pending.status, 'PENDING');
    assert.equal(coinStore.getWallet('account_manual_test').balance, 0);
    assert.throws(() => coinStore.createManualTopUpRequest({
      accountId: 'account_other', amount: 2500, payerPhone: '255615000000', reference: 'HALO12345'
    }), /already imetumika/);

    const approved = coinStore.approveManualTopUp(pending.id, 'admin_test');
    assert.equal(approved.status, 'SUCCESS');
    assert.equal(coinStore.getWallet('account_manual_test').balance, 50);
    assert.throws(() => coinStore.approveManualTopUp(pending.id, 'admin_test'), /tayari limefanyiwa/);
  } finally {
    if (previousFile === undefined) delete process.env.COIN_STORE_FILE;
    else process.env.COIN_STORE_FILE = previousFile;
    fs.rmSync(file, { force: true });
  }
});

test('manual transfer requests validate amount, payer phone and receipt reference', () => {
  const file = path.join(os.tmpdir(), `mickey-manual-invalid-${Date.now()}-${Math.random()}.json`);
  const previousFile = process.env.COIN_STORE_FILE;
  process.env.COIN_STORE_FILE = file;

  try {
    assert.throws(() => coinStore.createManualTopUpRequest({ accountId: 'a', amount: 120, payerPhone: '255615000000', reference: 'HALO12345' }), /kigawanyike/);
    assert.throws(() => coinStore.createManualTopUpRequest({ accountId: 'a', amount: 250, payerPhone: '123', reference: 'HALO12345' }), /namba/);
    assert.throws(() => coinStore.createManualTopUpRequest({ accountId: 'a', amount: 250, payerPhone: '255615000000', reference: 'no' }), /reference/);
  } finally {
    if (previousFile === undefined) delete process.env.COIN_STORE_FILE;
    else process.env.COIN_STORE_FILE = previousFile;
    fs.rmSync(file, { force: true });
  }
});

test('failed bot deployment refunds the debit once', () => {
  const file = path.join(os.tmpdir(), `mickey-deploy-refund-${Date.now()}-${Math.random()}.json`);
  const previousFile = process.env.COIN_STORE_FILE;
  process.env.COIN_STORE_FILE = file;

  try {
    coinStore.setWalletBalance({ accountId: 'account_refund_test', balance: 10, adminId: 'admin_test', note: 'Test setup' });
    coinStore.debitForDeployment('account_refund_test', 'bot_failed');
    assert.equal(coinStore.getWallet('account_refund_test').balance, 5);
    assert.equal(coinStore.refundDeployment('account_refund_test', 'bot_failed').wallet.balance, 10);
    assert.equal(coinStore.refundDeployment('account_refund_test', 'bot_failed'), null);
    assert.equal(coinStore.listTransactions('account_refund_test').filter((item) => item.type === 'DEPLOYMENT_REFUND').length, 1);
  } finally {
    if (previousFile === undefined) delete process.env.COIN_STORE_FILE;
    else process.env.COIN_STORE_FILE = previousFile;
    fs.rmSync(file, { force: true });
  }
});
