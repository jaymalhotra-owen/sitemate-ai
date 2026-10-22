// Chatbot store. Bots live in memory; saving goes to one of two backends:
//   - Postgres, when DATABASE_URL is set: one row per bot (JSONB), only changed bots
//     are written. Used on hosts without a persistent disk (e.g. Render free tier).
//   - A JSON file (SITEMATE_DATA_DIR/bots.json) otherwise, for local development.
// A fuller relational schema for scale is sketched in the README.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { chunkText, contactFacts } from './extract.js';
import { SearchIndex } from './search.js';

const DATA_DIR = process.env.SITEMATE_DATA_DIR || path.resolve('data');
const FILE = path.join(DATA_DIR, 'bots.json');

const bots = new Map();
const indexes = new Map();
const dirty = new Set();        // bot ids changed since the last save
const removed = new Set();      // bot ids deleted since the last save
let saveTimer = null;
let saving = Promise.resolve();
let query = null;               // (sql, params) => Promise<{ rows }> when using Postgres

export const backend = () => (query ? 'postgres' : 'file');

/** Connect to Postgres when DATABASE_URL is set (or a query function is injected, for tests). */
async function connect(injected) {
  if (injected) return injected;
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  const { default: pg } = await import('pg');
  const host = new URL(url).hostname;
  // Hosted databases on public hostnames need TLS; private network hosts (no dots) don't.
  const mode = (process.env.DATABASE_SSL || '').toLowerCase();
  const ssl = mode === 'off' || !host.includes('.') || /^(localhost|127\.)/.test(host) ? false
    : mode === 'no-verify' ? { rejectUnauthorized: false } : true;
  const pool = new pg.Pool({ connectionString: url, ssl, max: 4 });
  return (sql, params) => pool.query(sql, params);
}

export async function load({ query: injected } = {}) {
  query = await connect(injected);
  if (query) {
    await query(`CREATE TABLE IF NOT EXISTS sitemate_bots (
      id text PRIMARY KEY,
      data jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    )`);
    const { rows } = await query('SELECT data FROM sitemate_bots');
    for (const { data } of rows) { const b = typeof data === 'string' ? JSON.parse(data) : data; bots.set(b.id, b); }
    return;
  }
  try {
    const arr = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    for (const b of arr) bots.set(b.id, b);
  } catch { /* first run */ }
}

async function save() {
  const ids = [...dirty]; dirty.clear();
  const gone = [...removed]; removed.clear();
  if (!query) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify([...bots.values()]));
    return;
  }
  try {
    for (const id of ids) {
      const bot = bots.get(id);
      if (!bot) continue;
      await query(`INSERT INTO sitemate_bots (id, data, updated_at) VALUES ($1, $2, now())
        ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`, [id, JSON.stringify(bot)]);
    }
    if (gone.length) await query('DELETE FROM sitemate_bots WHERE id = ANY($1)', [gone]);
  } catch (e) {
    console.error('[sitemate] database save failed, will retry:', e.message);
    for (const id of ids) dirty.add(id);
    for (const id of gone) removed.add(id);
    schedule(2000);
  }
}

function schedule(ms = 150) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { saving = saving.then(save, save); }, ms);
}

function persist(id) {
  dirty.add(id);
  schedule();
}

/** Write any pending changes now (used by tests and on shutdown). */
export async function flush() {
  clearTimeout(saveTimer);
  saving = saving.then(save, save);
  await saving;
}

export const newId = (prefix) => `${prefix}_${crypto.randomBytes(6).toString('hex')}`;

export const DEFAULT_COLOR = '#18181b';

function siteNameFrom(pages, origin) {
  const home = pages.find((p) => new URL(p.url).pathname.replace(/\/$/, '') === new URL(origin).pathname.replace(/\/$/, '')) || pages[0];
  // Prefer the name the site declares (og:site_name); page titles often lead with a slogan.
  if (home?.siteName) return home.siteName;
  const parts = (home?.title || '').split(/\s[|\-–—·:]\s/).map((s) => s.trim()).filter(Boolean);
  const t = parts.length > 1 && parts.at(-1).length < parts[0].length ? parts.at(-1) : parts[0];
  return t && t.length < 40 ? t : new URL(origin).hostname.replace(/^www\./, '');
}

export function createBot({ source, startUrl, origin, pages, log, notes = [], discovered, notFetched, siteName, suggested }) {
  const chunks = [];
  for (const p of pages) {
    for (const c of chunkText(p.text)) {
      chunks.push({ id: `c${chunks.length}`, url: p.url, title: p.title, heading: c.heading, text: c.text });
    }
    p.chunks = chunks.filter((c) => c.url === p.url).length;
  }
  const name = siteName || siteNameFrom(pages, startUrl);
  const facts = contactFacts(pages);
  if (facts) {
    facts.url = pages.find((p) => /contact/i.test(new URL(p.url).pathname))?.url || pages[0].url;
    const src = pages.find((p) => p.url === facts.url);
    chunks.push({ id: `c${chunks.length}`, url: facts.url, title: `Contact details | ${name}`, heading: "Contact us: office location, address, phone, email and opening hours", text: facts.text });
    if (src) src.chunks++;
  }
  const bot = {
    id: newId('bot'),
    createdAt: new Date().toISOString(),
    source,                        // 'crawl' | 'sample' — the bundled sample site is still crawled for real
    sample: source === 'sample',   // true = fictional demo content, labelled as such everywhere
    startUrl, origin, siteName: name,
    pages,
    chunks,
    crawl: { log, notes, discovered, notFetched, finishedAt: new Date().toISOString() },
    stats: { conversations: 0, messages: 0, unanswered: 0 },
    config: {
      name: `${name} Assistant`,
      logo: null,
      color: DEFAULT_COLOR,
      welcome: `Hi! 👋 I'm the ${name} assistant. Ask me anything about our website.`,
      position: 'right',
      // Generic questions every site can answer (overview, services, contact details).
      suggested: suggested || ['What do you do?', 'What services do you offer?', 'How can I contact you?'],
      allowedOrigins: [],
    },
  };
  bots.set(bot.id, bot);
  persist(bot.id);
  return bot;
}

export const getBot = (id) => bots.get(id);
export const listBots = () => [...bots.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

export function deleteBot(id) {
  indexes.delete(id);
  const ok = bots.delete(id);
  removed.add(id); dirty.delete(id); schedule();
  return ok;
}

export function updateConfig(id, patch) {
  const bot = bots.get(id);
  if (!bot) return null;
  const c = bot.config;
  if (typeof patch.name === 'string') c.name = patch.name.slice(0, 60) || c.name;
  if (typeof patch.welcome === 'string') c.welcome = patch.welcome.slice(0, 400);
  if (typeof patch.color === 'string' && /^#[0-9a-f]{6}$/i.test(patch.color)) c.color = patch.color;
  if (patch.position === 'left' || patch.position === 'right') c.position = patch.position;
  if (patch.logo === null || (typeof patch.logo === 'string' && /^data:image\/(png|jpeg|webp|gif);base64,/.test(patch.logo) && patch.logo.length < 300_000)) c.logo = patch.logo;
  if (Array.isArray(patch.suggested)) c.suggested = patch.suggested.filter((s) => typeof s === 'string' && s.trim()).map((s) => s.slice(0, 120)).slice(0, 4);
  if (Array.isArray(patch.allowedOrigins)) c.allowedOrigins = patch.allowedOrigins.filter((s) => /^https?:\/\/[^/\s]+$/.test(s)).slice(0, 10);
  persist(id);
  return c;
}

export function bumpStats(id, { newConversation, grounded }) {
  const bot = bots.get(id);
  if (!bot) return;
  if (newConversation) bot.stats.conversations++;
  bot.stats.messages++;
  if (!grounded) bot.stats.unanswered++;
  persist(id);
}

export function getIndex(bot) {
  let idx = indexes.get(bot.id);
  if (!idx) { idx = new SearchIndex(bot.chunks); indexes.set(bot.id, idx); }
  return idx;
}

/** Public, embeddable view of a bot (no page text, no internals). */
export function publicConfig(bot) {
  const { name, logo, color, welcome, position, suggested } = bot.config;
  return { id: bot.id, siteName: bot.siteName, name, logo, color, welcome, position, suggested, sample: bot.sample };
}
