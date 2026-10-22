// Postgres storage backend, exercised against PGlite (real Postgres compiled to WASM).
import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import * as store from '../lib/store.js';

const db = new PGlite();
const query = (sql, params) => db.query(sql, params);
const page = (url, title) => ({ url, title, text: `${title}\n\nWe build custom cable assemblies and printed circuit boards for industrial customers across North America. Call 508-316-1492.`, words: 20 });

test('saves bots to Postgres, updates them, and deletes them', async () => {
  await store.load({ query });
  assert.equal(store.backend(), 'postgres');

  const bot = store.createBot({
    source: 'crawl', startUrl: 'https://example.test/', origin: 'https://example.test',
    pages: [page('https://example.test/', 'Example Co'), page('https://example.test/about', 'About')],
    log: [], discovered: 2, notFetched: 0,
  });
  await store.flush();
  let { rows } = await db.query('SELECT id, data FROM sitemate_bots');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, bot.id);
  assert.equal(rows[0].data.siteName, 'Example Co');
  assert.ok(rows[0].data.chunks.some((c) => c.title.startsWith('Contact details')));

  store.updateConfig(bot.id, { name: 'Example Helper', color: '#0d9488' });
  store.bumpStats(bot.id, { newConversation: true, grounded: true });
  await store.flush();
  ({ rows } = await db.query('SELECT data FROM sitemate_bots WHERE id = $1', [bot.id]));
  assert.equal(rows[0].data.config.name, 'Example Helper');
  assert.equal(rows[0].data.config.color, '#0d9488');
  assert.equal(rows[0].data.stats.conversations, 1);

  store.deleteBot(bot.id);
  await store.flush();
  ({ rows } = await db.query('SELECT count(*)::int AS n FROM sitemate_bots'));
  assert.equal(rows[0].n, 0);
});

test('a fresh load reads bots back from the table', async () => {
  await db.query(`INSERT INTO sitemate_bots (id, data) VALUES ($1, $2)`,
    ['bot_saved', JSON.stringify({ id: 'bot_saved', createdAt: new Date().toISOString(), siteName: 'Saved Co', chunks: [], pages: [], config: {}, stats: {} })]);
  await store.load({ query });
  assert.equal(store.getBot('bot_saved')?.siteName, 'Saved Co');
});
