// Regression tests for retrieval + grounded answering, using the bundled sample site.
// Runs offline in retrieval-only mode: node --test test/
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderSamplePage, SAMPLE_PREFIX } from '../lib/sample-site.js';
import { extractPage, chunkText } from '../lib/extract.js';
import { SearchIndex } from '../lib/search.js';

process.env.SITEMATE_LLM_PROVIDER = 'none'; // tests exercise retrieval-only mode, offline
const { answerQuestion } = await import('../lib/answer.js');

const paths = ['/', '/products/trailhead-backpack-40l', '/products/summit-down-jacket', '/products/ridgeline-tent-2p',
  '/shipping', '/returns', '/warranty', '/repair-program', '/stores', '/about', '/faq', '/contact', '/blog/how-to-choose-a-sleeping-bag'];
const chunks = [];
for (const p of paths) {
  const url = `http://test${SAMPLE_PREFIX}${p}`;
  const page = extractPage(renderSamplePage(`${SAMPLE_PREFIX}${p}`), url);
  for (const c of chunkText(page.text)) chunks.push({ url, title: page.title, heading: c.heading, text: c.text });
}
const index = new SearchIndex(chunks);
const bot = { siteName: 'Fernhill Outdoor Co.', origin: 'http://test', config: { name: 'Fernhill Assistant', welcome: 'Hi!' } };
const ask = (q, history) => answerQuestion(bot, index, q, history);

test('extraction drops nav/footer boilerplate', () => {
  const page = extractPage(renderSamplePage(`${SAMPLE_PREFIX}/shipping`), 'http://test/sample-site/shipping');
  assert.match(page.text, /flat \$14\.95/);
  assert.doesNotMatch(page.text, /Careers/);
  assert.ok(page.links.some((l) => l.endsWith('/sample-site/contact')));
});

for (const [q, expectUrl, expectText] of [
  ['Do you ship to Canada?', '/shipping', /\$14\.95/],
  ['What is your return policy?', '/returns', /60 days|refund/i],
  ['How long do refunds take?', '/returns', /5 business days/],
  ['How warm is the Summit Down Jacket?', '/summit-down-jacket', /-10°C/],
  ['What are the Seattle store hours?', '/stores', /10 a\.m\. – 6 p\.m\./],
  ['Who founded the company?', '/about', /Maya Okafor/],
  ['How long do repairs take?', '/repair-program', /2–3 weeks/],
]) {
  test(`answers: ${q}`, async () => {
    const r = await ask(q);
    assert.equal(r.grounded, true, r.answer);
    assert.ok(r.sources.some((s) => s.url.endsWith(expectUrl)), JSON.stringify(r.sources));
    assert.match(r.answer, expectText);
  });
}

for (const q of ['Do you sell kayaks?', "What is the CEO's salary?", 'Do you ship to Australia by drone?', 'What is the 2027 internal pricing draft?']) {
  test(`declines without guessing: ${q}`, async () => {
    const r = await ask(q);
    assert.equal(r.grounded, false, r.answer);
    assert.equal(r.sources.length, 0);
    assert.match(r.answer, /couldn't find/);
  });
}

test('specific follow-ups are not merged with earlier context', async () => {
  const r = await ask('Do you sell kayaks?', [{ role: 'user', content: 'Do you ship to Canada?' }, { role: 'assistant', content: '…' }]);
  assert.equal(r.grounded, false);
});

test('vague follow-ups borrow the previous question', async () => {
  const r = await ask('how much does it cost?', [{ role: 'user', content: 'Tell me about the tent footprint' }, { role: 'assistant', content: '…' }]);
  assert.equal(r.grounded, true, r.answer);
  assert.match(r.answer, /\$49/);
});

for (const q of ['about us', 'Who are you?', 'What do you do?', 'Tell me about your company']) {
  test(`company overview: ${q}`, async () => {
    const r = await ask(q);
    assert.equal(r.grounded, true, r.answer);
    assert.equal(r.intent, 'overview');
    assert.ok(r.sources.some((s) => s.url.endsWith('/about')), JSON.stringify(r.sources));
    assert.match(r.answer, /founded in 2014/);
  });
}

test('specific questions are not treated as company overviews', async () => {
  const { isOverviewQuestion } = await import('../lib/answer.js');
  for (const q of ['What services do you offer?', 'about your return policy', 'who is your CEO', 'Do you sell kayaks?']) {
    assert.equal(isOverviewQuestion(q), false, q);
  }
});
