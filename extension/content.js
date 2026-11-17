// Floating panel inside Teams (isolated world, top frame only).
// Text -> background.js (renders on the tts-bot) -> audio -> inject.js (mixes it into the mic).
(() => {
  if (window.top !== window || document.getElementById('tts-teams-host')) return;

  const TAG = '__ttsTeams';
  const PREFS_KEY = 'panelPrefs';
  const DEFAULT_PREFS = {
    voiceId: '', pitch: 0, tempo: 1, volume: 1,
    monitor: true, duck: false, enabled: true,
    hidden: false, collapsed: false, showPresets: false, pos: null,
  };

  let prefs = { ...DEFAULT_PREFS };
  let pageState = null; // null = inject.js did not answer
  let voices = [];
  let presetGroups = [];
  let hasToken = true;
  let error = '';
  let rendering = 0;
  let seq = 0;
  let renderChain = Promise.resolve();

  // --- helpers ----------------------------------------------------------------

  function h(tag, props = {}, ...children) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') n.className = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else if (k in n) n[k] = v;
      else n.setAttribute(k, v);
    }
    for (const c of children.flat()) if (c != null && c !== false) n.append(c instanceof Node ? c : String(c));
    return n;
  }

  const bg = (type, extra = {}) => new Promise(resolve => {
    try {
      chrome.runtime.sendMessage({ type, ...extra }, res => {
        if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
        else resolve(res || { ok: false, error: 'pas de réponse' });
      });
    } catch (err) {
      // Extension reloaded while the tab stayed open.
      resolve({ ok: false, error: 'Extension rechargée : recharge l’onglet Teams' });
    }
  });

  const toPage = (msg, transfer = []) => window.postMessage({ [TAG]: 'to-page', ...msg }, location.origin, transfer);

  function savePrefs() {
    chrome.storage.local.set({ [PREFS_KEY]: prefs }).catch(() => {});
  }

  function pushSettings() {
    toPage({ type: 'settings', settings: { enabled: prefs.enabled, monitor: prefs.monitor, duck: prefs.duck, volume: prefs.volume } });
  }

  function b64ToBuffer(b64) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
  }

  // --- speech -------------------------------------------------------------------

  function speak(text, overrides = {}) {
    text = text.trim();
    if (!text) return;
    const payload = {
      text,
      voiceId: overrides.voiceId || prefs.voiceId || voices[0]?.id,
      pitch: overrides.pitch ?? prefs.pitch,
      tempo: overrides.tempo ?? prefs.tempo,
    };
    rendering++;
    render();
    // Renders are chained so messages play in the order they were sent.
    renderChain = renderChain.then(async () => {
      const res = await bg('render', { payload });
      rendering--;
      if (!res.ok) { error = res.error; render(); return; }
      error = '';
      const data = b64ToBuffer(res.data.b64);
      toPage({ type: 'enqueue', id: `${Date.now()}-${++seq}`, text, data }, [data]);
      render();
    });
  }

  // --- UI -------------------------------------------------------------------------

  const host = h('div', { id: 'tts-teams-host' });
  const root = host.attachShadow({ mode: 'open' });
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(`
    :host { all: initial; }
    .panel {
      --bg: #ffffff; --fg: #1f1f1f; --muted: #616161; --line: #d1d1d1; --soft: #f3f3f3;
      --accent: #5b5fc7; --accent-fg: #fff; --ok: #107c10; --warn: #b75c00; --err: #c4314b;
      position: fixed; z-index: 2147483647; width: 320px; max-height: 80vh;
      display: flex; flex-direction: column;
      background: var(--bg); color: var(--fg); border: 1px solid var(--line); border-radius: 8px;
      box-shadow: 0 8px 24px rgba(0,0,0,.25); font: 13px/1.35 "Segoe UI", system-ui, sans-serif;
    }
    @media (prefers-color-scheme: dark) {
      .panel { --bg: #292929; --fg: #f0f0f0; --muted: #adadad; --line: #474747; --soft: #333;
               --accent: #7f85f5; --ok: #54b054; --warn: #f2a33a; --err: #f1707b; }
    }
    .head { display: flex; align-items: center; gap: 6px; padding: 7px 8px 7px 10px; cursor: move;
            user-select: none; border-bottom: 1px solid var(--line); }
    .head b { flex: 1; font-size: 13px; }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--muted); flex: none; }
    .dot.ok { background: var(--ok); } .dot.warn { background: var(--warn); } .dot.err { background: var(--err); }
    .icon { border: 0; background: none; color: var(--muted); cursor: pointer; font: inherit; padding: 2px 6px; border-radius: 4px; }
    .icon:hover { background: var(--soft); color: var(--fg); }
    .body { padding: 8px 10px 10px; overflow: auto; display: flex; flex-direction: column; gap: 8px; }
    .status { font-size: 12px; color: var(--muted); }
    .status.ok { color: var(--ok); } .status.warn { color: var(--warn); } .status.err { color: var(--err); }
    textarea { box-sizing: border-box; width: 100%; min-height: 56px; resize: vertical; padding: 6px 8px;
               font: inherit; color: var(--fg); background: var(--bg); border: 1px solid var(--line); border-radius: 4px; }
    textarea:focus, select:focus, input:focus { outline: 2px solid var(--accent); outline-offset: -1px; }
    .row { display: flex; gap: 6px; align-items: center; }
    .grow { flex: 1; min-width: 0; }
    select, input[type=number] { font: inherit; color: var(--fg); background: var(--bg); border: 1px solid var(--line);
                                 border-radius: 4px; padding: 3px 4px; }
    select { width: 100%; }
    input[type=number] { width: 56px; }
    label.small { font-size: 12px; color: var(--muted); display: flex; align-items: center; gap: 4px; }
    .btn { font: inherit; border: 1px solid var(--line); background: var(--soft); color: var(--fg);
           border-radius: 4px; padding: 4px 10px; cursor: pointer; }
    .btn.primary { background: var(--accent); border-color: var(--accent); color: var(--accent-fg); }
    .btn:disabled { opacity: .5; cursor: default; }
    .queue:empty { display: none; }
    .queue { display: flex; flex-direction: column; gap: 3px; font-size: 12px; }
    .qitem { display: flex; gap: 6px; align-items: center; padding: 3px 6px; background: var(--soft); border-radius: 4px; }
    .qitem span { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .qitem.playing { border-left: 3px solid var(--accent); }
    .presets { display: flex; flex-wrap: wrap; gap: 4px; }
    .presets .btn { padding: 2px 8px; font-size: 12px; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .group { font-size: 11px; color: var(--muted); width: 100%; margin-top: 2px; }
    .opts { display: flex; flex-direction: column; gap: 3px; }
    .link { color: var(--accent); cursor: pointer; text-decoration: underline; background: none; border: 0; font: inherit; padding: 0; }
    .pill { position: fixed; z-index: 2147483647; right: 16px; bottom: 16px; }
    .pill button { display: flex; align-items: center; gap: 6px; font: 600 12px "Segoe UI", system-ui, sans-serif;
                   background: #5b5fc7; color: #fff; border: 0; border-radius: 16px; padding: 6px 12px; cursor: pointer;
                   box-shadow: 0 4px 12px rgba(0,0,0,.25); }
  `);
  root.adoptedStyleSheets = [sheet];

  // The skeleton is built once; render() only updates the dynamic parts, so the textarea
  // keeps its focus and content while state updates come in.
  const stop = e => e.stopPropagation(); // keep Teams' shortcuts out of the way while typing

  const textarea = h('textarea', {
    placeholder: 'Texte à dire dans l’appel… (Entrée = envoyer, Maj+Entrée = retour à la ligne)',
    maxLength: 500,
    onkeydown: e => {
      stop(e);
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        speak(textarea.value);
        textarea.value = '';
      } else if (e.key === 'Escape') {
        textarea.blur();
      }
    },
    onkeyup: stop,
    onkeypress: stop,
  });

  const voiceSelect = h('select', {
    class: 'grow', title: 'Voix',
    onchange: () => { prefs.voiceId = voiceSelect.value; savePrefs(); },
  });

  const num = (key, min, max, step, title) => {
    const input = h('input', {
      type: 'number', min, max, step, title,
      onchange: () => {
        const v = Math.min(max, Math.max(min, parseFloat(input.value) || 0));
        prefs[key] = v; input.value = v; savePrefs();
      },
      onkeydown: stop, onkeyup: stop, onkeypress: stop,
    });
    return input;
  };
  const pitchInput = num('pitch', -24, 24, 1, 'Hauteur (demi-tons)');
  const tempoInput = num('tempo', 0.5, 2, 0.1, 'Vitesse');

  const checks = {};
  const check = (key, label, title) => {
    checks[key] = h('input', {
      type: 'checkbox',
      onchange: e => { prefs[key] = e.target.checked; savePrefs(); pushSettings(); render(); },
    });
    return h('label', { class: 'small', title }, checks[key], label);
  };

  const headDot = h('span', { class: 'dot' });
  const statusEl = h('div', { class: 'status' });
  const queueEl = h('div', { class: 'queue' });
  const presetsEl = h('div', { class: 'presets' });
  const stopBtn = h('button', { class: 'btn', onclick: () => toPage({ type: 'stop' }) }, 'Tout arrêter');
  const presetToggle = h('button', {
    class: 'link', onclick: () => { prefs.showPresets = !prefs.showPresets; savePrefs(); render(); },
  });
  const pillDot = h('span', { class: 'dot' });

  const panel = h('div', { class: 'panel' },
    h('div', { class: 'head', onpointerdown: e => startDrag(e) },
      headDot, h('b', {}, 'TTS → micro Teams'),
      h('button', { class: 'icon', title: 'Réduire', onclick: () => { prefs.collapsed = true; savePrefs(); render(); } }, '—')),
    h('div', { class: 'body' },
      statusEl,
      h('div', { class: 'row' }, voiceSelect,
        h('label', { class: 'small', title: 'Hauteur (demi-tons)' }, '♪', pitchInput),
        h('label', { class: 'small', title: 'Vitesse' }, '×', tempoInput)),
      textarea,
      h('div', { class: 'row' },
        h('button', { class: 'btn primary', onclick: () => { speak(textarea.value); textarea.value = ''; textarea.focus(); } }, 'Dire'),
        stopBtn,
        h('span', { class: 'grow' }),
        presetToggle),
      queueEl,
      presetsEl,
      h('div', { class: 'opts' },
        check('monitor', 'M’entendre (TTS joué aussi dans mes haut-parleurs)'),
        check('duck', 'Couper mon micro pendant le TTS'),
        check('enabled', 'Mixer dans le micro (prend effet au prochain accès micro)',
          'Si décoché, Teams reçoit le micro brut au prochain accès au micro')),
    ),
  );
  const pill = h('div', { class: 'pill' },
    h('button', { onclick: () => { prefs.collapsed = false; savePrefs(); render(); textarea.focus(); } }, pillDot, 'TTS'));
  root.append(panel, pill);

  function placePanel() {
    const p = prefs.pos;
    if (p) {
      const x = Math.min(Math.max(0, p.x), window.innerWidth - 120);
      const y = Math.min(Math.max(0, p.y), window.innerHeight - 40);
      Object.assign(panel.style, { left: `${x}px`, top: `${y}px`, right: 'auto', bottom: 'auto' });
    } else {
      Object.assign(panel.style, { right: '16px', bottom: '16px', left: 'auto', top: 'auto' });
    }
  }

  function startDrag(e) {
    if (e.target.closest('button')) return;
    const rect = panel.getBoundingClientRect();
    const dx = e.clientX - rect.left;
    const dy = e.clientY - rect.top;
    const move = ev => { prefs.pos = { x: ev.clientX - dx, y: ev.clientY - dy }; placePanel(); };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); savePrefs(); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  function statusInfo() {
    if (!hasToken) return ['err', 'Token non configuré.'];
    if (error) return ['err', `Erreur : ${error}`];
    if (!pageState) return ['err', 'Script micro non chargé : recharge l’onglet Teams.'];
    if (!prefs.enabled) return ['warn', 'Mixage désactivé : le TTS n’est entendu que par toi.'];
    if (pageState.ctxState === 'suspended') return ['warn', 'Audio en pause : clique n’importe où dans Teams.'];
    if (!pageState.mics) return ['warn', 'Aucun micro capturé : rejoins un appel (ou rechange de micro dans Teams).'];
    if (pageState.muted) return ['warn', 'Tu es en sourdine dans Teams : le TTS ne passe pas.'];
    return ['ok', `Mixé dans le micro Teams${pageState.mics > 1 ? ` (${pageState.mics} flux)` : ''}.`];
  }

  function render() {
    placePanel();
    pill.style.display = !prefs.hidden && prefs.collapsed ? '' : 'none';
    panel.style.display = prefs.hidden || prefs.collapsed ? 'none' : '';

    const [level, text] = statusInfo();
    headDot.className = pillDot.className = `dot ${level}`;
    statusEl.className = `status ${level}`;
    statusEl.replaceChildren(text, ' ',
      ...(hasToken ? [] : [h('button', { class: 'link', onclick: () => bg('openOptions') }, 'Configurer')]));

    if (voiceSelect.options.length !== voices.length) {
      voiceSelect.replaceChildren(...voices.map(v => h('option', { value: v.id }, v.id.replace(/^fr_FR-/, ''))));
    }
    if (voices.length) voiceSelect.value = voices.some(v => v.id === prefs.voiceId) ? prefs.voiceId : voices[0].id;
    const active = root.activeElement;
    if (active !== pitchInput) pitchInput.value = prefs.pitch;
    if (active !== tempoInput) tempoInput.value = prefs.tempo;
    for (const [key, box] of Object.entries(checks)) box.checked = !!prefs[key];

    const st = pageState || { current: null, pending: [] };
    stopBtn.disabled = !st.current && !st.pending.length;
    queueEl.replaceChildren(...[
      st.current && h('div', { class: 'qitem playing' }, h('span', { title: st.current.text }, `▶ ${st.current.text}`),
        h('button', { class: 'icon', title: 'Passer', onclick: () => toPage({ type: 'skip' }) }, '⏭')),
      ...st.pending.map(item => h('div', { class: 'qitem' }, h('span', { title: item.text }, item.text),
        h('button', { class: 'icon', title: 'Retirer', onclick: () => toPage({ type: 'remove', id: item.id }) }, '✕'))),
      rendering > 0 && h('div', { class: 'qitem' }, h('span', {}, `Synthèse… (${rendering})`)),
    ].filter(Boolean));

    presetToggle.style.display = presetGroups.length ? '' : 'none';
    presetToggle.textContent = prefs.showPresets ? 'Masquer les presets' : 'Presets';
    presetsEl.style.display = prefs.showPresets ? '' : 'none';
    presetsEl.replaceChildren(...presetGroups.flatMap(g => [
      presetGroups.length > 1 && h('div', { class: 'group' }, g.guildName),
      ...g.presets.map(p => h('button', {
        class: 'btn', title: p.text,
        onclick: () => speak(p.text, { voiceId: p.voiceId, pitch: p.pitch, tempo: p.tempo }),
      }, p.label)),
    ]).filter(Boolean));
  }

  // --- wiring ---------------------------------------------------------------------

  window.addEventListener('message', e => {
    if (e.source !== window || !e.data || e.data[TAG] !== 'to-ext') return;
    if (e.data.type === 'state') {
      const first = !pageState;
      pageState = e.data.state;
      if (first) pushSettings();
      render();
    }
  });

  chrome.runtime.onMessage.addListener(msg => {
    if (msg?.type === 'toggle') {
      prefs.hidden = !prefs.hidden;
      prefs.collapsed = false;
    } else if (msg?.type === 'focus') {
      prefs.hidden = false;
      prefs.collapsed = false;
    } else return;
    savePrefs();
    render();
    if (!prefs.hidden) textarea.focus();
  });

  window.addEventListener('resize', placePanel);

  async function loadRemote() {
    const tok = await bg('hasToken');
    hasToken = tok.ok && tok.data;
    if (!hasToken) { render(); return; }
    const [v, p] = await Promise.all([bg('voices'), bg('presets')]);
    if (v.ok) { voices = v.data; error = ''; } else error = v.error;
    if (p.ok) presetGroups = p.data;
    render();
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && (changes.token || changes.server)) loadRemote();
  });

  chrome.storage.local.get(PREFS_KEY).then(stored => {
    prefs = { ...DEFAULT_PREFS, ...(stored[PREFS_KEY] || {}) };
    document.documentElement.append(host);
    render();
    pushSettings();
    toPage({ type: 'ping' });
    loadRemote();
  });
})();
