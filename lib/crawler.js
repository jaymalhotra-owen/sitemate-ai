// Real, polite, same-origin website crawler.
// - honours robots.txt (User-agent: * and SiteMateBot groups)
// - seeds from sitemap.xml (+ sitemap index, + robots "Sitemap:" lines)
// - BFS over same-origin links, HTML only, bounded pages / bytes / time
// - SSRF guard: refuses private, loopback and link-local addresses
// Every page outcome is recorded so the UI never claims more than happened.

import dns from 'node:dns/promises';
import net from 'node:net';
import { createHash } from 'node:crypto';
import { extractPage } from './extract.js';

export const USER_AGENT = 'SiteMateBot/0.1 (+https://github.com/your-org/sitemate-ai; prototype crawler)';
const FETCH_TIMEOUT_MS = 12000;
const MAX_BYTES = 2_000_000;
const SKIP_EXT = /\.(png|jpe?g|gif|webp|svg|ico|pdf|zip|gz|mp4|mp3|wav|mov|avi|css|js|json|xml|txt|woff2?|ttf|eot|exe|dmg|docx?|xlsx?|pptx?)$/i;

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v = ip.toLowerCase();
  if (v.startsWith('::ffff:')) return isPrivateIp(v.slice(7));
  return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80');
}

/**
 * @param {URL} url
 * @param {{allowOrigins?: string[]}} opts allowOrigins: origins exempt from the SSRF guard
 *        (used so the bundled sample site on this server can be crawled for real).
 */
async function assertPublic(url, { allowOrigins = [] } = {}) {
  if (!/^https?:$/.test(url.protocol)) throw new Error('Only http(s) URLs are supported');
  if (allowOrigins.includes(url.origin)) return;
  if (process.env.SITEMATE_ALLOW_PRIVATE_CRAWL === '1') return;
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal')) {
    throw new Error('Refusing to crawl local/internal hosts');
  }
  const addrs = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true });
  if (!addrs.length) throw new Error('Host did not resolve');
  if (addrs.some((a) => isPrivateIp(a.address))) throw new Error('Refusing to crawl private network address');
}

async function fetchText(url, opts, accept = 'text/html,application/xhtml+xml') {
  await assertPublic(new URL(url), opts);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    let current = url;
    // Manual redirects so every hop goes through the SSRF guard.
    for (let hop = 0; hop < 5; hop++) {
      const res = await fetch(current, {
        redirect: 'manual',
        signal: ctrl.signal,
        headers: { 'user-agent': USER_AGENT, accept },
      });
      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
        current = new URL(res.headers.get('location'), current).toString();
        await assertPublic(new URL(current), opts);
        continue;
      }
      const type = res.headers.get('content-type') || '';
      if (!res.ok) return { status: res.status, finalUrl: current, type, body: '' };
      const reader = res.body?.getReader();
      let size = 0; const parts = [];
      if (reader) {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.length;
          if (size > MAX_BYTES) { ctrl.abort(); break; }
          parts.push(value);
        }
      }
      const body = Buffer.concat(parts).toString('utf8');
      return { status: res.status, finalUrl: current, type, body, truncated: size > MAX_BYTES };
    }
    throw new Error('Too many redirects');
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('Timed out');
    throw e;
  } finally {
    clearTimeout(t);
  }
}

const RETRY_STATUS = new Set([429, 502, 503, 504]);
// Two parallel requests with a short pause each: gentle enough for most firewalls.
const CRAWL_CONCURRENCY = Number(process.env.SITEMATE_CRAWL_CONCURRENCY || 2);
const CRAWL_DELAY_MS = Number(process.env.SITEMATE_CRAWL_DELAY_MS ?? 300);
const RETRY_PAUSE_MS = Number(process.env.SITEMATE_RETRY_PAUSE_MS ?? 1500);

/** Timeouts and dropped connections are worth one slow retry; DNS/TLS/SSRF errors are not. */
function isTransient(e) {
  const code = e.cause?.code || e.code || '';
  return /timed out/i.test(e.message) || ['ECONNRESET', 'ECONNREFUSED', 'UND_ERR_SOCKET', 'UND_ERR_CONNECT_TIMEOUT', 'EPIPE', 'ETIMEDOUT'].includes(code)
    || (e.message === 'fetch failed' && !['ENOTFOUND', 'EAI_AGAIN'].includes(code) && !/CERT|TLS|SSL/.test(code));
}

function friendlyError(e) {
  const code = e.cause?.code || e.code || '';
  const map = {
    ENOTFOUND: 'Domain not found (DNS lookup failed)', EAI_AGAIN: 'DNS lookup failed — check your connection',
    ECONNREFUSED: 'Connection refused by the server', ECONNRESET: 'Connection reset by the server',
    CERT_HAS_EXPIRED: 'SSL certificate has expired', UNABLE_TO_VERIFY_LEAF_SIGNATURE: 'SSL certificate could not be verified',
    ERR_TLS_CERT_ALTNAME_INVALID: 'SSL certificate does not match the domain', UND_ERR_CONNECT_TIMEOUT: 'Timed out connecting',
  };
  return map[code] || e.message || String(e);
}

function parseRobots(txt) {
  const groups = []; let cur = null; const sitemaps = [];
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const m = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
    if (!m) continue;
    const [, k, v] = m; const key = k.toLowerCase();
    if (key === 'sitemap') { sitemaps.push(v); continue; }
    if (key === 'user-agent') {
      if (!cur || cur.rules.length) { cur = { agents: [], rules: [] }; groups.push(cur); }
      cur.agents.push(v.toLowerCase());
    } else if (cur && (key === 'allow' || key === 'disallow')) {
      cur.rules.push({ allow: key === 'allow', path: v });
    }
  }
  const mine = groups.filter((g) => g.agents.some((a) => a.includes('sitematebot')));
  const rules = (mine.length ? mine : groups.filter((g) => g.agents.includes('*'))).flatMap((g) => g.rules);
  return {
    sitemaps,
    allowed(pathname) {
      let best = null;
      for (const r of rules) {
        if (!r.path) continue;
        const re = new RegExp('^' + r.path.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$'));
        if (re.test(pathname) && (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow))) best = r;
      }
      return !best || best.allow;
    },
  };
}

async function readSitemaps(urls, sameSite, opts, out, depth = 0) {
  for (const sm of urls.slice(0, 5)) {
    try {
      const r = await fetchText(sm, opts, 'application/xml,text/xml');
      if (!r.body) continue;
      const locs = [...r.body.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1].replace(/&amp;/g, '&'));
      if (/<sitemapindex/i.test(r.body) && depth < 1) {
        await readSitemaps(locs, sameSite, opts, out, depth + 1);
      } else {
        for (const l of locs) { try { if (sameSite(l)) out.add(l); } catch {} }
      }
    } catch { /* sitemap optional */ }
  }
}

/**
 * HTML sitemaps, tag and archive pages are long lists of short link titles with almost
 * no sentences. They match many queries by keyword but answer none, so skip them.
 */
export function isLinkListPage(text, linkTexts = []) {
  const lines = text.split('\n').map((l) => l.replace(/^[•#\s]+/, '').trim()).filter(Boolean);
  if (lines.length < 25) return false;
  // Short lines alone aren't enough: contact pages, spec sheets and equipment lists look
  // like that too. Require that most of the remaining lines are link texts. Run this
  // after template removal so the site's menus don't count.
  const links = new Set(linkTexts);
  const total = lines.reduce((n, l) => n + l.length, 0);
  const linked = lines.filter((l) => links.has(l.toLowerCase())).reduce((n, l) => n + l.length, 0);
  if (linked / total <= 0.6) return false;
  const prose = lines.filter((l) => l.split(/\s+/).length >= 9 && /[.!?:]$|[.!?]\s/.test(l)).reduce((n, l) => n + l.length, 0);
  return prose / total < 0.15;
}

const hostKey = (u) => new URL(u).hostname.toLowerCase().replace(/^www./, '');

function normalize(u) {
  const url = new URL(u);
  url.hash = '';
  for (const p of [...url.searchParams.keys()]) if (/^(utm_|fbclid|gclid|ref$)/i.test(p)) url.searchParams.delete(p);
  if (url.pathname !== '/' && url.pathname.endsWith('/')) url.pathname = url.pathname.slice(0, -1);
  return url.toString();
}

/**
 * Many themes build menus, contact blocks and footers from plain <div>s, so the same
 * lines appear on every page and drown out the real content in search. Drop lines that
 * occur on most crawled pages, keeping them on the first page (the homepage) so details
 * like the address and phone number stay searchable. Returns the number of lines removed.
 */
export function stripTemplateText(pages) {
  if (pages.length < 4) return 0;
  const key = (l) => l.trim().toLowerCase();
  const df = new Map();
  for (const p of pages) for (const k of new Set(p.text.split('\n').map(key).filter(Boolean))) df.set(k, (df.get(k) || 0) + 1);
  const threshold = Math.max(3, Math.ceil(pages.length * 0.5));
  const boiler = new Set([...df].filter(([, n]) => n >= threshold).map(([k]) => k));
  if (!boiler.size) return 0;
  pages.forEach((p, i) => {
    if (i === 0) return;
    p.text = p.text.split('\n').filter((l) => !boiler.has(key(l))).join('\n').replace(/\n{3,}/g, '\n\n').trim();
    p.words = p.text.split(/\s+/).filter(Boolean).length;
  });
  return boiler.size;
}

/**
 * Crawl a site. `onEvent` receives progress events for the live UI.
 * Resolves with { pages: [{url,title,description,text,...}], log: [...] }.
 */
export async function crawlSite(startUrl, { maxPages = 25, concurrency = CRAWL_CONCURRENCY, scope, allowOrigins = [], onEvent = () => {} } = {}) {
  const opts = { allowOrigins };
  let start = new URL(startUrl);

  // Follow the start URL's redirects first (http → https, example.com → www.example.com)
  // and crawl the address the site actually serves from.
  onEvent({ type: 'phase', phase: 'robots', message: 'Resolving website address' });
  try {
    const r = await fetchText(start.toString(), opts);
    const final = new URL(r.finalUrl);
    if (final.origin !== start.origin) {
      const sameHost = hostKey(final) === hostKey(start);
      onEvent({ type: 'note', message: sameHost
        ? `${start.origin} redirects to ${final.origin} — crawling that address`
        : `${start.origin} redirects to a different domain (${final.host}) — crawling that site instead` });
      start = final;
    }
  } catch { /* the real fetch below records the error for this URL */ }
  const origin = start.origin;
  const key = hostKey(start);
  // http/https and www./bare variants of the site's host count as the same site.
  const sameSite = (u) => { const x = new URL(u); return /^https?:$/.test(x.protocol) && hostKey(x) === key && (x.port || '') === (start.port || ''); };
  const canon = (u) => { const x = new URL(u); if (sameSite(x)) { x.protocol = start.protocol; x.host = start.host; } return normalize(x.toString()); };
  const scopePath = scope ?? '/';
  const log = [];
  const record = (entry) => { log.push(entry); onEvent({ type: 'page', entry }); };

  onEvent({ type: 'phase', phase: 'robots', message: 'Reading robots.txt' });
  let robots = parseRobots('');
  try {
    const r = await fetchText(`${origin}/robots.txt`, opts, 'text/plain');
    if (r.status === 200 && r.body) robots = parseRobots(r.body);
    onEvent({ type: 'note', message: r.status === 200 ? 'robots.txt found and applied' : `No robots.txt (HTTP ${r.status})` });
  } catch (e) {
    onEvent({ type: 'note', message: `robots.txt unavailable (${friendlyError(e)})` });
  }

  onEvent({ type: 'phase', phase: 'sitemap', message: 'Looking for sitemap.xml' });
  const fromSitemap = new Set();
  await readSitemaps(robots.sitemaps.length ? robots.sitemaps : [`${origin}/sitemap.xml`], sameSite, opts, fromSitemap);
  onEvent({ type: 'note', message: fromSitemap.size ? `Sitemap listed ${fromSitemap.size} URL(s)` : 'No sitemap found — discovering pages via links' });

  const inScope = (u) => {
    try {
      const url = new URL(u);
      return sameSite(url) && url.pathname.startsWith(scopePath) && !SKIP_EXT.test(url.pathname);
    } catch { return false; }
  };

  // llms.txt (https://llmstxt.org): a Markdown summary the site publishes for AI tools,
  // with links to its most important pages. Indexed as a source, and its links are
  // crawled first. Only the site root is checked (scope-limited crawls skip it).
  const llmsDocs = [];
  const llmsLinks = [];
  if (scopePath === '/') {
    onEvent({ type: 'phase', phase: 'sitemap', message: 'Looking for llms.txt' });
    for (const name of ['llms.txt', 'llms-full.txt']) {
      if (!robots.allowed(`/${name}`)) { onEvent({ type: 'note', message: `${name} is disallowed by robots.txt — skipped` }); continue; }
      try {
        const r = await fetchText(`${origin}/${name}`, opts, 'text/markdown,text/plain');
        // Many sites answer unknown paths with an HTML page (sometimes even with 200).
        if (r.status !== 200 || /html/i.test(r.type) || /^\s*</.test(r.body) || !r.body.trim()) continue;
        const links = [...r.body.matchAll(/\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)]
          .map((m) => { try { return new URL(m[1], `${origin}/`).toString(); } catch { return null; } })
          .filter((u) => u && inScope(u));
        llmsLinks.push(...links.map(canon));
        llmsDocs.push({ name, url: `${origin}/${name}`, body: r.body, truncated: r.truncated, links: links.length });
        onEvent({ type: 'note', message: `${name} found (${Math.round(r.body.length / 1024)} KB, ${links.length} site link(s)) — indexed, and its pages are crawled first` });
      } catch { /* optional file */ }
    }
    if (!llmsDocs.length) onEvent({ type: 'note', message: 'No llms.txt found' });
  }

  // Two queues: pages linked from llms.txt and from crawled pages (starting with the
  // homepage's navigation) come first; remaining sitemap URLs, shortest paths first,
  // fill any leftover budget. This favours key pages over the long tail of blog posts.
  const startUrlC = canon(start.toString());
  const seen = new Set([startUrlC, ...llmsLinks]);
  const linked = [...seen];
  const fromMap = [...fromSitemap].filter(inScope).map(canon).filter((u) => !seen.has(u))
    .sort((x, y) => x.split('/').length - y.split('/').length || x.length - y.length);
  for (const u of fromMap) seen.add(u);
  const next = () => {
    if (linked.length) return linked.shift();
    while (fromMap.length) { const u = fromMap.shift(); if (!done.has(u)) return u; }
    return null;
  };
  const pending = () => linked.length + fromMap.filter((u) => !done.has(u)).length;
  const done = new Set();
  const pages = [];
  const contentHashes = new Set();
  let attempted = 0;

  onEvent({ type: 'phase', phase: 'fetch', message: 'Fetching pages' });

  const retryLater = [];
  const retrying = new Set();

  async function worker(limit = Infinity) {
    let n = 0;
    for (let url = next(); url && attempted < maxPages && n < limit; url = n < limit ? next() : null) {
      if (done.has(url)) continue;
      done.add(url); attempted++; n++;
      const path = new URL(url).pathname;
      if (!robots.allowed(path)) { record({ url, status: 'skipped', note: 'Disallowed by robots.txt' }); continue; }
      try {
        if (attempted > 1) await new Promise((res) => setTimeout(res, CRAWL_DELAY_MS));   // be polite between requests
        const r = await fetchText(url, opts);
        // 403 after other pages loaded fine is usually a firewall reacting to request rate.
        const throttled = RETRY_STATUS.has(r.status) || (r.status === 403 && pages.length > 0);
        if (throttled && !retrying.has(url)) { retryLater.push(url); continue; }
        if (r.status !== 200) { record({ url, status: 'failed', code: r.status, note: `HTTP ${r.status}` }); continue; }
        if (!/html/i.test(r.type)) { record({ url, status: 'skipped', note: `Not HTML (${r.type.split(';')[0] || 'unknown'})` }); continue; }
        if (!sameSite(r.finalUrl)) { record({ url, status: 'skipped', note: `Redirected off-site (${new URL(r.finalUrl).host})` }); continue; }
        const finalUrl = canon(r.finalUrl);
        done.add(finalUrl);
        const page = extractPage(r.body, finalUrl);
        for (const l of page.links) {
          if (!inScope(l)) continue;
          const c = canon(l);
          if (done.has(c)) continue;
          if (!seen.has(c)) { seen.add(c); linked.push(c); }
          else if (fromMap.includes(c) && !linked.includes(c)) linked.push(c);   // linked from a page: promote
        }
        if (page.noindex) { record({ url, status: 'skipped', note: 'Page marked noindex' }); continue; }
        const words = page.text.split(/\s+/).filter(Boolean).length;
        if (words < 25) {
          const hint = /id=["'](root|app|__next)["']/i.test(r.body) ? ' — likely rendered by JavaScript (not supported yet)' : '';
          record({ url, status: 'skipped', note: `Too little readable text (${words} words)${hint}` });
          continue;
        }
        const hash = createHash('sha1').update(page.text).digest('hex');
        if (contentHashes.has(hash)) { record({ url, status: 'skipped', note: 'Duplicate content' }); continue; }
        contentHashes.add(hash);
        const entry = { url: finalUrl, status: 'indexed', title: page.title, words, note: r.truncated ? 'Truncated at 2 MB' : undefined };
        pages.push({ url: finalUrl, title: page.title || path, siteName: page.siteName || undefined, description: page.description, text: page.text, words, fetchedAt: new Date().toISOString(), logEntry: entry, linkTexts: page.linkTexts });
        record(entry);
      } catch (e) {
        if (isTransient(e) && !retrying.has(url)) { retryLater.push(url); continue; }
        record({ url, status: 'failed', note: friendlyError(e) });
      }
    }
  }

  await worker(1);                                                   // homepage first: its links set the priority
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  while (pending() && attempted < maxPages) await worker();           // workers may idle while others discover links

  // Pages that timed out or got 429/5xx usually mean the site throttled parallel requests.
  // Retry each once, one at a time with a pause; they don't count twice against the budget.
  if (retryLater.length) {
    onEvent({ type: 'note', message: `${retryLater.length} page(s) timed out or were throttled — retrying them slowly, one at a time` });
    for (const url of retryLater.splice(0)) {
      await new Promise((r) => setTimeout(r, RETRY_PAUSE_MS));
      retrying.add(url); done.delete(url); attempted--; linked.unshift(url);
      await worker(1);
    }
  }

  const removed = stripTemplateText(pages);
  if (removed) onEvent({ type: 'note', message: `Removed ${removed} line(s) of repeated menu/footer text (kept once on the homepage)` });
  const kept = [];
  for (const [i, pg] of pages.entries()) {
    const entry = pg.logEntry; delete pg.logEntry;
    const linkTexts = pg.linkTexts; delete pg.linkTexts;
    if (pg.words < 25) { Object.assign(entry, { status: 'skipped', words: pg.words, note: 'Only repeated template text' }); continue; }
    if (i > 0 && isLinkListPage(pg.text, linkTexts)) {
      Object.assign(entry, { status: 'skipped', note: 'Mostly a list of links (e.g. an HTML sitemap or tag page)' });
      continue;
    }
    entry.words = pg.words;
    kept.push(pg);
  }

  // llms.txt files are Markdown already: keep headings for chunking, turn [text](url) into text.
  for (const d of llmsDocs) {
    const text = d.body.replace(/\r\n?/g, '\n')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/^>\s?/gm, '')
      .replace(/^\s*[-*]\s+/gm, '• ')
      .replace(/\n(#{1,6} )/g, '\n\n$1').replace(/(^#{1,6} .+)\n(?!\n)/gm, '$1\n\n')
      .trim();
    const words = text.split(/\s+/).filter(Boolean).length;
    if (words < 10) continue;
    kept.push({ url: d.url, title: `${d.name} — site summary for AI`, description: `Published by the site at /${d.name}`, text, words, fetchedAt: new Date().toISOString(), llms: true });
    record({ url: d.url, status: 'indexed', title: d.name, words, note: `${d.name}${d.truncated ? ' · truncated at 2 MB' : ''}` });
  }

  const leftover = pending();
  if (leftover) onEvent({ type: 'note', message: `Page limit reached — ${leftover} more URL(s) discovered but not fetched` });
  return { origin, startUrl: start.toString(), pages: kept, log, discovered: seen.size, notFetched: leftover };
}
