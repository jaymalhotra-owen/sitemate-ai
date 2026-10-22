// HTML → clean text extraction. Dependency-free on purpose so the prototype
// runs anywhere; swap for a DOM parser (e.g. linkedom / cheerio + Readability)
// in production — see README "Production crawling".

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—',
  hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', copy: '©', reg: '®',
  trade: '™', middot: '·', bull: '•', deg: '°', times: '×', euro: '€', pound: '£',
};

export function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

function attr(tag, name) {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return m ? decodeEntities(m[2] ?? m[3] ?? m[4] ?? '') : null;
}

function metaContent(html, key) {
  const re = /<meta\b[^>]*>/gi;
  let m;
  while ((m = re.exec(html))) {
    const n = (attr(m[0], 'name') || attr(m[0], 'property') || '').toLowerCase();
    if (n === key) return attr(m[0], 'content');
  }
  return null;
}

const stripTags = (s) => decodeEntities(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

/** Extract links, title, description and readable text from an HTML document. */
export function extractPage(html, pageUrl) {
  const title = stripTags(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '')
    || metaContent(html, 'og:title') || '';
  const description = metaContent(html, 'description') || metaContent(html, 'og:description') || '';
  const siteName = metaContent(html, 'og:site_name') || metaContent(html, 'application-name') || '';
  const robots = (metaContent(html, 'robots') || '').toLowerCase();
  const lang = attr(html.match(/<html\b[^>]*>/i)?.[0] || '', 'lang') || '';

  let canonical = null;
  const linkTags = html.match(/<link\b[^>]*>/gi) || [];
  for (const t of linkTags) {
    if ((attr(t, 'rel') || '').toLowerCase() === 'canonical') canonical = attr(t, 'href');
  }

  // Links (collected from the full document, including nav/footer).
  const links = new Set();
  const aRe = /<a\b[^>]*>/gi;
  let a;
  while ((a = aRe.exec(html))) {
    const href = attr(a[0], 'href');
    if (!href || /^(mailto:|tel:|javascript:|#)/i.test(href)) continue;
    try {
      const u = new URL(href, pageUrl);
      u.hash = '';
      links.add(u.toString());
    } catch { /* ignore malformed */ }
  }

  // Readable content: drop boilerplate, prefer <main>/<article>.
  let body = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|template|iframe|canvas|form|select)\b[\s\S]*?<\/\1>/gi, ' ');
  const main = body.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1]
    || body.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1];
  body = main || body.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] || body;
  body = body.replace(/<(nav|header|footer|aside)\b[\s\S]*?<\/\1>/gi, ' ');
  // Visible link texts in the content area (used to spot sitemap/tag pages).
  const linkTexts = [...new Set((body.match(/<a\b[^>]*>[\s\S]*?<\/a>/gi) || []).map((a) => stripTags(a).toLowerCase()).filter(Boolean))];

  const text = body
    .replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi, (_, lvl, inner) => `\n\n${'#'.repeat(+lvl)} ${stripTags(inner)}\n\n`)
    .replace(/<li\b[^>]*>/gi, '\n• ')
    .replace(/<(br)\b[^>]*>/gi, '\n')
    .replace(/<\/?(p|div|section|ul|ol|table|tr|blockquote|dl|dt|dd|figure|figcaption|pre)\b[^>]*>/gi, '\n\n')
    .replace(/<\/t[dh]>/gi, ' | ')
    .replace(/<[^>]+>/g, ' ');

  const clean = decodeEntities(text)
    .split('\n')
    .map((l) => l.replace(/[ \t ]+/g, ' ').trim())
    .join('\n')
    .replace(/ +([.,;:!?])/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return {
    title: title.slice(0, 200),
    siteName: siteName.slice(0, 60),
    description: description.slice(0, 400),
    canonical,
    lang,
    noindex: robots.includes('noindex'),
    linkTexts,
    links: [...links],
    text: clean,
  };
}

/** Split extracted text into retrieval chunks that keep their section heading. */
export function chunkText(text, { maxChars = 900 } = {}) {
  const chunks = [];
  let heading = '';
  let buf = [];
  let len = 0;
  const flush = () => {
    const body = buf.join('\n\n').trim();
    if (body.length > 40) chunks.push({ heading, text: body });
    buf = []; len = 0;
  };
  for (const block of text.split(/\n\n+/)) {
    const h = block.match(/^#{1,6} (.+)$/);
    if (h) { flush(); heading = h[1].trim(); continue; }
    if (len + block.length > maxChars && len > 0) flush();
    // Hard-split very long paragraphs at sentence boundaries.
    if (block.length > maxChars) {
      let rest = block;
      while (rest.length > maxChars) {
        let cut = rest.lastIndexOf('. ', maxChars);
        if (cut < maxChars * 0.5) cut = maxChars;
        buf.push(rest.slice(0, cut + 1)); flush();
        rest = rest.slice(cut + 1).trim();
      }
      if (rest) { buf.push(rest); len += rest.length; }
      continue;
    }
    buf.push(block); len += block.length;
  }
  flush();
  return chunks;
}

// ---------- contact facts ----------
// Contact details usually live in headers/footers under labels like "Location:" or
// "Working Time" that keyword search can't connect to "where is your office?". Collect
// them into one well-labelled passage so those common questions retrieve reliably.
const FACT_PATTERNS = [
  /(?:\+?1[\s.-]?)?\(?\b\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b|\+\d{1,3}[\s.-]\d[\d\s.-]{6,}\d/, // phone (not dates)
  /[\w.+-]+@[\w-]+\.[\w.-]+/,                                                     // email
  /\b(\d{1,5}|One|Two|Three)\s+(?:[A-Z0-9][\w.'’-]*\s+){1,4}(St|Street|Rd|Road|Ave|Avenue|Blvd|Boulevard|Dr|Drive|Lane|Ln|Way|Hwy|Highway|Pkwy|Parkway|Place|Pl|Court|Ct|Square|Sq)\b\.?|\bSuite\s+\d+/, // street
  /\b[A-Z]\d[A-Z]\s?\d[A-Z]\d\b|\b[A-Z]{2}\s\d{5}(-\d{4})?\b/,                     // CA / US postal code
  /\b(mon|tues?|wed(nes)?|thu(rs)?|fri|sat(ur)?|sun)(day)?s?\b.*(\d|closed|open)/i,  // opening hours
  /\b\d{1,2}(:\d{2})?\s?(am|pm|a\.m\.|p\.m\.)|\b\d{1,2}:\d{2}\s?(to|-|–)\s?\d{1,2}:\d{2}/i,
];

export function contactFacts(pages) {
  const lines = [];
  const seen = new Set();
  let url = null;
  for (const p of pages) {
    const ls = p.text.split('\n').map((l) => l.replace(/^[•#\s]+/, '').trim()).filter(Boolean);
    ls.forEach((l, i) => {
      if (l.length > 160 || !FACT_PATTERNS.some((re) => re.test(l))) return;
      const label = i > 0 && /:\s*$/.test(ls[i - 1]) && ls[i - 1].length < 40 ? `${ls[i - 1]} ` : '';
      const line = `${label}${l}`;
      const key = line.toLowerCase().replace(/\s+/g, ' ');
      if (seen.has(key)) return;
      seen.add(key); lines.push(line);
      url ??= p.url;
    });
    if (lines.length >= 25) break;
  }
  return lines.length ? { url, text: lines.slice(0, 25).join('\n') } : null;
}
