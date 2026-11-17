// Talks to the tts-bot API. Requests leave from the extension (host_permissions), so neither
// Teams' CSP nor CORS get in the way; the audio is handed to content.js as base64.

const DEFAULTS = { server: 'https://tts.linkenparis.com', token: '' };
const TEAMS_URL = /^https:\/\/(teams\.microsoft\.com|teams\.cloud\.microsoft|teams\.live\.com)\//;

async function getConfig() {
  return { ...DEFAULTS, ...(await chrome.storage.local.get(['server', 'token'])) };
}

async function api(path, init = {}) {
  const { server, token } = await getConfig();
  if (!token) throw new Error('Token non configuré (options de l’extension)');
  const res = await fetch(`${server.replace(/\/+$/, '')}/ext${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try { message = (await res.json()).error || message; } catch {}
    if (res.status === 401) message = 'Token refusé par le serveur';
    throw new Error(message);
  }
  return res;
}

function toBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    switch (msg?.type) {
      case 'voices': return (await api('/voices')).json();
      case 'presets': return (await api('/presets')).json();
      case 'render': {
        const res = await api('/render', { method: 'POST', body: JSON.stringify(msg.payload) });
        return { b64: toBase64(new Uint8Array(await res.arrayBuffer())) };
      }
      case 'hasToken': return !!(await getConfig()).token;
      case 'openOptions': chrome.runtime.openOptionsPage(); return true;
      default: throw new Error(`Message inconnu : ${msg?.type}`);
    }
  })().then(
    data => sendResponse({ ok: true, data }),
    err => sendResponse({ ok: false, error: String(err?.message || err) }),
  );
  return true; // async response
});

function sendToTab(tab, message) {
  if (tab?.id && TEAMS_URL.test(tab.url || '')) {
    chrome.tabs.sendMessage(tab.id, message).catch(() => {});
    return true;
  }
  return false;
}

chrome.action.onClicked.addListener(tab => {
  if (!sendToTab(tab, { type: 'toggle' })) chrome.runtime.openOptionsPage();
});

chrome.commands.onCommand.addListener((command, tab) => {
  if (command === 'focus-panel') sendToTab(tab, { type: 'focus' });
});
