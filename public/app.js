// SiteMate AI dashboard — vanilla JS, no build step.
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const app = $('#app');

// ---------- utilities ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => Number(n || 0).toLocaleString();
const plural = (n, word) => `${fmt(n)} ${word}${Number(n) === 1 ? "" : "s"}`;
const shortTitle = (t) => (t || '').split(/\s[|–—-]\s/)[0].trim() || t;
const pathOf = (u) => { try { const x = new URL(u); return x.pathname + x.search; } catch { return u; } };
const hostOf = (u) => { try { return new URL(u).host; } catch { return u; } };
const ago = (iso) => {
  const s = (Date.now() - new Date(iso)) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString();
};
const initials = (name) => (name || '?').replace(/[^\p{L}\p{N} ]/gu, '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
};

async function api(path, opts = {}) {
  const res = await fetch(path, { ...opts, headers: { 'content-type': 'application/json', ...(opts.headers || {}) }, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) { location.href = "/login"; throw new Error("Sign in required"); }
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

let toastTimer;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

// Accessible confirm dialog. Resolves true when confirmed. `typeToConfirm` requires the
// user to type a word (e.g. the site name) before the destructive button enables.
function confirmDialog({ title, body, confirmLabel = 'Confirm', danger = false, typeToConfirm = null }) {
  return new Promise((resolve) => {
    const prevFocus = document.activeElement;
    const wrap = document.createElement('div');
    wrap.className = 'modal-backdrop';
    wrap.innerHTML = `<div class="modal" role="alertdialog" aria-modal="true" aria-labelledby="mTitle" aria-describedby="mBody">
      <div class="modal-icon ${danger ? 'danger' : ''}">${ic(danger ? 'trash' : 'info')}</div>
      <h3 id="mTitle">${esc(title)}</h3>
      <div id="mBody" class="modal-body">${body}</div>
      ${typeToConfirm ? `<label class="field" style="margin-top:14px"><span>Type <b>${esc(typeToConfirm)}</b> to confirm</span><input class="input" id="mType" autocomplete="off" spellcheck="false"></label>` : ''}
      <div class="modal-actions"><button class="btn" data-act="cancel">Cancel</button><button class="btn ${danger ? 'btn-danger-solid' : 'btn-primary'}" data-act="ok" ${typeToConfirm ? 'disabled' : ''}>${esc(confirmLabel)}</button></div>
    </div>`;
    document.body.append(wrap);
    const ok = $('[data-act="ok"]', wrap);
    const close = (val) => { wrap.remove(); document.removeEventListener('keydown', onKey); prevFocus?.focus?.(); resolve(val); };
    const onKey = (e) => {
      if (e.key === 'Escape') close(false);
      if (e.key === 'Tab') {                                           // keep focus inside the dialog
        const f = $$('button:not([disabled]), input', wrap);
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f.at(-1).focus(); }
        else if (!e.shiftKey && document.activeElement === f.at(-1)) { e.preventDefault(); f[0].focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    wrap.addEventListener('mousedown', (e) => { if (e.target === wrap) close(false); });
    $('[data-act="cancel"]', wrap).onclick = () => close(false);
    ok.onclick = () => close(true);
    if (typeToConfirm) {
      const input = $('#mType', wrap);
      input.oninput = () => { ok.disabled = input.value.trim().toLowerCase() !== typeToConfirm.toLowerCase(); };
      input.onkeydown = (e) => { if (e.key === 'Enter' && !ok.disabled) close(true); };
      input.focus();
    } else {
      $('[data-act="cancel"]', wrap).focus();
    }
  });
}

/** Ask for confirmation, delete the chatbot on the server, and clean up local state. */
async function deleteChatbot(bot) {
  const yes = await confirmDialog({
    title: `Delete “${bot.siteName}” chatbot?`,
    body: `<p>This permanently removes the chatbot, its knowledge base (${plural(bot.pages, "page")}, ${plural(bot.chunks, "passage")}), its settings and its conversation counters.</p>
      <p>Any website with this chatbot’s embed snippet will stop showing the chat bubble. This can’t be undone, but you can always crawl the site again.</p>`,
    confirmLabel: 'Delete chatbot',
    danger: true,
    typeToConfirm: bot.sample ? null : bot.siteName,
  });
  if (!yes) return false;
  try {
    await api(`/api/bots/${bot.id}`, { method: 'DELETE' });
  } catch (e) {
    toast(`Couldn’t delete: ${e.message}`);
    return false;
  }
  try { localStorage.removeItem(progressKey(bot.id)); } catch { /* private mode */ }
  if (S.bot?.id === bot.id) { S.bot = null; S.chat = []; S.inspect = null; }
  toast(`Deleted “${bot.siteName}”`);
  return true;
}

// ---------- icons (lucide-style, MIT) ----------
const P = {
  bot: '<path d="M12 8V4H8"/><rect x="4" y="8" width="16" height="12" rx="2"/><path d="M2 14h2M20 14h2M15 13v2M9 13v2"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
  grid: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
  book: '<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/>',
  chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  brush: '<path d="m9.06 11.9 8.07-8.06a2.85 2.85 0 1 1 4.03 4.03l-8.06 8.08"/><path d="M7.07 14.94c-1.66 0-3 1.35-3 3.02 0 1.33-2.5 1.52-2 2.02 1.08 1.1 2.49 2.02 4 2.02 2.2 0 4-1.8 4-4.04a3.01 3.01 0 0 0-3-3.02z"/>',
  code: '<path d="m16 18 6-6-6-6M8 6l-6 6 6 6"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  file: '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/>',
  layers: '<path d="m12 2 10 5-10 5L2 7l10-5z"/><path d="m2 17 10 5 10-5M2 12l10 5 10-5"/>',
  type: '<path d="M4 7V4h16v3M9 20h6M12 4v16"/>',
  alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3z"/><path d="M12 9v4M12 17h.01"/>',
  send: '<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>',
  link: '<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  spark: '<path d="M12 3l1.9 5.8L20 10.7l-5 3.6 1.9 5.9L12 16.6l-4.9 3.6L9 14.3l-5-3.6 6.1-1.9z"/>',
  flask: '<path d="M10 2v7.31M14 9.3V2M8.5 2h7M14 9.3a6.5 6.5 0 1 1-4 0"/><path d="M5.52 16h12.96"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5"/>',
  trash: '<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  cpu: '<rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3"/>',
  arrow: '<path d="M5 12h14M12 5l7 7-7 7"/>',
  robot: '<rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4M8 16h.01M16 16h.01"/>',
};
const ic = (n, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n] || ''}</svg>`;
const logoMark = `<span class="logo-mark"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M5 7a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3h-4l-4 3.5V16a3 3 0 0 1-3-3z"/><circle cx="9.5" cy="10" r="1.2" fill="#18181b"/><circle cx="14.5" cy="10" r="1.2" fill="#18181b"/></svg></span>`;
const logo = `<a class="logo" href="#/">${logoMark}<span>SiteMate <b>AI</b></span></a>`;

function avatar(cfg, size = 36) {
  const style = `width:${size}px;height:${size}px;background:${esc(cfg.color)}`;
  return cfg.logo ? `<span class="avatar" style="${style}"><img src="${esc(cfg.logo)}" alt=""></span>` : `<span class="avatar" style="${style};font-size:${Math.round(size * .38)}px">${esc(initials(cfg.name))}</span>`;
}

// Minimal, safe markdown for bot answers: escape first, then **bold**, bullets, [n] citations.
function renderAnswer(text, sources = []) {
  const lines = esc(text).split('\n');
  let html = ''; let inList = false;
  for (const raw of lines) {
    const line = raw.trim();
    const bullet = line.match(/^(?:•|-|\*)\s+(.*)$/);
    if (bullet) { if (!inList) { html += '<ul>'; inList = true; } html += `<li>${inline(bullet[1])}</li>`; continue; }
    if (inList) { html += '</ul>'; inList = false; }
    if (line) html += `<p>${inline(line)}</p>`;
  }
  if (inList) html += '</ul>';
  return html;
  function inline(s) {
    return s.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
      .replace(/\[(\d+)\]/g, (m, n) => { const src = sources[+n - 1]; return src ? `<sup><a href="${esc(src.url)}" target="_blank" rel="noopener" title="${esc(src.title)}">${n}</a></sup>` : ''; });
  }
}

// ---------- app state ----------
const S = {
  status: null,
  bots: [],
  bot: null,
  view: 'overview',
  chat: [],          // [{role, content, sources, engine, retrieval, coverage, ms, warning}]
  sending: false,
  inspect: null,
  kbTab: 'pages',
  installTab: 'html',
};
const progressKey = (id) => `sitemate:progress:${id}`;
const getProgress = (id) => store.get(progressKey(id), { tested: false, customized: false, installed: false });
const setProgress = (id, patch) => store.set(progressKey(id), { ...getProgress(id), ...patch });

// ---------- router ----------
async function route() {
  const [, a, b, c] = location.hash.split('/');
  if (!S.status) S.status = await api('/api/status').catch(() => ({ llm: { enabled: false } }));
  if (a === 'build' && b) return renderBuild(b);
  if (a === 'bot' && b) {
    if (!S.bot || S.bot.id !== b) {
      try { S.bot = await api(`/api/bots/${b}`); S.chat = []; S.inspect = null; } catch { location.hash = '#/'; return; }
    }
    S.view = c || 'overview';
    return renderShell();
  }
  S.bots = await api('/api/bots').catch(() => []);
  renderLanding();
}
window.addEventListener('hashchange', route);

// ---------- landing ----------
function engineSummary() {
  const l = S.status?.llm || {};
  return l.enabled
    ? { pill: `<span class="pill pill-ok"><span class="dot"></span>${esc(l.label)} connected</span>`, label: `${esc(l.label)} · ${esc(l.model)}`, detail: `Answers are written by ${esc(l.label)} from retrieved pages only, server-side.` }
    : { pill: `<span class="pill pill-warn"><span class="dot"></span>Retrieval-only mode</span>`, label: 'Retrieval-only (no LLM)', detail: l.sdkError ? esc(l.sdkError) : 'No AI provider is configured on the server (GROQ_API_KEY or ANTHROPIC_API_KEY). Answers quote the most relevant page text verbatim instead of being AI-written.' };
}

function renderLanding() {
  const e = engineSummary();
  app.innerHTML = `
  <div class="landing">
    <nav class="topnav">${logo}<div class="row">${e.pill}</div></nav>
    <section class="hero">
      <h1>Turn any website into an AI chatbot.<br><em>Answers only from your pages.</em></h1>
      <p>Paste a URL. SiteMate reads your public pages and gives you a chatbot that cites its sources, and says so when it doesn’t know.</p>
      <form class="urlbox" id="urlForm" autocomplete="off">
        <span class="prefix">${ic('globe')}</span>
        <input id="url" type="text" inputmode="url" placeholder="https://yourwebsite.com" aria-label="Website URL" required>
        <select id="maxPages" aria-label="Page limit" title="Maximum pages to crawl">
          <option value="10">10 pages</option><option value="25" selected>25 pages</option><option value="${S.status.maxPagesLimit || 50}">${S.status.maxPagesLimit || 50} pages</option>
        </select>
        <button class="btn btn-primary btn-lg" type="submit">Build my chatbot ${ic('arrow')}</button>
      </form>
      <div class="form-error" id="formError" hidden></div>
      <div class="hero-alt">
        <span>No website handy?</span>
        <button class="btn btn-sm" id="sampleBtn">${ic('flask')} Try the sample site</button>
        <span class="pill pill-sample" title="Fernhill Outdoor Co. is a fictional store bundled with this prototype. It is crawled for real from this server.">Fictional demo store</span>
      </div>
    </section>
    <div class="steps-strip">
      ${[
        ['globe', 'Crawl', 'Reads robots.txt & sitemap.xml, then fetches your public HTML pages.'],
        ['layers', 'Index', 'Cleans each page and splits it into searchable knowledge chunks.'],
        ['chat', 'Answer', 'Retrieves the best passages and answers with links to the source page.'],
        ['code', 'Embed', 'Brand it, then paste a single script tag into your site.'],
      ].map(([, h, p], n) => `<div class="step-card"><div class="n">0${n + 1}</div><h4>${h}</h4><p>${p}</p></div>`).join('')}
    </div>
    ${S.bots.length ? `<section class="existing"><h3>Your chatbots</h3><div class="bot-tiles">${S.bots.map((b) => `
      <div class="bot-tile" data-bot="${b.id}" role="link" tabindex="0" aria-label="Open ${esc(b.siteName)} chatbot">${avatar(b.config)}<div class="grow"><b class="truncate" style="display:block">${esc(b.siteName)}</b>
      <small class="muted truncate" style="display:block">${b.sample ? 'Sample data · ' : ''}${esc(hostOf(b.origin))} · ${fmt(b.pages)} pages · ${ago(b.createdAt)}</small></div>
      <button class="tile-del" data-del="${b.id}" aria-label="Delete ${esc(b.siteName)} chatbot" title="Delete chatbot">${ic('trash')}</button>${ic('arrow', 'tile-arrow')}</div>`).join('')}</div></section>` : ''}
  </div>`;

  $('#urlForm').onsubmit = async (ev) => {
    ev.preventDefault();
    const err = $('#formError'); err.hidden = true;
    const btn = ev.submitter || $('#urlForm .btn'); btn.disabled = true;
    try {
      const { jobId } = await api('/api/ingest', { method: 'POST', body: { url: $('#url').value.trim(), maxPages: +$('#maxPages').value } });
      location.hash = `#/build/${jobId}`;
    } catch (e) { err.textContent = e.message; err.hidden = false; btn.disabled = false; }
  };
  $('#sampleBtn').onclick = async () => {
    const { jobId } = await api('/api/ingest', { method: 'POST', body: { sample: true } });
    location.hash = `#/build/${jobId}`;
  };
  $$('[data-bot]').forEach((el) => {
    const open = () => (location.hash = `#/bot/${el.dataset.bot}/overview`);
    el.onclick = (e) => { if (!e.target.closest('[data-del]')) open(); };
    el.onkeydown = (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === el) { e.preventDefault(); open(); } };
  });
  $$('[data-del]').forEach((btn) => (btn.onclick = async (e) => {
    e.stopPropagation();
    const bot = S.bots.find((x) => x.id === btn.dataset.del);
    if (bot && await deleteChatbot(bot)) route();
  }));
  setTimeout(() => $('#url')?.focus(), 50);
}

// ---------- build / crawl progress ----------
let buildTimer = null;
function renderBuild(jobId) {
  clearTimeout(buildTimer);
  const log = [];
  const phases = [
    ['robots', 'Checking robots.txt', 'Respecting the site’s crawl rules'],
    ['sitemap', 'Discovering pages', 'Reading sitemap.xml and following links'],
    ['fetch', 'Fetching & extracting content', 'Downloading HTML and stripping navigation, scripts and boilerplate'],
    ['index', 'Building the knowledge base', 'Chunking pages into searchable passages'],
    ['ready', 'Chatbot ready', 'Grounded in the pages above'],
  ];
  app.innerHTML = `
  <div class="landing"><nav class="topnav">${logo}${engineSummary().pill}</nav>
  <div class="build">
    <div class="build-head"><h2 id="bTitle">Analyzing website…</h2><p id="bUrl" class="mono"></p></div>
    <div class="card"><div class="timeline" id="tl"></div>
      <div style="padding:0 24px 18px"><div class="row" style="justify-content:space-between;font-size:12.5px;margin-bottom:6px"><span class="muted" id="bCount">Starting…</span><span class="muted mono" id="bTime">0.0s</span></div><div class="progress"><i id="bBar" style="width:4%"></i></div><ul class="notes" id="bNotes"></ul></div>
    </div>
    <div id="bError"></div>
    <div class="card" style="margin-top:16px"><div class="card-h"><div><h3>Crawl log</h3><p>Every URL we tried, and exactly what happened to it.</p></div><span id="bLegend"></span></div><div class="log" id="bLog"><div class="empty">Waiting for the first page…</div></div></div>
  </div></div>`;

  const order = phases.map((p) => p[0]);
  async function poll() {
    let job;
    try { job = await api(`/api/jobs/${jobId}?since=${log.length}`); } catch { $('#bTitle').textContent = 'This crawl job no longer exists'; return; }
    log.push(...job.log);
    $('#bUrl').textContent = job.url;
    const idx = job.status === 'done' ? order.length : Math.max(0, order.indexOf(job.phase));
    $('#tl').innerHTML = phases.map(([k, h, p], i) => {
      const st = job.status === 'failed' && i === idx ? 'failed' : i < idx || (job.status === 'done') ? 'done' : i === idx ? 'active' : '';
      return `<div class="tl-item ${st}"><span class="tl-icon">${st === 'done' ? ic('check') : st === 'failed' ? ic('x') : st === 'active' ? '<span class="spinner"></span>' : ''}</span><div><h4>${h}</h4><p>${p}</p></div></div>`;
    }).join('');
    const indexed = log.filter((l) => l.status === 'indexed').length;
    const skipped = log.filter((l) => l.status === 'skipped').length;
    const failed = log.filter((l) => l.status === 'failed').length;
    $('#bCount').textContent = `${indexed} indexed · ${skipped} skipped · ${failed} failed`;
    $('#bTime').textContent = `${(job.elapsedMs / 1000).toFixed(1)}s`;
    $('#bNotes').innerHTML = job.events.filter((e) => e.type === 'note').map((e) => `<li>${ic('info')}<span>${esc(e.message)}</span></li>`).join('');
    $('#bBar').style.width = job.status === 'done' ? '100%' : `${Math.min(92, 6 + idx * 14 + log.length * 3)}%`;
    if (log.length) {
      $('#bLog').innerHTML = log.slice().reverse().map(logRow).join('');
    }
    if (job.status === 'running') { buildTimer = setTimeout(poll, 450); return; }
    if (job.status === 'done') {
      $('#bTitle').textContent = 'Your chatbot is ready 🎉';
      toast('Knowledge base built');
      setTimeout(() => (location.hash = `#/bot/${job.botId}/overview`), 1100);
    } else {
      $('#bTitle').textContent = 'We couldn’t build a knowledge base';
      $('#bBar').style.background = 'var(--bad)';
      $('#bError').innerHTML = `<div class="banner banner-warn" style="margin-top:16px">${ic('alert')}<div><b>${esc(job.error)}</b><br>Nothing was indexed, so no chatbot was created. Common causes: the site blocks crawlers, needs a login, renders content with JavaScript only, or the URL is mistyped.
        <div style="margin-top:10px" class="row"><a class="btn btn-sm" href="#/">Try another URL</a><button class="btn btn-sm" id="trySample">${ic('flask')} Use the sample site instead</button></div></div></div>`;
      $('#trySample').onclick = async () => { const { jobId: j } = await api('/api/ingest', { method: 'POST', body: { sample: true } }); location.hash = `#/build/${j}`; };
    }
  }
  poll();
}

function logRow(l) {
  const cls = { indexed: 'pill-ok', skipped: 'pill-warn', failed: 'pill-bad' }[l.status];
  const note = l.status === 'indexed' ? `${fmt(l.words)} words${l.note ? ' · ' + esc(l.note) : ''}` : esc(l.note || '');
  return `<div class="log-row"><span class="pill ${cls}">${l.status}</span><span class="u truncate" title="${esc(l.url)}">${esc(pathOf(l.url))}</span><span class="note">${note}</span></div>`;
}

// ---------- dashboard shell ----------
const VIEWS = [
  ['overview', 'Overview', 'grid'],
  ['knowledge', 'Knowledge base', 'book'],
  ['playground', 'Chat playground', 'chat'],
  ['customize', 'Customize', 'brush'],
  ['install', 'Install', 'code'],
];

function renderShell() {
  clearTimeout(buildTimer);
  const b = S.bot; const e = engineSummary();
  const title = VIEWS.find((v) => v[0] === S.view)?.[1] || 'Overview';
  app.innerHTML = `
  <div class="shell" id="shell">
    <aside class="side">
      ${logo}
      <button class="side-site" id="siteSwitch" title="Back to all chatbots">${avatar(b.config, 34)}<span class="grow"><b class="truncate">${esc(b.siteName)}</b><small class="truncate">${b.sample ? 'Sample site · fictional' : esc(hostOf(b.origin))}</small></span></button>
      <nav class="nav">${VIEWS.map(([k, label, i]) => `<button class="${S.view === k ? 'on' : ''}" data-view="${k}">${ic(i)}${label}${k === 'knowledge' ? `<span class="count">${b.pages}</span>` : ''}</button>`).join('')}</nav>
      <div class="side-foot">
        <div class="engine-box"><b>${ic('cpu')} ${e.label}</b>${e.detail}</div>
        <a class="btn btn-sm" href="#/">${ic('plus')} New chatbot</a>
        ${S.status.auth === 'password' ? '<a class="btn btn-sm btn-ghost" href="/logout">Sign out</a>' : ''}
      </div>
    </aside>
    <div class="main">
      <header class="topbar">
        <button class="btn btn-ghost btn-sm menu" id="menuBtn" aria-label="Open navigation">${ic('menu')}</button>
        <h1>${title}</h1>
        ${b.sample ? '<span class="pill pill-sample">Sample data</span>' : '<span class="pill pill-ok"><span class="dot"></span>Live crawl</span>'}
        <span class="grow"></span>
        <a class="btn btn-sm" href="/preview/${b.id}" target="_blank" rel="noopener">${ic('link')} Test page</a>
      </header>
      <div class="content" id="content"></div>
    </div>
  </div>`;
  $$('[data-view]').forEach((el) => (el.onclick = () => (location.hash = `#/bot/${b.id}/${el.dataset.view}`)));
  $('#siteSwitch').onclick = () => (location.hash = '#/');
  $('#menuBtn').onclick = () => $('#shell').classList.toggle('nav-open');
  $('#shell').addEventListener('click', (ev) => { if (ev.target.id === 'shell') ev.target.classList.remove('nav-open'); });
  ({ overview: viewOverview, knowledge: viewKnowledge, playground: viewPlayground, customize: viewCustomize, install: viewInstall }[S.view] || viewOverview)();
}

function sampleBanner() {
  return S.bot.sample ? `<div class="banner banner-sample">${ic('flask')}<div><b>You’re viewing sample knowledge.</b> “Fernhill Outdoor Co.” is a fictional store bundled with SiteMate so the demo works offline and without credentials. Its pages were still crawled and indexed for real by the same pipeline used for your site. <a href="#/">Crawl your own website →</a></div></div>` : '';
}

// ---------- overview ----------
function viewOverview() {
  const b = S.bot; const pr = getProgress(b.id); const c = b.crawl;
  const e = engineSummary();
  const steps = [
    ['Website analyzed', `${fmt(c.indexed)} of ${fmt(c.indexed + c.skipped + c.failed)} URLs indexed`, true, null],
    ['Knowledge base created', `${fmt(b.chunks)} searchable passages from ${fmt(b.words)} words`, true, 'knowledge'],
    ['Chatbot generated', `“${esc(b.config.name)}” answers only from your pages`, true, null],
    ['Test it in the playground', 'Ask a few real customer questions', pr.tested, 'playground'],
    ['Customize the look', 'Name, logo, colours, welcome message, position', pr.customized, 'customize'],
    ['Install on your website', 'Copy the embed snippet', pr.installed, 'install'],
  ];
  const done = steps.filter((s) => s[2]).length;
  $('#content').innerHTML = `
    ${sampleBanner()}
    <div class="grid g-4">
      ${stat('file', 'Pages indexed', fmt(b.pages), c.notFetched ? `${fmt(c.notFetched)} more found, over page limit` : `of ${fmt(c.discovered)} URLs discovered`)}
      ${stat('layers', 'Knowledge chunks', fmt(b.chunks), `~${Math.round(b.words / Math.max(b.chunks, 1))} words per chunk`)}
      ${stat('type', 'Words of content', fmt(b.words), 'Cleaned page text')}
      ${stat('chat', 'Conversations', fmt(b.stats.conversations), `${fmt(b.stats.messages)} messages · ${fmt(b.stats.unanswered)} unanswered`)}
    </div>
    <div class="grid g-main" style="margin-top:16px">
      <div class="card">
        <div class="card-h"><div><h3>Launch checklist</h3><p>${done} of ${steps.length} complete</p></div><div style="width:120px" class="progress"><i style="width:${(done / steps.length) * 100}%"></i></div></div>
        <div class="checklist">${steps.map(([h, s, ok, v]) => `<div class="check ${ok ? 'done' : ''}"><span class="c">${ok ? ic('check') : ''}</span><div><b>${h}</b><small>${s}</small></div>${v && !ok ? `<button class="btn btn-sm" data-go="${v}">Start</button>` : v ? `<button class="btn btn-sm btn-ghost" data-go="${v}">Open</button>` : ''}</div>`).join('')}</div>
      </div>
      <div class="grid" style="align-content:start">
        <div class="card"><div class="card-h"><h3>Website status</h3>${c.failed ? `<span class="pill pill-warn">${c.failed} failed</span>` : '<span class="pill pill-ok"><span class="dot"></span>Healthy</span>'}</div>
          <div class="card-b"><dl class="kv">
            <dt>Website</dt><dd><a href="${esc(b.startUrl)}" target="_blank" rel="noopener">${b.sample ? 'fernhill (sample site)' : esc(hostOf(b.startUrl))}</a></dd>
            <dt>Source</dt><dd>${b.sample ? 'Bundled sample site (fictional)' : 'Live crawl'}</dd>
            <dt>Last crawl</dt><dd>${ago(c.finishedAt)}</dd>
            <dt>Skipped / failed</dt><dd>${fmt(c.skipped)} / ${fmt(c.failed)}</dd>
            <dt>Answer engine</dt><dd>${e.label}</dd>
          </dl></div></div>
        <div class="card"><div class="card-h"><div><h3>What’s real in this prototype</h3><p>No smoke and mirrors.</p></div></div>
          <div class="reality">
            <div><span class="pill pill-ok">Working</span><span>Crawling (robots.txt, sitemap, link discovery), text extraction, chunking, BM25 search, source-linked answers, refusals, widget embed & config.</span></div>
            <div><span class="pill ${S.status.llm.enabled ? 'pill-ok' : 'pill-warn'}">${S.status.llm.enabled ? 'Working' : 'Needs key'}</span><span>AI-written answers (server-side). ${S.status.llm.enabled ? `Connected to ${esc(S.status.llm.label)} (${esc(S.status.llm.model)}).` : 'Set <code class="inline-code">GROQ_API_KEY</code> or <code class="inline-code">ANTHROPIC_API_KEY</code> to enable; until then answers quote page text.'}</span></div>
            <div><span class="pill">Not yet</span><span>JavaScript-rendered pages, scheduled re-crawls, accounts & auth, billing, analytics beyond simple counters.</span></div>
          </div></div>
      </div>
    </div>
    <div class="card" style="margin-top:16px"><div class="card-h"><div><h3>Indexed pages</h3><p>Content your chatbot can draw from</p></div><button class="btn btn-sm" data-go="knowledge">View all ${ic('arrow')}</button></div>
      ${pagesTable(b.pageList.slice(0, 6))}</div>
    <div class="card danger-zone" style="margin-top:16px"><div class="card-h"><div><h3>Delete this chatbot</h3><p>Removes the chatbot, its knowledge base and settings. Embedded widgets stop working.</p></div>
      <button class="btn btn-danger" id="deleteBot">${ic('trash')} Delete chatbot</button></div></div>`;
  $$('[data-go]').forEach((el) => (el.onclick = () => (location.hash = `#/bot/${b.id}/${el.dataset.go}`)));
  $('#deleteBot').onclick = async () => { if (await deleteChatbot(b)) location.hash = '#/'; };
}
const stat = (i, k, v, s) => `<div class="card stat"><div class="k"><i>${ic(i)}</i>${k}</div><div class="v">${v}</div><div class="s">${s}</div></div>`;

function pagesTable(pages, expandable = false) {
  return `<div style="overflow:auto"><table class="table"><thead><tr><th>Page</th><th class="num hide-sm">Words</th><th class="num hide-sm">Chunks</th><th class="num">Status</th></tr></thead><tbody>
    ${pages.map((p, i) => `<tr class="${expandable ? 'clickable' : ''}" data-row="${i}"><td><div class="t">${esc(shortTitle(p.title))}</div><a class="u" href="${esc(p.url)}" target="_blank" rel="noopener">${esc(pathOf(p.url))}</a></td>
      <td class="num hide-sm">${fmt(p.words)}</td><td class="num hide-sm">${fmt(p.chunks)}</td><td class="num"><span class="pill pill-ok">${ic('check')} Indexed</span></td></tr>
      ${expandable ? `<tr class="preview-row" data-prev="${i}" hidden><td colspan="4">${esc(p.description ? p.description + '\n\n' : '')}${esc(p.preview)}…</td></tr>` : ''}`).join('')}
  </tbody></table></div>`;
}

// ---------- knowledge base ----------
function viewKnowledge() {
  const b = S.bot;
  $('#content').innerHTML = `
    ${sampleBanner()}
    <div class="card" style="margin-bottom:16px"><div class="card-h"><div><h3>Search the knowledge base</h3><p>See exactly which passages the chatbot would retrieve for a question.</p></div></div>
      <div class="card-b"><form id="kbSearch" class="row"><input class="input" id="kbq" placeholder="e.g. how long do refunds take?" autocomplete="off"><button class="btn btn-primary">${ic('search')} Search</button></form>
      <div id="kbResults" style="margin-top:14px"></div></div></div>
    <div class="card"><div class="card-h"><div class="tabs"><button data-tab="pages" class="${S.kbTab === 'pages' ? 'on' : ''}">Sources (${b.pages})</button><button data-tab="log" class="${S.kbTab === 'log' ? 'on' : ''}">Crawl log (${b.crawlLog.length})</button></div>
      <button class="btn btn-sm" id="recrawl">${ic('refresh')} Re-crawl</button></div>
      <div id="kbBody"></div></div>`;
  const body = () => {
    if (S.kbTab === 'pages') {
      $('#kbBody').innerHTML = pagesTable(b.pageList, true);
      $$('[data-row]').forEach((r) => (r.onclick = (ev) => { if (ev.target.closest('a')) return; const p = $(`[data-prev="${r.dataset.row}"]`); p.hidden = !p.hidden; }));
    } else {
      $('#kbBody').innerHTML = `${(b.crawlNotes || []).length ? `<ul class="notes" style="padding:14px 20px 4px">${b.crawlNotes.map((n) => `<li>${ic('info')}<span>${esc(n)}</span></li>`).join('')}</ul>` : ''}<div class="log" style="max-height:none">${b.crawlLog.map(logRow).join('')}</div>`;
    }
  };
  body();
  $$('[data-tab]').forEach((t) => (t.onclick = () => { S.kbTab = t.dataset.tab; $$('[data-tab]').forEach((x) => x.classList.toggle('on', x === t)); body(); }));
  $('#recrawl').onclick = async () => {
    const { jobId } = await api('/api/ingest', { method: 'POST', body: b.sample ? { sample: true } : { url: b.startUrl, maxPages: Math.max(b.pages, 25) } });
    toast('Re-crawl started — this creates a fresh knowledge base');
    location.hash = `#/build/${jobId}`;
  };
  $('#kbSearch').onsubmit = async (ev) => {
    ev.preventDefault();
    const q = $('#kbq').value.trim(); if (!q) return;
    const r = await api(`/api/bots/${b.id}/search?q=${encodeURIComponent(q)}`);
    $('#kbResults').innerHTML = renderChunks(r.results, r.terms, r.coverage);
  };
}

function highlight(text, terms) {
  let h = esc(text);
  const words = terms.filter((t) => t.length > 2).map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (words.length) h = h.replace(new RegExp(`\\b(${words.join('|')})\\w*`, 'gi'), '<mark>$&</mark>');
  return h;
}

function renderChunks(results, terms = [], coverage) {
  if (!results.length) return `<div class="empty">${ic('search')}<div>No matching passages. The chatbot would say it doesn’t know.</div></div>`;
  const max = results[0].score || 1;
  return `<div class="row muted" style="font-size:12.5px;margin-bottom:10px">Query terms: ${terms.map((t) => `<code class="inline-code">${esc(t)}</code>`).join(' ') || '—'}${coverage != null ? ` · coverage ${(coverage * 100).toFixed(0)}%` : ''}</div>
  <div class="search-results">${results.map((r, i) => `<div class="chunk"><div class="chunk-h"><span class="pill pill-brand">#${i + 1}</span><b class="grow truncate">${esc(shortTitle(r.title))}${r.heading ? ` <span class="muted">› ${esc(r.heading)}</span>` : ''}</b>
    <span class="score-bar" title="BM25 score ${r.score}"><i style="width:${(r.score / max) * 100}%"></i></span><span class="mono muted" style="font-size:11.5px">${Number(r.score).toFixed(2)}</span></div>
    <p>${highlight((r.text || r.preview || '').slice(0, 420), terms)}${(r.text || r.preview || '').length > 420 ? '…' : ''}</p>
    <a class="u mono" style="font-size:11.5px" href="${esc(r.url)}" target="_blank" rel="noopener">${esc(pathOf(r.url))}</a></div>`).join('')}</div>`;
}

// ---------- playground ----------
function viewPlayground() {
  const b = S.bot; const cfg = b.config;
  $('#content').innerHTML = `
    ${S.status.llm.enabled ? '' : `<div class="banner banner-info">${ic('info')}<div><b>Retrieval-only mode.</b> No LLM key is configured on the server, so answers are verbatim quotes from the most relevant pages — never generated text. Add <code class="inline-code">GROQ_API_KEY</code> or <code class="inline-code">ANTHROPIC_API_KEY</code> to <code class="inline-code">.env</code> and restart to get AI-written answers grounded in the same sources.</div></div>`}
    <div class="play">
      <div class="card chat">
        <div class="chat-h">${avatar(cfg, 38)}<div class="grow"><b>${esc(cfg.name)}</b><small>Answers from ${esc(b.siteName)} · ${S.status.llm.enabled ? `AI: ${esc(S.status.llm.label)} (${esc(S.status.llm.model)})` : "No AI key: quoting pages"}</small></div>
          <button class="btn btn-sm btn-ghost" id="resetChat">${ic('refresh')} Reset</button></div>
        <div class="msgs" id="msgs"></div>
        <form class="composer" id="composer"><input id="msgIn" placeholder="Ask ${esc(cfg.name)} anything…" autocomplete="off" maxlength="1000"><button class="btn btn-primary" aria-label="Send" style="background:${esc(cfg.color)}">${ic('send')}</button></form>
      </div>
      <div class="card inspector"><div class="card-h"><div><h3>Retrieval inspector</h3><p>Why the bot answered the way it did</p></div></div><div class="card-b" id="inspect"></div></div>
    </div>`;
  drawChat(); drawInspector();
  $('#composer').onsubmit = (ev) => { ev.preventDefault(); sendMsg($('#msgIn').value); };
  $('#resetChat').onclick = () => { S.chat = []; S.inspect = null; drawChat(); drawInspector(); };
  $('#msgIn').focus();
}

function drawChat() {
  const b = S.bot; const cfg = b.config; const el = $('#msgs'); if (!el) return;
  const welcome = `<div class="msg bot"><div class="bubble">${renderAnswer(cfg.welcome)}</div></div>`;
  const chips = !S.chat.length && cfg.suggested?.length ? `<div class="chips">${cfg.suggested.map((q) => `<button class="chip" data-q="${esc(q)}">${esc(q)}</button>`).join('')}<button class="chip" data-q="Do you sell kayaks?" title="A question the website can't answer — watch the bot refuse to guess">Try an unanswerable one ↯</button></div>` : '';
  el.innerHTML = welcome + chips + S.chat.map((m, i) => m.role === 'user'
    ? `<div class="msg user"><div class="bubble" style="background:${esc(cfg.color)}">${esc(m.content)}</div></div>`
    : `<div class="msg bot"><div class="bubble">${renderAnswer(m.content, m.sources)}</div>
       <div class="meta">${(m.sources || []).map((s, j) => `<a class="src" href="${esc(s.url)}" target="_blank" rel="noopener"><span class="num">${j + 1}</span><span class="truncate">${esc(s.title)}</span>${ic('link')}</a>`).join('')}
       ${engineTag(m)}<button class="btn btn-ghost btn-sm" data-inspect="${i}" style="height:24px;font-size:11.5px">Inspect</button></div></div>`).join('')
    + (S.sending ? '<div class="msg bot"><div class="bubble typing"><i></i><i></i><i></i></div></div>' : '');
  el.scrollTop = el.scrollHeight;
  $$('[data-q]', el).forEach((c) => (c.onclick = () => sendMsg(c.dataset.q)));
  $$('[data-inspect]', el).forEach((c) => (c.onclick = () => { S.inspect = S.chat[+c.dataset.inspect]; drawInspector(); }));
}

function engineTag(m) {
  if (m.engine === 'rules') return '<span class="engine-tag">Greeting</span>';
  if (!m.grounded) return `<span class="pill pill-warn" title="Retrieval didn’t find relevant content, so the bot declined to guess">${ic('shield')} Not found on site — no guess</span>`;
  return m.engine === 'llm'
    ? `<span class="engine-tag">${ic('spark')} ${esc(m.providerLabel || 'AI')} · grounded${m.citations === "inferred" ? " · sources inferred" : ""} · ${m.ms}ms</span>`
    : `<span class="engine-tag" title="No LLM configured: quoted from page text">${ic('file')} Quoted from site · ${m.ms}ms</span>`;
}

function drawInspector() {
  const el = $('#inspect'); if (!el) return;
  const m = S.inspect;
  if (!m) { el.innerHTML = `<div class="empty">${ic('search')}<div>Send a message to see the passages retrieved for it, their relevance scores, and how the answer was produced.</div></div>`; return; }
  el.innerHTML = `<dl class="kv" style="margin-bottom:14px">
    <dt>Question</dt><dd title="${esc(m.question)}">${esc(m.question)}</dd>
    <dt>Engine</dt><dd>${m.engine === 'llm' ? `${esc(m.providerLabel)} (${esc(m.model || S.status.llm.model)})` : m.engine === 'rules' ? 'Greeting rule' : 'Extractive (no LLM)'}</dd>
    <dt>Query coverage</dt><dd>${m.coverage != null ? Math.round(m.coverage * 100) + '%' : '—'} <span class="muted">(needs ≥ ${m.engine === "llm" || (!m.grounded && S.status.llm.enabled) ? 35 : 60}%)</span></dd>
    <dt>Outcome</dt><dd>${m.grounded ? '<span class="pill pill-ok">Answered with sources</span>' : m.engine === 'rules' ? '—' : '<span class="pill pill-warn">Declined — not found</span>'}</dd>
    <dt>Latency</dt><dd>${m.ms} ms</dd></dl>
    ${m.warning ? `<div class="banner banner-warn">${ic('alert')}<div>${esc(m.warning)}</div></div>` : ''}
    <h4 style="font-size:13px;margin-bottom:8px">Retrieved passages</h4>${renderChunks(m.retrieval || [], m.terms || [])}`;
}

async function sendMsg(text) {
  text = (text || '').trim(); if (!text || S.sending) return;
  const b = S.bot;
  const history = S.chat.map(({ role, content }) => ({ role, content }));
  S.chat.push({ role: 'user', content: text });
  S.sending = true; drawChat();
  $('#msgIn').value = '';
  try {
    const r = await api(`/api/bots/${b.id}/chat`, { method: 'POST', body: { message: text, history } });
    const m = { role: 'assistant', content: r.answer, ...r, question: text };
    S.chat.push(m); S.inspect = m;
    setProgress(b.id, { tested: true });
  } catch (e) {
    S.chat.push({ role: 'assistant', content: `⚠️ ${e.message}`, grounded: false, engine: 'error', sources: [] });
  }
  S.sending = false; drawChat(); drawInspector();
}

// ---------- customize ----------
const PALETTE = ['#18181b', '#5b5bf7', '#2563eb', '#0ea5e9', '#0d9488', '#2f5d3a', '#16a34a', '#ea580c', '#e11d48', '#9333ea', '#111827'];
let saveTimer = null;

function viewCustomize() {
  const b = S.bot; const cfg = b.config;
  $('#content').innerHTML = `
    <div class="custom">
      <div class="card"><div class="card-h"><div><h3>Chatbot appearance</h3><p>Changes preview instantly and save automatically.</p></div><span class="save-state" id="saveState">${ic('check')} Saved</span></div>
        <div class="card-b form-stack">
          <label class="field">Chatbot name<input class="input" id="cName" maxlength="60" value="${esc(cfg.name)}"></label>
          <div class="field" style="display:grid;gap:6px"><span style="font-weight:600;font-size:13px;color:var(--ink-2)">Logo</span>
            <div class="logo-row"><span id="cLogoPrev">${avatar(cfg, 48)}</span>
              <label class="btn btn-sm">${ic('upload')} Upload<input type="file" id="cLogo" accept="image/png,image/jpeg,image/webp,image/gif" hidden></label>
              <button class="btn btn-sm btn-ghost" id="cLogoClear" ${cfg.logo ? '' : 'hidden'}>Remove</button><small class="muted">PNG/JPG, resized to 128px. Initials are used otherwise.</small></div></div>
          <div class="field" style="display:grid;gap:8px"><span style="font-weight:600;font-size:13px;color:var(--ink-2)">Brand colour</span>
            <div class="swatches" id="cSwatches">${PALETTE.map((c) => `<button class="swatch ${c === cfg.color ? 'on' : ''}" data-c="${c}" style="background:${c}" aria-label="Colour ${c}"></button>`).join('')}
              <label class="swatch swatch-custom" title="Custom colour"><input type="color" id="cColor" value="${esc(cfg.color)}"></label><code class="inline-code" id="cHex">${esc(cfg.color)}</code></div></div>
          <label class="field">Welcome message<textarea class="textarea" id="cWelcome" maxlength="400">${esc(cfg.welcome)}</textarea></label>
          <label class="field">Suggested questions <small>One per line, up to 4. Shown as quick-reply chips.</small><textarea class="textarea" id="cSuggested" rows="3">${esc((cfg.suggested || []).join('\n'))}</textarea></label>
          <div class="field" style="display:grid;gap:8px"><span style="font-weight:600;font-size:13px;color:var(--ink-2)">Position</span>
            <div class="seg" id="cPos"><button data-p="left" class="${cfg.position === 'left' ? 'on' : ''}">Bottom left</button><button data-p="right" class="${cfg.position === 'right' ? 'on' : ''}">Bottom right</button></div></div>
        </div></div>
      <div class="card preview-frame"><div class="browser-bar"><i></i><i></i><i></i><span class="addr">${esc(b.sample ? 'fernhill-outdoor.example' : hostOf(b.origin))} — live preview</span></div>
        <iframe id="pv" src="/preview/${b.id}?embed=1" title="Widget preview"></iframe></div>
    </div>`;

  const pv = $('#pv');
  const pushPreview = () => { try { pv.contentWindow.SiteMate?.update({ ...S.bot.config }); pv.contentWindow.SiteMate?.open(); } catch { /* cross-origin or not ready */ } };
  pv.onload = () => setTimeout(pushPreview, 300);

  const save = (patch) => {
    Object.assign(S.bot.config, patch);
    pushPreview();
    $('#saveState').innerHTML = '<span class="spinner" style="width:11px;height:11px"></span> Saving…';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      try { S.bot.config = await api(`/api/bots/${b.id}/config`, { method: 'PUT', body: S.bot.config }); $('#saveState').innerHTML = `${ic('check')} Saved`; setProgress(b.id, { customized: true }); }
      catch (e) { $('#saveState').textContent = `Not saved: ${e.message}`; }
    }, 500);
  };
  $('#cName').oninput = (e) => { save({ name: e.target.value }); if (!S.bot.config.logo) $('#cLogoPrev').innerHTML = avatar(S.bot.config, 48); };
  $('#cWelcome').oninput = (e) => save({ welcome: e.target.value });
  $('#cSuggested').oninput = (e) => save({ suggested: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 4) });
  const setColor = (c) => { $$('.swatch[data-c]').forEach((s) => s.classList.toggle('on', s.dataset.c === c)); $('#cHex').textContent = c; save({ color: c }); $('#cLogoPrev').innerHTML = avatar(S.bot.config, 48); };
  $$('.swatch[data-c]').forEach((s) => (s.onclick = () => setColor(s.dataset.c)));
  $('#cColor').oninput = (e) => setColor(e.target.value);
  $$('#cPos button').forEach((btn) => (btn.onclick = () => { $$('#cPos button').forEach((x) => x.classList.toggle('on', x === btn)); save({ position: btn.dataset.p }); }));
  $('#cLogo').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    const url = await resizeImage(f, 128);
    save({ logo: url }); $('#cLogoPrev').innerHTML = avatar(S.bot.config, 48); $('#cLogoClear').hidden = false;
  };
  $('#cLogoClear').onclick = () => { save({ logo: null }); $('#cLogoPrev').innerHTML = avatar(S.bot.config, 48); $('#cLogoClear').hidden = true; };
}

function resizeImage(file, size) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = c.height = size;
      const ctx = c.getContext('2d'); const s = Math.min(img.width, img.height);
      ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
      resolve(c.toDataURL('image/png')); URL.revokeObjectURL(img.src);
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

// ---------- install ----------
function viewInstall() {
  const b = S.bot; const base = S.status.publicUrl || location.origin;
  const snippet = `<script src="${base}/widget.js" data-bot-id="${b.id}" async></script>`;
  const local = /localhost|127\.0\.0\.1/.test(base);
  const hl = (s) => esc(s).replace(/(&lt;\/?)(\w+)/g, '$1<span class="tok-tag">$2</span>').replace(/ ([\w-]+)=(&quot;.*?&quot;)/g, ' <span class="tok-attr">$1</span>=<span class="tok-str">$2</span>');
  const platforms = {
    html: ['Any website', `Paste the snippet just before the closing <code>&lt;/body&gt;</code> tag on every page where the chatbot should appear.`],
    wordpress: ['WordPress', `Appearance → Theme File Editor → <code>footer.php</code>, paste before <code>&lt;/body&gt;</code>. Or use a plugin like “WPCode” → Add Snippet → Footer.`],
    shopify: ['Shopify', `Online Store → Themes → ⋯ → Edit code → <code>layout/theme.liquid</code>, paste before <code>&lt;/body&gt;</code>, then Save.`],
    webflow: ['Webflow / Squarespace / Wix', `Site settings → Custom code → Footer code (Webflow) · Settings → Advanced → Code injection → Footer (Squarespace) · Settings → Custom code → Body end (Wix).`],
    react: ['React / Next.js', `Next.js: <code>&lt;Script src="${esc(base)}/widget.js" data-bot-id="${b.id}" strategy="lazyOnload" /&gt;</code> in your root layout. Other SPAs: add the tag to <code>index.html</code>.`],
  };
  $('#content').innerHTML = `
    ${local ? `<div class="banner banner-warn">${ic('alert')}<div><b>This snippet points at your local server (${esc(base)}).</b> It works on this machine — try the test page — but real visitors can’t reach localhost. Deploy the server and set <code class="inline-code">PUBLIC_URL</code> (see README → Deployment) to get a production snippet.</div></div>` : ''}
    <div class="grid g-main">
      <div class="grid" style="align-content:start">
        <div class="card"><div class="card-h"><div><h3>Embed snippet</h3><p>One line. Loads asynchronously and won’t slow your page down.</p></div></div>
          <div class="card-b"><div class="code"><button class="btn btn-sm copy" id="copySnip">${ic('copy')} Copy</button>${hl(snippet)}</div>
          <div class="row" style="margin-top:14px;flex-wrap:wrap"><a class="btn" href="/preview/${b.id}" target="_blank" rel="noopener">${ic('link')} Open test page</a><span class="muted" style="font-size:12.5px">${b.sample ? 'Opens the fictional Fernhill site with your widget installed.' : 'Opens a blank host page with your widget installed.'}</span></div></div></div>
        <div class="card"><div class="card-h"><div class="tabs" style="flex-wrap:wrap">${Object.entries(platforms).map(([k, [n]]) => `<button data-pl="${k}" class="${S.installTab === k ? 'on' : ''}">${n}</button>`).join('')}</div></div>
          <div class="card-b"><ol class="steps"><li><span>Copy the snippet above.</span></li><li><span id="plText">${platforms[S.installTab][1]}</span></li><li><span>Publish, reload your site, and look for the chat bubble in the bottom ${esc(b.config.position)} corner.</span></li></ol></div></div>
      </div>
      <div class="grid" style="align-content:start">
        <div class="card"><div class="card-h"><div><h3>Allowed domains</h3><p>Optional: only these origins may use this chatbot’s API.</p></div></div>
          <div class="card-b"><textarea class="textarea" id="origins" rows="3" placeholder="https://www.yourwebsite.com&#10;https://shop.yourwebsite.com">${esc((b.config.allowedOrigins || []).join('\n'))}</textarea>
          <div class="row" style="margin-top:10px"><button class="btn btn-sm" id="saveOrigins">Save domains</button><small class="muted">Leave empty to allow any site (fine for testing).</small></div></div></div>
        <div class="card"><div class="card-h"><h3>How it works</h3></div><div class="card-b" style="font-size:13px;color:var(--ink-2)">
          <ol class="steps"><li><span><code>widget.js</code> fetches your public config (name, colours, welcome) from <code>/api/widget/${b.id}/config</code>.</span></li>
          <li><span>Visitor questions go to <code>/api/widget/${b.id}/chat</code>. Retrieval and any LLM call happen on the server — no API keys ever reach the browser.</span></li>
          <li><span>Answers come back with source links to your pages. If nothing relevant is found, the bot says so.</span></li></ol></div></div>
      </div>
    </div>`;
  $('#copySnip').onclick = async () => {
    try { await navigator.clipboard.writeText(snippet); } catch { const t = document.createElement('textarea'); t.value = snippet; document.body.append(t); t.select(); document.execCommand('copy'); t.remove(); }
    toast('Snippet copied to clipboard'); setProgress(b.id, { installed: true });
  };
  $$('[data-pl]').forEach((t) => (t.onclick = () => { S.installTab = t.dataset.pl; $$('[data-pl]').forEach((x) => x.classList.toggle('on', x === t)); $('#plText').innerHTML = platforms[S.installTab][1]; }));
  $('#saveOrigins').onclick = async () => {
    const list = $('#origins').value.split(/\s+/).map((s) => s.trim().replace(/\/$/, '')).filter(Boolean);
    const bad = list.filter((s) => !/^https?:\/\/[^/\s]+$/.test(s));
    if (bad.length) return toast(`Invalid origin: ${bad[0]} (use https://domain.com)`);
    S.bot.config = await api(`/api/bots/${b.id}/config`, { method: 'PUT', body: { allowedOrigins: list } });
    toast(list.length ? `Restricted to ${list.length} domain(s)` : 'Any domain allowed');
  };
}

route();
