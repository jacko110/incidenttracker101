import { test } from 'node:test';
import assert from 'node:assert/strict';
import { api, SESSION_INVALID } from '../src/api.js';

test('authenticated expiry and deactivation invalidate sessions, ordinary 403 and login failure do not', async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  const originalEvent = globalThis.CustomEvent;
  const events = [];
  globalThis.window = { dispatchEvent: event => events.push(event) };
  globalThis.CustomEvent = class { constructor(type, options) { this.type = type; this.detail = options.detail; } };
  const response = (status, body = {}) => { globalThis.fetch = async () => ({ status, ok: status < 400, json: async () => body }); };
  try {
    response(401, { error: 'Expired' });
    await assert.rejects(api.me('old-token'), /Expired/);
    assert.equal(events[0].type, SESSION_INVALID);
    assert.equal(events[0].detail.token, 'old-token');
    response(403, { code: 'ACCOUNT_DEACTIVATED' });
    await assert.rejects(api.me('disabled-token'));
    assert.equal(events.length, 2);
    response(403, { error: 'Insufficient permission' });
    await assert.rejects(api.users('analyst-token'));
    assert.equal(events.length, 2);
    response(401);
    await assert.rejects(api.login('bad', 'bad'));
    assert.equal(events.length, 2);
    await assert.rejects(api.uploadFiles('expired-upload-token', []));
    assert.equal(events.length, 3);
    assert.equal(events[2].detail.token, 'expired-upload-token');
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.window = originalWindow;
    globalThis.CustomEvent = originalEvent;
  }
});

test('network and server failures preserve the session and a later retry succeeds', async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  let events = 0;
  globalThis.window = { dispatchEvent: () => events++ };
  try {
    globalThis.fetch = async () => { throw new TypeError('Network unavailable'); };
    await assert.rejects(api.cases('valid-token'), /Network unavailable/);
    globalThis.fetch = async () => ({ status: 503, ok: false, json: async () => { throw new SyntaxError('HTML error page'); } });
    await assert.rejects(api.cases('valid-token'), /Request failed/);
    globalThis.fetch = async () => ({ status: 200, ok: true, json: async () => ({ data: [{ id: 1 }] }) });
    assert.deepEqual((await api.cases('valid-token')).data, [{ id: 1 }]);
    assert.equal(events, 0);
  } finally { globalThis.fetch = originalFetch; globalThis.window = originalWindow; }
});

test('case filters survive URL encoding and allCases retrieves every page', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  try {
    globalThis.fetch = async (url, options) => {
      const query = new URL(url, 'http://test.local').searchParams;
      calls.push({ query, options });
      const page = Number(query.get('page'));
      return { status: 200, ok: true, json: async () => ({ data: [{ id: page }], pagination: { totalPages: 3 } }) };
    };
    const result = await api.allCases('valid-token', { q: 'mail & proxy', due: 'overdue', assignedToMe: true, status: 'In Progress' });
    assert.deepEqual(result.data.map(item => item.id), [1, 2, 3]);
    for (const { query, options } of calls) {
      assert.equal(query.get('q'), 'mail & proxy');
      assert.equal(query.get('due'), 'overdue');
      assert.equal(query.get('assignedToMe'), '1');
      assert.equal(query.get('status'), 'In Progress');
      assert.equal(options.headers.Authorization, 'Bearer valid-token');
    }
  } finally { globalThis.fetch = originalFetch; }
});
