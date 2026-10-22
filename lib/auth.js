// Dashboard login: one admin password (ADMIN_PASSWORD), signed session cookie.
// Public surfaces (widget.js, /api/widget/*, /preview/*, the sample site) stay open;
// everything else — the dashboard and its API — needs a session.
// When running on a host (FLY_APP_NAME or NODE_ENV=production) without ADMIN_PASSWORD,
// the dashboard is locked rather than left open.

import crypto from 'node:crypto';

const COOKIE = 'sitemate_session';
const MAX_AGE_S = 7 * 24 * 3600;
const PASSWORD = process.env.ADMIN_PASSWORD || '';
const HOSTED = Boolean(process.env.FLY_APP_NAME) || process.env.NODE_ENV === 'production';
// Sessions are signed with a key derived from the password, so changing the password
// signs everyone out. SESSION_SECRET can be set to rotate sessions independently.
const KEY = crypto.createHash('sha256').update(`${process.env.SESSION_SECRET || ''}:${PASSWORD}:sitemate-session-v1`).digest();

// DASHBOARD_PUBLIC=1 deliberately turns the login off (e.g. for a short demo). Anyone
// with the URL can then manage chatbots and use the AI quota.
const PUBLIC = process.env.DASHBOARD_PUBLIC === '1';

export const authMode = () => (PUBLIC ? 'open' : PASSWORD ? 'password' : HOSTED ? 'locked' : 'open');

const sign = (payload) => crypto.createHmac('sha256', KEY).update(payload).digest('base64url');

function makeToken() {
  const payload = `${Math.floor(Date.now() / 1000) + MAX_AGE_S}.${crypto.randomBytes(9).toString('base64url')}`;
  return `${payload}.${sign(payload)}`;
}

function validToken(token) {
  const i = token?.lastIndexOf('.') ?? -1;
  if (i < 0) return false;
  const payload = token.slice(0, i);
  const mac = Buffer.from(token.slice(i + 1));
  const want = Buffer.from(sign(payload));
  if (mac.length !== want.length || !crypto.timingSafeEqual(mac, want)) return false;
  return Number(payload.split('.')[0]) > Date.now() / 1000;
}

function readCookie(req, name) {
  for (const part of (req.headers.cookie || '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

export function isAuthed(req) {
  const mode = authMode();
  if (mode === 'open') return true;
  if (mode === 'locked') return false;
  return validToken(readCookie(req, COOKIE));
}

export function checkPassword(given) {
  if (!PASSWORD || typeof given !== 'string') return false;
  const a = crypto.createHash('sha256').update(given).digest();
  const b = crypto.createHash('sha256').update(PASSWORD).digest();
  return crypto.timingSafeEqual(a, b);
}

const secureFlag = (req) => (req.headers['x-forwarded-proto'] === 'https' || req.socket.encrypted ? '; Secure' : '');

export const sessionCookie = (req) => `${COOKIE}=${makeToken()}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE_S}${secureFlag(req)}`;
export const clearCookie = (req) => `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secureFlag(req)}`;

/** Paths anyone may load: the embeddable widget, its API, test pages and the sample site. */
export function isPublicPath(p) {
  return p === '/widget.js' || p === '/favicon.svg' || p === '/robots.txt' || p === '/sitemap.xml'
    || p === '/login' || p === '/logout' || p === '/healthz'
    || p.startsWith('/api/widget/') || p.startsWith('/preview/')
    || p === '/sample-site' || p.startsWith('/sample-site/');
}

export function loginPage({ error = '', locked = false } = {}) {
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sign in — SiteMate AI</title><link rel="icon" href="/favicon.svg" type="image/svg+xml">
<style>
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:16px;background:#fafafa;color:#18181b;font:14px/1.5 Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
form{width:min(360px,100%);background:#fff;border:1px solid #e4e4e7;border-radius:12px;padding:28px}
h1{font-size:18px;margin:14px 0 4px;letter-spacing:-.02em}p{margin:0 0 18px;color:#71717a}
.mark{width:28px;height:28px;border-radius:7px;background:#18181b;display:grid;place-items:center}
label{display:grid;gap:6px;font-weight:600;font-size:13px;color:#3f3f46}
input{height:38px;border:1px solid #e4e4e7;border-radius:8px;padding:0 12px;font:inherit;outline:none}input:focus{border-color:#18181b;box-shadow:0 0 0 3px rgba(0,0,0,.06)}
button{margin-top:14px;width:100%;height:38px;border:0;border-radius:8px;background:#18181b;color:#fff;font:600 14px/1 inherit;cursor:pointer}button:hover{background:#3f3f46}
.err{margin:12px 0 0;color:#d93a4a;font-weight:500}
</style></head><body>
<form method="post" action="/login">
  <div class="mark"><svg width="16" height="16" viewBox="0 0 24 24" fill="#fff"><path d="M5 7a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3h-4l-4 3.5V16a3 3 0 0 1-3-3z"/></svg></div>
  <h1>SiteMate AI</h1>
  ${locked
    ? '<p>The dashboard is locked because no <code>ADMIN_PASSWORD</code> is set on the server. Set it in your host’s environment settings (e.g. Render → Environment) and redeploy.</p>'
    : `<p>Sign in to manage your chatbots.</p>
  <label>Password<input type="password" name="password" autocomplete="current-password" autofocus required></label>
  <button type="submit">Sign in</button>
  ${error ? `<p class="err">${esc(error)}</p>` : ''}`}
</form></body></html>`;
}
