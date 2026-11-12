const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');

const { createWindowRateLimiter } = require('../lib/rateLimit');

function createResponse() {
  const response = new EventEmitter();
  response.statusCode = 200;
  response.headers = {};
  response.setHeader = (name, value) => { response.headers[name] = value; };
  response.status = (statusCode) => {
    response.statusCode = statusCode;
    return response;
  };
  response.json = (body) => {
    response.body = body;
    return response;
  };
  return response;
}

test('window rate limiter blocks excess requests and returns retry time', () => {
  let timestamp = 1000;
  const limiter = createWindowRateLimiter({
    limit: 2,
    windowMs: 5000,
    keyGenerator: (req) => req.ip,
    message: 'Too many requests',
    now: () => timestamp
  });
  const req = { ip: '192.0.2.1' };
  let nextCount = 0;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = createResponse();
    limiter(req, response, () => { nextCount += 1; });
    response.statusCode = 401;
    response.emit('finish');
  }

  const blockedResponse = createResponse();
  limiter(req, blockedResponse, () => { nextCount += 1; });

  assert.equal(nextCount, 2);
  assert.equal(blockedResponse.statusCode, 429);
  assert.equal(blockedResponse.headers['Retry-After'], '5');
  assert.equal(blockedResponse.body.error, 'Too many requests');

  timestamp += 5000;
  const resetResponse = createResponse();
  limiter(req, resetResponse, () => { nextCount += 1; });
  assert.equal(nextCount, 3);
});

test('successful requests clear the client bucket', () => {
  const limiter = createWindowRateLimiter({
    limit: 1,
    windowMs: 5000,
    keyGenerator: (req) => req.ip,
    message: 'Too many requests',
    now: () => 1000
  });
  const req = { ip: '192.0.2.2' };

  const firstResponse = createResponse();
  limiter(req, firstResponse, () => {});
  firstResponse.emit('finish');

  const nextResponse = createResponse();
  let nextCalled = false;
  limiter(req, nextResponse, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
});

test('configured API limits retain successful requests in the window', () => {
  const limiter = createWindowRateLimiter({
    limit: 1,
    windowMs: 5000,
    keyGenerator: (req) => req.ip,
    message: 'Too many requests',
    now: () => 1000,
    resetOnSuccess: false
  });
  const req = { ip: '192.0.2.3' };
  const firstResponse = createResponse();
  limiter(req, firstResponse, () => {});
  firstResponse.emit('finish');

  const blockedResponse = createResponse();
  limiter(req, blockedResponse, () => {});
  assert.equal(blockedResponse.statusCode, 429);
});