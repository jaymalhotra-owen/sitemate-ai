// Dashboard login: password check, signed session cookies, public paths.
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.ADMIN_PASSWORD = 'correct horse battery staple';
const auth = await import('../lib/auth.js');
const req = (cookie = '') => ({ headers: { cookie }, socket: {} });

test('accepts only the configured password', () => {
  assert.equal(auth.authMode(), 'password');
  assert.equal(auth.checkPassword('correct horse battery staple'), true);
  assert.equal(auth.checkPassword('wrong'), false);
  assert.equal(auth.checkPassword(''), false);
  assert.equal(auth.checkPassword(undefined), false);
});

test('a session cookie from login authenticates; a tampered one does not', () => {
  const cookie = auth.sessionCookie(req()).split(';')[0];
  assert.equal(auth.isAuthed(req(cookie)), true);
  assert.equal(auth.isAuthed(req(`${cookie}x`)), false);
  assert.equal(auth.isAuthed(req()), false);
  assert.match(auth.sessionCookie(req()), /HttpOnly; SameSite=Lax/);
});

test('widget, preview and sample site stay public; dashboard API does not', () => {
  for (const p of ['/widget.js', '/api/widget/bot_1/chat', '/preview/bot_1', '/sample-site/', '/login', '/healthz']) assert.equal(auth.isPublicPath(p), true, p);
  for (const p of ['/', '/api/bots', '/api/ingest', '/api/bots/bot_1/config', '/app.js']) assert.equal(auth.isPublicPath(p), false, p);
});

test('DASHBOARD_PUBLIC=1 turns the login off even when a password is set', async () => {
  process.env.DASHBOARD_PUBLIC = '1';
  const fresh = await import(`../lib/auth.js?public=${Date.now()}`);
  assert.equal(fresh.authMode(), 'open');
  assert.equal(fresh.isAuthed({ headers: {}, socket: {} }), true);
  delete process.env.DASHBOARD_PUBLIC;
});
