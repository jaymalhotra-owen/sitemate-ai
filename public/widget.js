/*! SiteMate AI chat widget — embed with:
 *  <script src="https://YOUR_SITEMATE_HOST/widget.js" data-bot-id="bot_xxx" async></script>
 * Self-contained, framework-free, rendered in a Shadow DOM so host-page CSS can't break it.
 * Talks only to the SiteMate server; no API keys are ever present in the browser. */
(function () {
  'use strict';
  if (window.SiteMate && window.SiteMate.__loaded) return;

  var script = document.currentScript || document.querySelector('script[data-bot-id][src*="widget.js"]');
  if (!script) return;
  var botId = script.getAttribute('data-bot-id');
  var base = script.getAttribute('data-host') || new URL(script.src, location.href).origin;
  if (!botId) { console.warn('[SiteMate] Missing data-bot-id on the widget script tag.'); return; }

  var cfg = null, open = false, sending = false;
  var key = 'sitemate:chat:' + botId;
  var history = [];
  try { history = JSON.parse(sessionStorage.getItem(key)) || []; } catch (e) { history = []; }
  var saveHistory = function () { try { sessionStorage.setItem(key, JSON.stringify(history.slice(-30))); } catch (e) {} };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function initials(n) { return (n || '?').replace(/[^\p{L}\p{N} ]/gu, '').split(/\s+/).filter(Boolean).slice(0, 2).map(function (w) { return w[0]; }).join('').toUpperCase() || '?'; }
  function md(text, sources) {
    var out = '', list = false;
    esc(text).split('\n').forEach(function (raw) {
      var line = raw.trim(), b = line.match(/^(?:•|-|\*)\s+(.*)$/);
      if (b) { if (!list) { out += '<ul>'; list = true; } out += '<li>' + inl(b[1]) + '</li>'; return; }
      if (list) { out += '</ul>'; list = false; }
      if (line) out += '<p>' + inl(line) + '</p>';
    });
    if (list) out += '</ul>';
    return out;
    function inl(s) {
      return s.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\[(\d+)\]/g, function (m, n) {
        var src = (sources || [])[+n - 1];
        return src ? '<sup><a href="' + esc(src.url) + '" target="_blank" rel="noopener">' + n + '</a></sup>' : '';
      });
    }
  }

  var host = document.createElement('div');
  host.id = 'sitemate-widget';
  host.style.cssText = 'position:fixed;z-index:2147483000;bottom:0;right:0;width:0;height:0;';
  var root = host.attachShadow({ mode: 'open' });

  var CSS = ':host{all:initial}*{box-sizing:border-box;font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}' +
    '.launch{position:fixed;bottom:20px;width:56px;height:56px;border-radius:50%;border:0;cursor:pointer;color:#fff;display:grid;place-items:center;box-shadow:0 6px 20px -6px rgba(0,0,0,.35);transition:transform .2s cubic-bezier(.2,.9,.3,1.3)}' +
    '.launch:hover{transform:scale(1.07)}.launch svg{width:28px;height:28px;transition:transform .25s,opacity .2s}' +
    '.launch .x{position:absolute;opacity:0;transform:rotate(-90deg)}.is-open .launch .b{opacity:0;transform:rotate(90deg)}.is-open .launch .x{opacity:1;transform:none}' +
    '.panel{position:fixed;bottom:88px;width:380px;max-width:calc(100vw - 32px);height:600px;max-height:calc(100vh - 120px);background:#fff;border-radius:14px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 16px 48px -16px rgba(0,0,0,.25),0 0 0 1px rgba(0,0,0,.08);opacity:0;transform:translateY(16px) scale(.97);pointer-events:none;transition:opacity .2s,transform .25s cubic-bezier(.2,.9,.3,1.1)}' +
    '.is-open .panel{opacity:1;transform:none;pointer-events:auto}' +
    '.head{display:flex;align-items:center;gap:12px;padding:16px 18px;color:#fff}.av{width:38px;height:38px;border-radius:11px;background:rgba(255,255,255,.2);display:grid;place-items:center;font-weight:700;font-size:14px;overflow:hidden;flex:none}.av img{width:100%;height:100%;object-fit:cover}' +
    '.head b{display:block;font-size:15px;line-height:1.2}.head small{display:flex;align-items:center;gap:6px;font-size:12px;opacity:.88;margin-top:2px}.head small i{width:7px;height:7px;border-radius:50%;background:#4ade80}' +
    '.tag{margin-left:auto;font-size:10.5px;font-weight:700;padding:3px 7px;border-radius:99px;background:rgba(255,255,255,.2);letter-spacing:.02em}' +
    '.msgs{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px;background:#fff}' +
    '.m{max-width:86%;font-size:14px;line-height:1.55;color:#151a2e;animation:in .25s ease}@keyframes in{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:none}}' +
    '.m .bb{padding:10px 13px;border-radius:14px;border-bottom-left-radius:4px;background:#f4f4f5;border:0;overflow-wrap:anywhere}.m p{margin:0 0 6px}.m p:last-child{margin:0}.m ul{margin:4px 0;padding-left:18px}' +
    '.m.u{align-self:flex-end}.m.u .bb{color:#fff;border:0;border-bottom-left-radius:16px;border-bottom-right-radius:5px}' +
    '.srcs{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}.src{display:inline-flex;align-items:center;gap:5px;max-width:100%;padding:4px 9px;border-radius:8px;background:#fff;border:1px solid #e7e9f0;font-size:12px;color:#3c4257;text-decoration:none}.src:hover{border-color:currentColor}.src span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.src b{font-weight:700}' +
    '.note{font-size:11px;color:#6b7189;margin-top:5px}sup a{font-weight:700;font-size:10.5px;text-decoration:none;padding:0 1px}' +
    '.chips{display:flex;flex-wrap:wrap;gap:6px}.chip{padding:7px 11px;border-radius:99px;border:1px solid #e1e4ee;background:#fff;font-size:12.5px;cursor:pointer;color:#3c4257}.chip:hover{border-color:currentColor}' +
    '.typing{display:inline-flex;gap:4px;padding:13px 15px}.typing i{width:7px;height:7px;border-radius:50%;background:#b8bccc;animation:bl 1.2s infinite}.typing i:nth-child(2){animation-delay:.15s}.typing i:nth-child(3){animation-delay:.3s}@keyframes bl{0%,60%,100%{opacity:.3}30%{opacity:1}}' +
    'form{display:flex;gap:8px;padding:12px;border-top:1px solid #eceef4;background:#fff}input{flex:1;min-width:0;height:42px;border:1px solid #e1e4ee;border-radius:12px;padding:0 13px;font-size:14px;outline:none;color:#151a2e;background:#fff}input:focus{border-color:var(--c)}' +
    'form button{width:42px;height:42px;border:0;border-radius:12px;color:#fff;cursor:pointer;display:grid;place-items:center}form button:disabled{opacity:.5}form button svg{width:18px;height:18px}' +
    '.foot{text-align:center;font-size:11px;color:#8a90a6;padding:0 0 9px;background:#fff}.foot a{color:inherit;text-decoration:none;font-weight:600}' +
    '@media (max-width:480px){.panel{bottom:0!important;left:0!important;right:0!important;width:100%;max-width:100%;height:100%;max-height:100%;border-radius:0}.is-open .launch{display:none}.close-m{display:grid!important}}' +
    '.close-m{display:none;margin-left:8px;width:32px;height:32px;border:0;border-radius:9px;background:rgba(255,255,255,.18);color:#fff;place-items:center;cursor:pointer}.close-m svg{width:18px;height:18px}';

  var ICON_CHAT = '<svg class="b" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
  var ICON_X = '<svg class="x" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';
  var ICON_SEND = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/></svg>';

  var wrap, msgsEl, inputEl, sendBtn;

  function build() {
    root.innerHTML = '<style>' + CSS + '</style><div class="w"><div class="panel" role="dialog" aria-label="Chat"><div class="head"></div><div class="msgs" aria-live="polite"></div>' +
      '<form><input placeholder="Type your question…" maxlength="1000" aria-label="Message"><button type="submit" aria-label="Send">' + ICON_SEND + '</button></form>' +
      '<div class="foot">Answers from this website · <a href="' + esc(base) + '" target="_blank" rel="noopener">SiteMate AI</a></div></div>' +
      '<button class="launch" aria-label="Open chat">' + ICON_CHAT + ICON_X + '</button></div>';
    wrap = root.querySelector('.w');
    msgsEl = root.querySelector('.msgs');
    inputEl = root.querySelector('input');
    sendBtn = root.querySelector('form button');
    root.querySelector('.launch').addEventListener('click', function () { toggle(); });
    root.querySelector('form').addEventListener('submit', function (e) { e.preventDefault(); send(inputEl.value); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && open) toggle(false); });
  }

  function paint() {
    if (!cfg || !wrap) return;
    var c = cfg.color || '#18181b';
    var side = cfg.position === 'left' ? 'left' : 'right';
    wrap.style.setProperty('--c', c);
    var l = root.querySelector('.launch'), p = root.querySelector('.panel');
    l.style.background = c; l.style.left = l.style.right = ''; l.style[side] = '20px';
    p.style.left = p.style.right = ''; p.style[side] = '20px';
    sendBtn.style.background = c;
    root.querySelector('.head').style.background = c;
    root.querySelector('.head').innerHTML = '<span class="av">' + (cfg.logo ? '<img src="' + esc(cfg.logo) + '" alt="">' : esc(initials(cfg.name))) + '</span>' +
      '<div><b>' + esc(cfg.name) + '</b><small><i></i>Answers from ' + esc(cfg.siteName) + '</small></div>' +
      (cfg.sample ? '<span class="tag" title="This chatbot uses a fictional sample website">SAMPLE DATA</span>' : '') +
      '<button class="close-m" aria-label="Close chat">' + ICON_X.replace('class="x"', '') + '</button>';
    root.querySelector('.close-m').addEventListener('click', function () { toggle(false); });
    renderMsgs();
  }

  function renderMsgs() {
    var c = cfg.color || '#18181b';
    var html = '<div class="m"><div class="bb">' + md(cfg.welcome) + '</div></div>';
    if (!history.length && cfg.suggested && cfg.suggested.length) {
      html += '<div class="chips">' + cfg.suggested.map(function (q) { return '<button class="chip" style="color:' + esc(c) + '" data-q="' + esc(q) + '">' + esc(q) + '</button>'; }).join('') + '</div>';
    }
    history.forEach(function (m) {
      if (m.role === 'user') { html += '<div class="m u"><div class="bb" style="background:' + esc(c) + '">' + esc(m.content) + '</div></div>'; return; }
      html += '<div class="m"><div class="bb">' + md(m.content, m.sources) + '</div>';
      if (m.sources && m.sources.length) {
        html += '<div class="srcs">' + m.sources.map(function (s, i) { return '<a class="src" style="color:' + esc(c) + '" href="' + esc(s.url) + '" target="_blank" rel="noopener"><b>' + (i + 1) + '</b><span style="color:#3c4257">' + esc(s.title) + '</span></a>'; }).join('') + '</div>';
      }
      if (m.engine === 'extractive' && m.grounded) html += '<div class="note">Quoted directly from this website.</div>';
      html += '</div>';
    });
    if (sending) html += '<div class="m"><div class="bb typing"><i></i><i></i><i></i></div></div>';
    msgsEl.innerHTML = html;
    Array.prototype.forEach.call(msgsEl.querySelectorAll('[data-q]'), function (b) { b.addEventListener('click', function () { send(b.getAttribute('data-q')); }); });
    msgsEl.scrollTop = msgsEl.scrollHeight;
  }

  function toggle(force) {
    open = typeof force === 'boolean' ? force : !open;
    wrap.classList.toggle('is-open', open);
    root.querySelector('.launch').setAttribute('aria-label', open ? 'Close chat' : 'Open chat');
    if (open) setTimeout(function () { inputEl.focus(); }, 150);
  }

  function send(text) {
    text = (text || '').trim();
    if (!text || sending) return;
    var prior = history.map(function (m) { return { role: m.role, content: m.content }; });
    history.push({ role: 'user', content: text });
    inputEl.value = ''; sending = true; sendBtn.disabled = true; renderMsgs();
    fetch(base + '/api/widget/' + encodeURIComponent(botId) + '/chat', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: text, history: prior }),
    }).then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error(d.error || 'Something went wrong'); return d; }); })
      .then(function (d) { history.push({ role: 'assistant', content: d.answer, sources: d.sources, engine: d.engine, grounded: d.grounded }); })
      .catch(function (e) { history.push({ role: 'assistant', content: 'Sorry — ' + e.message + '. Please try again.' }); })
      .then(function () { sending = false; sendBtn.disabled = false; saveHistory(); renderMsgs(); });
  }

  window.SiteMate = {
    __loaded: true,
    open: function () { toggle(true); },
    close: function () { toggle(false); },
    // Used by the dashboard's live preview; harmless on customer sites.
    update: function (patch) { cfg = Object.assign({}, cfg || {}, patch); paint(); },
    reset: function () { history = []; saveHistory(); renderMsgs(); },
  };

  fetch(base + '/api/widget/' + encodeURIComponent(botId) + '/config')
    .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(function (c) {
      cfg = c;
      (document.body || document.documentElement).appendChild(host);
      build(); paint();
      if (/[?&]embed=1/.test(location.search)) toggle(true);
    })
    .catch(function (e) { console.warn('[SiteMate] Chatbot unavailable:', e.message); });
})();
