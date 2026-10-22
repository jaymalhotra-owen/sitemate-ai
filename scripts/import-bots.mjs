// Copy chatbots from the local JSON file into a Postgres database (e.g. your Render DB).
//   DATABASE_URL="postgres://…external URL…" node scripts/import-bots.mjs [path/to/bots.json]
// Existing rows with the same id are overwritten; other rows are left alone.
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const url = process.env.DATABASE_URL;
if (!url) { console.error('Set DATABASE_URL (use the database\'s *external* connection string).'); process.exit(1); }
const file = process.argv[2] || path.resolve(process.env.SITEMATE_DATA_DIR || 'data', 'bots.json');
const bots = JSON.parse(fs.readFileSync(file, 'utf8'));

const host = new URL(url).hostname;
const client = new pg.Client({ connectionString: url, ssl: host.includes('.') && !/^(localhost|127\.)/.test(host) ? { rejectUnauthorized: false } : false });
await client.connect();
await client.query(`CREATE TABLE IF NOT EXISTS sitemate_bots (id text PRIMARY KEY, data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`);
for (const b of bots) {
  await client.query(`INSERT INTO sitemate_bots (id, data, updated_at) VALUES ($1, $2, now())
    ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`, [b.id, JSON.stringify(b)]);
  console.log(`imported ${b.id}  ${b.siteName}  (${b.pages.length} pages)`);
}
await client.end();
console.log(`\nDone: ${bots.length} chatbot(s). Restart the web service so it loads them.`);
