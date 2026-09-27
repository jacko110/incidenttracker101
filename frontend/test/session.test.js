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
