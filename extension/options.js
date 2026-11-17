const DEFAULT_SERVER = 'https://tts.linkenparis.com';
const $ = id => document.getElementById(id);

function setStatus(text, cls) {
  $('status').textContent = text;
  $('status').className = cls || '';
}

chrome.storage.local.get(['server', 'token']).then(({ server, token }) => {
  $('server').value = server || DEFAULT_SERVER;
  $('token').value = token || '';
});

$('save').addEventListener('click', async () => {
  let server = $('server').value.trim().replace(/\/+$/, '') || DEFAULT_SERVER;
  const token = $('token').value.trim();
  let origin;
  try { origin = new URL(server).origin; } catch { return setStatus('URL de serveur invalide', 'err'); }

  // Any server other than the default needs an extra host permission (asked once).
  if (origin !== DEFAULT_SERVER) {
    const granted = await chrome.permissions.request({ origins: [`${origin}/*`] });
    if (!granted) return setStatus(`Permission refusée pour ${origin}`, 'err');
  }

  await chrome.storage.local.set({ server, token });
  setStatus('Test…');
  const res = await chrome.runtime.sendMessage({ type: 'voices' });
  if (res?.ok) setStatus(`OK : ${res.data.length} voix disponibles. Recharge l’onglet Teams.`, 'ok');
  else setStatus(`Échec : ${res?.error || 'pas de réponse'}`, 'err');
});
