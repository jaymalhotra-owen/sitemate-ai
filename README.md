# SiteMate AI — turn any website into an AI chatbot

A working MVP prototype. Paste a URL, SiteMate crawls the site's public pages, builds a searchable knowledge base, and gives you a branded chatbot you can test, customize and embed with one `<script>` tag. Answers are grounded in the crawled pages, link to their sources, and the bot says so when the site doesn't contain the answer.

```bash
npm install
npm start          # → http://localhost:3000
npm test           # retrieval / refusal regression tests (offline)
```

Node 20+ is required. Nothing else: no database, no build step, no credentials.

---

## What's real and what isn't

The prototype is honest about what it does. The dashboard has a "What's real in this prototype" panel that says the same thing.

| Area | Status | Notes |
|---|---|---|
| Website crawling | **Working** | Real HTTP crawl: robots.txt (`*` and `SiteMateBot` groups), sitemap.xml and sitemap indexes, same-site link discovery, HTML only, page/size/time limits, deduplication, `noindex`. Every URL's outcome (indexed / skipped / failed, with the reason) is logged and shown, along with crawl notes. |
| Redirects | **Working** | The start URL's redirects are followed first (`http://example.com` → `https://www.example.com`). http/https and `www.`/bare variants of the host count as the same site. |
| llms.txt | **Working** | `/llms.txt` and `/llms-full.txt` ([llmstxt.org](https://llmstxt.org)) are fetched if present and allowed by robots.txt. They're indexed as knowledge sources, and the pages they link to are crawled first. HTML error pages served at those paths are ignored. |
| Crawl priority | **Working** | Homepage first. Then pages linked from llms.txt and from crawled pages (usually the navigation). Then remaining sitemap URLs, shortest paths first. A small page budget covers key pages before blog archives. |
| Template removal | **Working** | Lines repeated on most pages (menus, footers and contact blocks built from plain `<div>`s) are removed from every page except the homepage. Contact details (address, phone, email, hours) are also collected into one labelled "Contact details" passage, so "where is your office?" retrieves reliably. |
| Link-list pages | **Working** | HTML sitemaps, tag and archive pages (long lists of short link titles with almost no sentences) are skipped, so they don't crowd out real content in search. |
| Company-overview questions | **Working** | "About us", "who are you", "what do you do" contain no searchable keywords. They are detected and answered from the About page, the homepage meta description, llms.txt and the homepage intro. |
| Free-tier rate limits | **Handled** | Prompts are capped (~4,200 characters of passages, 900-token replies) so Groq's 8k tokens/minute free tier handles more questions. On a 429 the bot retries on the fallback model; if that is limited too, it quotes page text and says the AI tier is busy. |
| Failure handling | **Working** | If no page can be indexed, the job fails with the reasons and **no chatbot is created**. Pages that are JavaScript-rendered shells are flagged as such and not indexed. |
| SSRF protection | **Working** | Refuses localhost and private/link-local IPs, including after DNS resolution and on every redirect hop. |
| Content extraction & chunking | **Working** | Strips scripts, nav, header, footer and aside; prefers `<main>`/`<article>`; splits text into chunks that keep their section headings. |
| Retrieval | **Working** | BM25 with title/heading boosting, synonyms, prefix matching and per-page diversity. |
| "I don't know" gate | **Working** | Weighted query-coverage and score thresholds. A question about something the site never mentions ("Do you sell kayaks?") is declined, with no LLM call. |
| AI answers | **Working with a key** | With a provider key set (**Groq**, which has a free tier, or **Claude**), the model writes the answer from the retrieved passages only, with `[n]` citations that link to sources. Without a key, the bot runs in **retrieval-only mode** and quotes the most relevant sentences word for word. The UI labels which engine produced every answer. |
| Widget + embed | **Working** | `widget.js` uses Shadow DOM and is served by this server. Its config (name, logo, colour, welcome message, position, suggested questions) is stored on the server and updates live. You can set allowed origins (CORS). |
| Sample data | **Clearly labelled** | "Fernhill Outdoor Co." is a **fictional** store bundled at `/sample-site/`. The "Try the sample site" demo crawls it **for real** over HTTP, using the same pipeline as any other site. Nothing is pre-indexed. It is labelled "Sample data" everywhere: in the dashboard, in the widget header, and in a banner on the site. |
| Not built yet | — | JS-rendered sites (needs a headless browser), scheduled re-crawls, user accounts and auth, billing, analytics beyond simple counters, and multi-instance storage. |

## Demo script (about 3 minutes, offline)

1. Open http://localhost:3000 and click **Try the sample site**. The crawl runs live: robots.txt is applied (`/internal/` is disallowed and gets skipped), the sitemap is read, and a broken `/careers` link shows up as an honest 404.
2. **Overview** shows the indexed pages, chunks, word count, the launch checklist and the website's status.
3. **Knowledge base**: search for `refund used gear` to see the exact passages the bot would retrieve, with their scores. The *Crawl log* tab lists every URL.
4. **Chat playground**: click the suggested questions. Then click *Try an unanswerable one*: the bot refuses to guess. *Inspect* shows the retrieval coverage and passages behind each answer.
5. **Customize**: change the colour to green, switch the position to bottom left and upload a logo. The live preview shows the widget on the sample site.
6. **Install**: copy the snippet and click **Open test page** to use the embedded widget as a visitor would.
7. Go back to the landing page and paste a real URL (try a small docs or marketing site) to crawl a live website.

To get AI-written answers instead of quotes, add a provider to `.env` and restart. `npm start` loads `.env` automatically; the file is gitignored and only the server reads it.

```bash
# Free option: Groq (https://console.groq.com/keys)
SITEMATE_LLM_PROVIDER=groq
GROQ_API_KEY=gsk_...
GROQ_MODEL=openai/gpt-oss-120b

# Claude (paid): keep or add this. Switch with SITEMATE_LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
```

Only the step that writes the answer changes between providers. Crawling, retrieval, the "couldn't find it" check and source links are the same for all of them. The dashboard sidebar shows which provider and model are active.

## Configuration

| Env var | Default | Purpose |
|---|---|---|
| `SITEMATE_LLM_PROVIDER` | auto | `groq`, `anthropic` or `none`. Unset = the first provider with a key (Anthropic, then Groq). |
| `GROQ_API_KEY` | — | Enables Groq-written answers (free tier available). Read **only on the server**. |
| `GROQ_MODEL` | `openai/gpt-oss-120b` | Groq model. Groq retires models over time; run their models endpoint to see what your key can use. |
| `GROQ_FALLBACK_MODEL` | `openai/gpt-oss-20b` | Used when the main Groq model is rate-limited (each Groq model has its own free-tier limit). Comma-separate several; set empty to disable. |
| `ANTHROPIC_API_KEY` | — | Enables Claude-written answers. Read **only on the server**. |
| `SITEMATE_MODEL` | `claude-opus-5-5` | Claude model used for answers. |
| `PORT` / `HOST` | `3000` / `127.0.0.1` | Listen address. Use `HOST=0.0.0.0` in containers. |
| `PUBLIC_URL` | `http://localhost:$PORT` | Public base URL. Used in the embed snippet and for the widget's API calls. |
| `SITEMATE_MAX_PAGES` | `50` | Upper limit on pages per crawl. |
| `SITEMATE_DATA_DIR` | `./data` | Where `bots.json` is stored. |
| `SITEMATE_ALLOW_PRIVATE_CRAWL` | — | Set to `1` to allow crawling localhost and intranet sites (development only). |

## Architecture

```
Browser (dashboard)            Customer website
  public/index.html, app.js      <script src=".../widget.js" data-bot-id="bot_…">
        │  same-origin /api/*          │  CORS /api/widget/:id/*
        ▼                              ▼
┌──────────────────────── server.js (Node http) ───────────────────────┐
│ POST /api/ingest ─► lib/crawler.js ─► lib/extract.js ─► lib/store.js  │
│                     robots, sitemap,  clean text,       bots, pages,  │
│                     BFS, SSRF guard   chunks            chunks, config│
│ POST …/chat ──────► lib/search.js (BM25) ─► relevance gate            │
│                         └─► lib/answer.js ─► Groq / Claude (server) or │
│                                              extractive quotes        │
│ GET  /api/widget/:id/config ─► public config only (no page text)      │
└───────────────────────────────────────────────────────────────────────┘
```

**API**

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/ingest` `{url, maxPages}` or `{sample:true}` | Start a crawl. Returns `{jobId}`. |
| `GET` | `/api/jobs/:id?since=n` | Live progress: phase, events, per-URL log. |
| `GET` | `/api/bots`, `/api/bots/:id` | Bot summaries, pages and crawl log. |
| `PUT` | `/api/bots/:id/config` | Update widget config (validated server-side). |
| `GET` | `/api/bots/:id/search?q=` | Knowledge base search (for debugging). |
| `POST` | `/api/bots/:id/chat` `{message, history}` | Dashboard chat. |
| `GET` | `/api/widget/:id/config` | Public widget config (CORS). |
| `POST` | `/api/widget/:id/chat` | Public widget chat (CORS, rate-limited to 30/min per IP per bot). |

**Security**

- LLM keys exist only in the server process. The browser and the widget talk to SiteMate, never to the model provider.
- Crawled text is untrusted. It goes to the model inside `<source>` tags, and the system prompt tells the model to treat it as data and to ignore any instructions in it.
- All crawled strings are HTML-escaped before rendering. Answers are rendered through a minimal, escape-first markdown subset.
- **The dashboard API has no authentication.** Add auth before you expose it publicly (see below).

## Taking it to production

### 1. Production crawling

The built-in crawler is deliberately simple and dependency-free. For production:

- **Run crawls in a job queue** (BullMQ/Redis, SQS, Cloud Tasks) with workers, so a crawl survives restarts and can be retried. Keep the per-URL log; it's the most useful support tool you have.
- **Render JavaScript sites** with a headless browser (Playwright) when the static HTML has little text. The crawler already flags these pages ("likely rendered by JavaScript").
- **Use a real parser**: `linkedom` or `cheerio`, plus Mozilla Readability, instead of regex extraction. Also parse PDFs (`pdf-parse`) and honour `<link rel="canonical">` for deduplication.
- **Add vector search**: keyword search can't connect "office hours" to a page that says "Working Time". The contact-details passage and synonym list cover the common cases, but embeddings fix this class of problem in general (see Retrieval).
- **Be polite**: per-host concurrency of 1–2, `Crawl-delay`, exponential backoff on 429/503, a contact URL in the User-Agent, and ETag/Last-Modified for incremental re-crawls.
- **Verify domain ownership** before crawling large sites or showing a bot publicly: a DNS TXT record or a meta tag.
- **Schedule re-crawls** (daily or weekly) and re-index only the pages whose content hash changed.

### 2. Retrieval

- Store chunks in Postgres with **pgvector**, or in a vector database. Embed each chunk at index time and run **hybrid search**: BM25/`tsvector` plus vector similarity, merged with reciprocal rank fusion. Keep the coverage-based "I don't know" gate, and tune its thresholds on real traffic.
- Suggested schema:

```sql
create table bots      (id text primary key, org_id text not null, site_name text, origin text, config jsonb, created_at timestamptz default now());
create table pages     (id bigserial primary key, bot_id text references bots on delete cascade, url text, title text, content_hash text, fetched_at timestamptz, unique (bot_id, url));
create table chunks    (id bigserial primary key, page_id bigint references pages on delete cascade, bot_id text, heading text, text text, tsv tsvector, embedding vector(1024));
create table crawl_log (job_id text, url text, status text, note text, at timestamptz default now());
create index on chunks using gin (tsv);
create index on chunks using hnsw (embedding vector_cosine_ops);
```

### 3. AI responses

- `lib/answer.js` has a small provider table. Each provider takes a system prompt and messages and returns text:
  - **Groq** is called over its OpenAI-compatible REST endpoint with `fetch` (no extra dependency), with low reasoning effort for gpt-oss models.
  - **Claude** goes through the official `@anthropic-ai/sdk`, with low effort, server-side refusal fallbacks (`fallbacks: "default"`) and handling for a `refusal` stop reason.
  - To add another provider (Gemini, Ollama, …), add one entry to the table.
- Citations are normalised (`[n]`, `【n】`, `[1, 2]`) and mapped to source URLs. An answer with no citations counts as "not found".
- When an AI provider is active, the relevance gate is looser (35% query coverage instead of 60%) and more passages are retrieved, because the model can bridge paraphrases. Questions with no overlap at all with the site are still declined without an API call.
- Next steps: stream tokens to the widget (SSE) for perceived speed; use prompt caching for a stable system prompt; log questions that went unanswered to a review queue (the counters are already in place); and add an eval set built from real visitor questions before you change prompts or thresholds.

### 4. Hosted widget configuration

- Serve `widget.js` from a CDN with a long cache plus a versioned URL. Serve `/api/widget/:id/config` with a short cache (about 60 s) so dashboard changes show up quickly.
- Enforce **allowed origins** per bot (already supported) and add per-bot quotas on top of the per-IP rate limit.
- Use public bot IDs (as now) for the embed. Never put a secret in the snippet.

### 5. Deployment

```bash
# Example: any Node host (Render, Railway, Fly.io, a VM)
HOST=0.0.0.0 PORT=8080 PUBLIC_URL=https://chat.yourdomain.com \
ANTHROPIC_API_KEY=… SITEMATE_DATA_DIR=/var/lib/sitemate node server.js
```

- Put it behind HTTPS (a platform TLS proxy, or Caddy/nginx). Set `PUBLIC_URL` to the public origin so the embed snippet is correct.
- Put the dashboard behind authentication (e.g. Auth.js, Clerk or your SSO) and scope bots to an organisation. Keep `/api/widget/*`, `/widget.js` and `/preview/*` public.
- Replace `lib/store.js` (a JSON file, suitable for one instance only) with Postgres before you run more than one instance.

## Project layout

```
server.js            HTTP server and routes
lib/crawler.js       robots.txt, sitemap, BFS crawl, SSRF guard
lib/extract.js       HTML → clean text, chunking
lib/search.js        BM25 index + relevance coverage
lib/answer.js        grounded answers (Groq / Claude / extractive) + refusal gate
lib/store.js         JSON persistence, widget config validation
lib/sample-site.js   fictional "Fernhill Outdoor Co." site served at /sample-site/
public/              dashboard (index.html, app.css, app.js), widget.js, preview.html
test/                offline regression tests for retrieval and refusals
```
