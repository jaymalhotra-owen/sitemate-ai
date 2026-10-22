// Crawler behaviour against small local HTTP servers (no internet needed).
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { crawlSite } from '../lib/crawler.js';

const words = (n) => Array.from({ length: n }, (_, i) => `word${i}`).join(' ');
const page = (title, links = []) => `<!doctype html><html><head><title>${title}</title></head><body><main><h1>${title}</h1><p>${words(60)}</p>${links.map((l) => `<a href="${l}">${l}</a>`).join('')}</main></body></html>`;

function listen(handler) {
  return new Promise((resolve) => {
    const srv = http.createServer(handler).listen(0, '127.0.0.1', () => resolve(srv));
  });
}

test('follows a start-URL redirect to another address and crawls that site', async () => {
  // "Target" site, served as http://localhost:<port>
  const target = await listen((req, res) => {
    if (req.url === '/') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(page('Home', ['/about'])); }
    if (req.url === '/about') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(page('About')); }
    res.writeHead(404); res.end();
  });
  const tPort = target.address().port;
  // "Old" address that 301s everything to the target (like http://site → https://site).
  const old = await listen((req, res) => { res.writeHead(301, { location: `http://localhost:${tPort}${req.url}` }); res.end(); });
  const oPort = old.address().port;

  const notes = [];
  try {
    const result = await crawlSite(`http://127.0.0.1:${oPort}/`, {
      maxPages: 5,
      allowOrigins: [`http://127.0.0.1:${oPort}`, `http://localhost:${tPort}`],
      onEvent: (e) => { if (e.type === 'note') notes.push(e.message); },
    });
    assert.equal(result.origin, `http://localhost:${tPort}`);
    assert.deepEqual(result.pages.map((p) => new URL(p.url).pathname).sort(), ['/', '/about']);
    assert.ok(!result.log.some((l) => /off-site/.test(l.note || '')), JSON.stringify(result.log));
    assert.ok(notes.some((n) => /redirects to/.test(n)), notes.join(' | '));
  } finally {
    target.close(); old.close();
  }
});

test('strips lines repeated across most pages but keeps them on the homepage', async () => {
  const { stripTemplateText } = await import('../lib/crawler.js');
  const footer = 'Call us: 1-800-555-0100\nServices\nAbout us';
  const pages = ['Home intro', 'Pricing details here', 'Shipping details here', 'Returns details here', 'Warranty details here']
    .map((body) => ({ text: `${body}\n${footer}`, words: 0 }));
  const removed = stripTemplateText(pages);
  assert.equal(removed, 3);
  assert.match(pages[0].text, /1-800-555-0100/);
  assert.equal(pages[2].text, 'Shipping details here');
});

test('indexes llms.txt, crawls its links first, and ignores HTML error pages', async () => {
  const site = await listen((req, res) => {
    const html = (body) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end(body); };
    if (req.url === '/') return html(page('Home', ['/blog/a', '/blog/b']));
    if (req.url === '/blog/a' || req.url === '/blog/b') return html(page('Blog post'));
    if (req.url === '/pricing') return html(page('Pricing'));       // only linked from llms.txt
    if (req.url === '/llms.txt') {
      res.writeHead(200, { 'content-type': 'text/plain' });
      return res.end('# Acme\n\n> Acme makes rocket skates for road runners and coyotes alike, shipped worldwide.\n\n## Key pages\n\n- [Pricing](/pricing): plans and prices\n- [Elsewhere](https://other.example/x)\n');
    }
    res.writeHead(404, { 'content-type': 'text/html' }); res.end('<!doctype html><title>Not found</title>');   // llms-full.txt
  });
  const origin = `http://127.0.0.1:${site.address().port}`;
  try {
    const result = await crawlSite(`${origin}/`, { maxPages: 2, concurrency: 1, allowOrigins: [origin] });
    const paths = result.pages.map((p) => new URL(p.url).pathname);
    assert.deepEqual(paths, ['/', '/pricing', '/llms.txt'], JSON.stringify(result.log));
    const llms = result.pages.find((p) => p.llms);
    assert.match(llms.text, /rocket skates/);
    assert.doesNotMatch(llms.text, /\]\(/);
    assert.ok(!paths.includes('/llms-full.txt'));
  } finally {
    site.close();
  }
});

test('detects link-list pages (HTML sitemaps) but not short-line content pages', async () => {
  const { isLinkListPage } = await import('../lib/crawler.js');
  const titles = Array.from({ length: 40 }, (_, i) => `Product category ${i}`);
  const sitemap = titles.map((t) => `• ${t}`).join('\n');
  const equipment = Array.from({ length: 40 }, (_, i) => `• Pick-and-place machine model ${i}`).join('\n');
  const article = Array.from({ length: 30 }, (_, i) => `Paragraph ${i} explains how our assembly process keeps quality high for every customer order.`).join('\n');
  assert.equal(isLinkListPage(sitemap, titles.map((t) => t.toLowerCase())), true);
  assert.equal(isLinkListPage(equipment, ['contact us', 'home']), false);   // short lines, but not links
  assert.equal(isLinkListPage(article, []), false);
  assert.equal(isLinkListPage('Short page\nwith a few lines', []), false);
});

test('retries throttled pages once, slowly, instead of failing them', async () => {
  let hits = 0;
  const site = await listen((req, res) => {
    const html = (body) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end(body); };
    if (req.url === '/') return html(page('Home', ['/flaky', '/gone']));
    if (req.url === '/flaky') {
      if (++hits === 1) { res.writeHead(503); return res.end(); }      // throttled the first time
      return html(page('Flaky but fine'));
    }
    res.writeHead(404); res.end();
  });
  const origin = `http://127.0.0.1:${site.address().port}`;
  try {
    const result = await crawlSite(`${origin}/`, { maxPages: 5, allowOrigins: [origin] });
    const byPath = Object.fromEntries(result.log.map((l) => [new URL(l.url).pathname, l]));
    assert.equal(byPath['/flaky'].status, 'indexed', JSON.stringify(result.log));
    assert.equal(hits, 2);
    assert.equal(byPath['/gone'].status, 'failed');                       // a real 404 is not retried
  } finally {
    site.close();
  }
});
