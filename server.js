// SiteMate AI — prototype server (zero-framework Node.js).
//   Dashboard ............ GET  /
//   Ingestion ............ POST /api/ingest            → { jobId }   (real crawl)
//                          GET  /api/jobs/:id          → live progress
//   Bots ................. GET  /api/bots, GET/DELETE /api/bots/:id
//   Knowledge search ..... GET  /api/bots/:id/search?q=
//   Config (dashboard) ... PUT  /api/bots/:id/config
//   Public widget API .... GET  /api/widget/:id/config, POST /api/widget/:id/chat  (CORS)
//   Widget script ........ GET  /widget.js
//   Install test page .... GET  /preview/:id
//   Bundled sample site .. GET  /sample-site/*  (+ /robots.txt, /sitemap.xml)

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { crawlSite } from './lib/crawler.js';
import * as store from './lib/store.js';
import { answerQuestion, llmStatus } from './lib/answer.js';
import { renderSamplePage, sampleRobots, sampleSitemap, SAMPLE_PREFIX, SAMPLE_NAME, SAMPLE_SUGGESTED } from './lib/sample-site.js';
import * as auth from './lib/auth.js';

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '127.0.0.1';
const PUBLIC_URL = (process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
const PUBLIC_DIR = path.resolve('public');
const MAX_PAGES_LIMIT = Number(process.env.SITEMATE_MAX_PAGES || 50);

await store.load();
const jobs = new Map();

// ---------- helpers ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json' };

function send(res, status, body, headers = {}) {
  const isObj = typeof body === 'object' && !Buffer.isBuffer(body);
  res.writeHead(status, { 'content-type': isObj ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8', 'x-content-type-options': 'nosniff', ...headers });
  res.end(isObj ? JSON.stringify(body) : body);
}

async function readJson(req, limit = 400_000) {
  let size = 0; const parts = [];
  for await (const c of req) { size += c.length; if (size > limit) throw Object.assign(new Error('Body too large'), { status: 413 }); parts.push(c); }
  if (!size) return {};
  try { return JSON.parse(Buffer.concat(parts).toString('utf8')); } catch { throw Object.assign(new Error('Invalid JSON'), { status: 400 }); }
}

function serveStatic(res, rel) {
  const file = path.resolve(PUBLIC_DIR, '.' + rel);
  if (!file.startsWith(PUBLIC_DIR)) return send(res, 403, 'Forbidden');
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, 'Not found');
    send(res, 200, data, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
  });
}

// Very small fixed-window rate limiter for the public chat endpoint.
const hits = new Map();
function rateLimited(key, limit = 30, windowMs = 60_000) {
  const now = Date.now();
  const h = hits.get(key);
  if (!h || now - h.start > windowMs) { hits.set(key, { start: now, n: 1 }); return false; }
  return ++h.n > limit;
}

function corsFor(bot, req) {
  const origin = req.headers.origin;
  const allowed = bot?.config.allowedOrigins || [];
  if (allowed.length && origin && !allowed.includes(origin) && !origin.startsWith(PUBLIC_URL)) return null;
  return { 'access-control-allow-origin': origin || '*', 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'content-type', vary: 'origin' };
}

function botSummary(b) {
  const counts = { indexed: 0, skipped: 0, failed: 0 };
  for (const e of b.crawl.log) counts[e.status] = (counts[e.status] || 0) + 1;
  return {
    id: b.id, siteName: b.siteName, origin: b.origin, startUrl: b.startUrl, createdAt: b.createdAt,
    sample: b.sample, source: b.source,
    pages: b.pages.length, chunks: b.chunks.length,
    words: b.pages.reduce((s, p) => s + p.words, 0),
    crawl: { ...counts, discovered: b.crawl.discovered, notFetched: b.crawl.notFetched, finishedAt: b.crawl.finishedAt },
    config: b.config, stats: b.stats,
  };
}

// ---------- ingestion ----------
function startIngest({ url, maxPages, sample }) {
  const job = { id: store.newId('job'), status: 'running', phase: 'queued', startedAt: Date.now(), events: [], log: [], botId: null, error: null, sample };
  jobs.set(job.id, job);
  const startUrl = sample ? `${PUBLIC_URL}${SAMPLE_PREFIX}/` : url;
  job.url = startUrl;

  crawlSite(startUrl, {
    maxPages,
    scope: sample ? SAMPLE_PREFIX : undefined,
    allowOrigins: sample ? [new URL(PUBLIC_URL).origin] : [],
    onEvent: (ev) => {
      if (ev.type === 'phase') job.phase = ev.phase;
      if (ev.type === 'page') job.log.push(ev.entry);
      else job.events.push({ t: Date.now() - job.startedAt, ...ev });
    },
  }).then((result) => {
    if (!result.pages.length) {
      job.status = 'failed';
      job.error = result.log.length
        ? 'No pages could be indexed. Every page was skipped or failed — see the crawl log for reasons.'
        : 'The website could not be reached.';
      return;
    }
    job.phase = 'index';
    job.events.push({ t: Date.now() - job.startedAt, type: 'phase', phase: 'index', message: 'Building knowledge base' });
    const bot = store.createBot({
      source: sample ? 'sample' : 'crawl', startUrl: result.startUrl, origin: result.origin,
      pages: result.pages, log: result.log, notes: job.events.filter((e) => e.type === 'note').map((e) => e.message), discovered: result.discovered, notFetched: result.notFetched,
      siteName: sample ? SAMPLE_NAME : undefined, suggested: sample ? SAMPLE_SUGGESTED : undefined,
    });
    job.botId = bot.id;
    job.status = 'done';
    job.phase = 'ready';
  }).catch((e) => {
    job.status = 'failed';
    job.error = e.message || String(e);
  });
  return job;
}

// ---------- router ----------
async function handle(req, res) {
  const url = new URL(req.url, PUBLIC_URL);
  const p = url.pathname;
  const m = (re) => p.match(re);
  let r;

  // ---- dashboard login (see lib/auth.js) ----
  if (p === '/healthz') return send(res, 200, 'ok');
  if (p === '/login' && req.method === 'POST') {
    if (rateLimited(`login:${req.socket.remoteAddress}`, 10)) return send(res, 429, auth.loginPage({ error: 'Too many attempts — wait a minute.' }), { 'content-type': 'text/html; charset=utf-8' });
    let body = '';
    for await (const c of req) { body += c; if (body.length > 4096) break; }
    const password = new URLSearchParams(body).get('password');
    if (auth.checkPassword(password)) {
      res.writeHead(303, { location: '/', 'set-cookie': auth.sessionCookie(req) });
      return res.end();
    }
    return send(res, 401, auth.loginPage({ error: 'Wrong password.' }), { 'content-type': 'text/html; charset=utf-8' });
  }
  if (p === '/login') {
    if (auth.isAuthed(req)) { res.writeHead(303, { location: '/' }); return res.end(); }
    return send(res, 200, auth.loginPage({ locked: auth.authMode() === 'locked' }), { 'content-type': 'text/html; charset=utf-8' });
  }
  if (p === '/logout') { res.writeHead(303, { location: '/login', 'set-cookie': auth.clearCookie(req) }); return res.end(); }
  if (!auth.isPublicPath(p) && !auth.isAuthed(req)) {
    if (p.startsWith('/api/')) return send(res, 401, { error: 'Sign in required' });
    res.writeHead(303, { location: '/login' }); return res.end();
  }

  // Bundled sample site + its robots/sitemap (crawled for real by the demo).
  if (p === '/robots.txt') return send(res, 200, sampleRobots());
  if (p === '/sitemap.xml') return send(res, 200, sampleSitemap(PUBLIC_URL), { 'content-type': 'application/xml' });
  if (p === SAMPLE_PREFIX || p.startsWith(SAMPLE_PREFIX + '/')) {
    const html = renderSamplePage(p, { widgetBotId: url.searchParams.get('widget') });
    return html ? send(res, 200, html, { 'content-type': 'text/html; charset=utf-8' }) : send(res, 404, 'Page not found');
  }

  // Install test page: a neutral host page with the real embed snippet.
  if ((r = m(/^\/preview\/([\w-]+)$/))) {
    const bot = store.getBot(r[1]);
    if (!bot) return send(res, 404, 'Bot not found');
    if (bot.sample) {
      res.writeHead(302, { location: `${SAMPLE_PREFIX}/?widget=${bot.id}${url.searchParams.get('embed') === '1' ? '&embed=1' : ''}` });
      return res.end();
    }
    const tpl = fs.readFileSync(path.join(PUBLIC_DIR, 'preview.html'), 'utf8');
    const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    return send(res, 200, tpl.replaceAll('{{BOT_ID}}', bot.id).replaceAll('{{SITE}}', esc(bot.siteName)).replaceAll('{{ORIGIN}}', esc(bot.origin)), { 'content-type': 'text/html; charset=utf-8' });
  }

  if (!p.startsWith('/api/')) {
    if (p === '/' || p === '/index.html') return serveStatic(res, '/index.html');
    return serveStatic(res, p);
  }

  // ---- public widget API (CORS) ----
  if ((r = m(/^\/api\/widget\/([\w-]+)\/(config|chat)$/))) {
    const bot = store.getBot(r[1]);
    const cors = corsFor(bot, req);
    if (!cors) return send(res, 403, { error: 'Origin not allowed for this chatbot' });
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
    if (!bot) return send(res, 404, { error: 'Chatbot not found' }, cors);
    if (r[2] === 'config' && req.method === 'GET') return send(res, 200, store.publicConfig(bot), cors);
    if (r[2] === 'chat' && req.method === 'POST') return chat(req, res, bot, cors);
    return send(res, 405, { error: 'Method not allowed' }, cors);
  }

  // ---- dashboard API (same-origin; add auth before deploying — see README) ----
  if (p === '/api/status') {
    return send(res, 200, { llm: llmStatus(), publicUrl: PUBLIC_URL, maxPagesLimit: MAX_PAGES_LIMIT, version: '0.1.0', auth: auth.authMode() });
  }

  if (p === '/api/ingest' && req.method === 'POST') {
    const body = await readJson(req);
    const maxPages = Math.min(Math.max(Number(body.maxPages) || 25, 1), MAX_PAGES_LIMIT);
    if (body.sample) return send(res, 202, { jobId: startIngest({ sample: true, maxPages: 30 }).id });
    let target;
    try {
      target = new URL(/^https?:\/\//i.test(body.url || '') ? body.url : `https://${body.url || ''}`);
      if (!target.hostname.includes('.') && target.hostname !== 'localhost') throw new Error();
    } catch { return send(res, 400, { error: 'Please enter a valid website URL, e.g. https://example.com' }); }
    if (/^(localhost|127\.|10\.|192\.168\.|\[?::1)/.test(target.hostname) &&process.env.SITEMATE_ALLOW_PRIVATE_CRAWL !== '1') {
      return send(res, 400, { error: 'Local and private network addresses can’t be crawled. Use “Try the sample site” for an offline demo.' });
    }
    return send(res, 202, { jobId: startIngest({ url: target.toString(), maxPages }).id });
  }

  if ((r = m(/^\/api\/jobs\/([\w-]+)$/))) {
    const job = jobs.get(r[1]);
    if (!job) return send(res, 404, { error: 'Job not found' });
    const since = Number(url.searchParams.get('since') || 0);
    return send(res, 200, { ...job, log: job.log.slice(since), logTotal: job.log.length, elapsedMs: Date.now() - job.startedAt });
  }

  if (p === '/api/bots' && req.method === 'GET') return send(res, 200, store.listBots().map(botSummary));

  if ((r = m(/^\/api\/bots\/([\w-]+)(?:\/(\w+))?$/))) {
    const bot = store.getBot(r[1]);
    if (!bot) return send(res, 404, { error: 'Chatbot not found' });
    const sub = r[2];
    if (!sub && req.method === 'GET') {
      return send(res, 200, {
        ...botSummary(bot),
        pageList: bot.pages.map(({ text, ...pg }) => ({ ...pg, preview: text.slice(0, 280) })),
        crawlLog: bot.crawl.log,
        crawlNotes: bot.crawl.notes || [],
      });
    }
    if (!sub && req.method === 'DELETE') { store.deleteBot(bot.id); return send(res, 200, { ok: true }); }
    if (sub === 'config' && req.method === 'PUT') return send(res, 200, store.updateConfig(bot.id, await readJson(req)));
    if (sub === 'search' && req.method === 'GET') {
      const { results, terms, coverage } = store.getIndex(bot).search(url.searchParams.get('q') || '', { k: 8 });
      return send(res, 200, { terms, coverage, results: results.map(({ chunk, score }) => ({ ...chunk, score })) });
    }
    if (sub === 'chat' && req.method === 'POST') return chat(req, res, bot, {});
  }

  return send(res, 404, { error: 'Not found' });
}

async function chat(req, res, bot, headers) {
  const ip = req.socket.remoteAddress || 'unknown';
  if (rateLimited(`${ip}:${bot.id}`)) return send(res, 429, { error: 'Too many messages — please wait a minute.' }, headers);
  const body = await readJson(req, 60_000);
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!message) return send(res, 400, { error: 'Message is required' }, headers);
  const history = Array.isArray(body.history) ? body.history.slice(-10) : [];
  const result = await answerQuestion(bot, store.getIndex(bot), message, history);
  store.bumpStats(bot.id, { newConversation: !history.length, grounded: result.grounded || result.engine === 'rules' });
  send(res, 200, result, headers);
}

const server = http.createServer((req, res) => {
  handle(req, res).catch((e) => {
    console.error(e);
    if (!res.headersSent) send(res, e.status || 500, { error: e.status ? e.message : 'Internal server error' });
  });
});

server.listen(PORT, HOST, () => {
  const llm = llmStatus();
  console.log(`\n  SiteMate AI running at ${PUBLIC_URL}`);
  console.log(`  Dashboard login: ${{ password: 'password required (ADMIN_PASSWORD)', open: 'none (local dev; set ADMIN_PASSWORD to require one)', locked: 'LOCKED: set ADMIN_PASSWORD to use the dashboard' }[auth.authMode()]}`);
  console.log(`  Answer engine: ${llm.enabled ? `${llm.label} (${llm.model})` : `retrieval-only${llm.sdkError ? ` — ${llm.sdkError}` : ' (set GROQ_API_KEY or ANTHROPIC_API_KEY in .env)'}`}`);
  console.log(`  Storage: ${store.backend() === 'postgres' ? 'Postgres (DATABASE_URL)' : 'JSON file (SITEMATE_DATA_DIR)'}\n`);
});

// Hosts stop the process with SIGTERM on deploys and idle sleeps: save pending changes first.
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.once(sig, async () => {
    server.close();
    try { await store.flush(); } catch (e) { console.error('[sitemate] final save failed:', e.message); }
    process.exit(0);
  });
}
