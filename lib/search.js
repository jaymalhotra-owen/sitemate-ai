// Lexical retrieval (BM25) over website chunks. Runs fully offline.
// Production upgrade path: hybrid search — BM25 + vector embeddings in
// Postgres/pgvector, Turbopuffer, etc. (see README "Retrieval").

const STOP = new Set(`a an and are as at be by can could do does for from had has have how i if in into is it its
me my of on or our please so tell than that the their them then there these they this to up us was we were what
when where which who why will with would you your about any some get got just know want need am im ive yours also
been being did does doing done hi hello hey thanks thank ok okay yes no not dont
mainly mostly primarily usually typically generally normally really actually exactly currently`.split(/\s+/));

const SYNONYMS = {
  refund: ['return'], return: ['refund'], ship: ['deliver', 'shipping'], deliver: ['ship', 'shipping'],
  shipping: ['delivery', 'ship'], delivery: ['shipping'], cost: ['price', 'fee'], price: ['cost'],
  fee: ['cost', 'price'], hour: ['open', 'time'], open: ['hour'], office: ['location', 'address'], address: ['location'], location: ['store', 'address'], store: ['location'],
  fix: ['repair'], repair: ['fix'], broken: ['repair', 'warranty'], guarantee: ['warranty'],
  warranty: ['guarantee'], phone: ['call', 'contact'], email: ['contact'], contact: ['email', 'phone'],
  exchange: ['return'], international: ['country', 'worldwide'], job: ['career'], career: ['job'], wore: ['used', 'worn'], worn: ['used'], wear: ['used'], used: ['worn'],
  locat: ['location', 'address', 'office'], industry: ['market', 'sector'], market: ['industry', 'sector'], sector: ['industry', 'market'],
  supplier: ['vendor'], vendor: ['supplier'], customer: ['client'], client: ['customer'],
};

// Generic intent words: used for ranking, but not required to be "covered" by the
// retrieved text (so "return policy" can match a Returns page that never says "policy").
export const SOFT = new Set(['policy', 'policie', 'sell', 'buy', 'offer', 'have', 'info', 'information', 'detail',
  'option', 'much', 'many', 'long', 'work', 'like', 'way', 'best', 'good', 'use', 'make', 'find', 'help',
  'question', 'available', 'thing', 'take', 'serve', 'supply', 'work', 'come', 'go', 'need', 'more', 'else', 'other', 'cost', 'company', 'business', 'website', 'site', 'brand', 'shop', 'kind', 'type', 'tell', 'explain', 'describe', 'give', 'look', 'show']);

export const shortTitle = (t) => (t || '').split(/\s[|–—-]\s/)[0].trim() || t;

export function stem(w) {
  if (w.length > 5 && w.endsWith('ies')) return w.slice(0, -3) + 'y';
  if (w.length > 5 && w.endsWith('ing')) return w.slice(0, -3);
  if (w.length > 4 && w.endsWith('ed')) return w.slice(0, -2);
  if (w.length > 4 && w.endsWith('es') && !w.endsWith('ses')) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}

export function tokenize(text) {
  return (text.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').match(/[a-z0-9]+/g) || [])
    .filter((w) => !STOP.has(w) && w.length > 1)
    .map(stem);
}

export class SearchIndex {
  constructor(chunks) {
    this.chunks = chunks;
    this.docs = chunks.map((c) => {
      // Title + heading are repeated so they carry extra weight.
      const toks = tokenize(`${c.title} ${c.title} ${c.heading || ''} ${c.heading || ''} ${c.text}`);
      const tf = new Map();
      for (const t of toks) tf.set(t, (tf.get(t) || 0) + 1);
      return { tf, len: toks.length };
    });
    this.N = this.docs.length;
    this.avgdl = this.docs.reduce((s, d) => s + d.len, 0) / (this.N || 1);
    this.df = new Map();
    for (const d of this.docs) for (const t of d.tf.keys()) this.df.set(t, (this.df.get(t) || 0) + 1);
  }

  idf(t) {
    const df = this.df.get(t) || 0;
    return Math.log(1 + (this.N - df + 0.5) / (df + 0.5));
  }

  /**
   * @returns {{ results: Array<{chunk, score}>, terms: string[], coverage: number }}
   * coverage = share of the query's meaningful terms found anywhere in the top results.
   */
  search(query, { k = 5, perPage: maxPerPage = 2 } = {}) {
    const terms = [...new Set(tokenize(query))];
    if (!terms.length || !this.N) return { results: [], terms, coverage: 0 };
    // Generic words count less, unless the question has nothing else ("who do you work with?").
    const allSoft = terms.every((t) => SOFT.has(t));
    const weighted = new Map(terms.map((t) => [t, SOFT.has(t) && !allSoft ? 0.3 : 1]));
    const alts = new Map(terms.map((t) => [t, (SYNONYMS[t] || []).map(stem)]));
    // Words the site never uses exactly get prefix variants ("warm" → "warmth").
    for (const t of terms) {
      if (this.df.has(t) || t.length < 4) continue;
      for (const v of this.df.keys()) if (v.startsWith(t) && v.length <= t.length + 3) alts.get(t).push(v);
    }
    for (const [t, list] of alts) for (const a of list) if (!weighted.has(a)) weighted.set(a, SYNONYMS[t]?.map(stem).includes(a) ? 0.5 : 0.8);

    const k1 = 1.4, b = 0.75;
    const scored = this.docs.map((d, i) => {
      let score = 0;
      for (const [t, w] of weighted) {
        const f = d.tf.get(t);
        if (!f) continue;
        score += w * this.idf(t) * (f * (k1 + 1)) / (f + k1 * (1 - b + b * d.len / this.avgdl));
      }
      return { chunk: this.chunks[i], score, i };
    }).filter((r) => r.score > 0).sort((a, z) => z.score - a.score);

    // Diversify: at most 2 chunks per page in the top-k.
    const perPage = new Map(); const results = [];
    for (const r of scored) {
      const n = perPage.get(r.chunk.url) || 0;
      if (n >= maxPerPage) continue;
      perPage.set(r.chunk.url, n + 1);
      results.push(r);
      if (results.length >= k) break;
    }

    // idf-weighted coverage of the meaningful terms by the top-3 chunks. Terms that never
    // occur on the site get the maximum weight, so "Do you sell kayaks?" scores ~0.
    const hard = terms.filter((t) => !SOFT.has(t));
    const need = hard.length ? hard : terms;
    const maxIdf = Math.log(1 + (this.N + 0.5) / 0.5);
    let have = 0, total = 0;
    for (const t of need) {
      const known = this.df.has(t) || alts.get(t).some((a) => this.df.has(a));
      const w = known ? this.idf(this.df.has(t) ? t : alts.get(t).find((a) => this.df.has(a))) : maxIdf;
      total += w;
      const hit = results.slice(0, 3).some((r) => {
        const tf = this.docs[r.i].tf;
        return tf.has(t) || alts.get(t).some((a) => tf.has(a));
      });
      if (hit) have += w;
    }
    return {
      results: results.map(({ chunk, score }) => ({ chunk, score: +score.toFixed(3) })),
      terms,
      synonyms: [...weighted.keys()].filter((t) => !terms.includes(t)),
      coverage: total ? have / total : 0,
    };
  }
}
