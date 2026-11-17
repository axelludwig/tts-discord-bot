// Runs in the Teams page itself (world: MAIN, document_start), before Teams captures the mic.
// getUserMedia is wrapped so that the audio track Teams receives is a WebAudio mix of
// the real microphone + the TTS bus. The TTS audio arrives from content.js via postMessage.
(() => {
  if (window.__ttsTeamsInstalled) return;
  window.__ttsTeamsInstalled = true;

  const TAG = '__ttsTeams';
  const LOG = '[tts-teams]';
  if (!window.MediaDevices || !MediaDevices.prototype.getUserMedia) return;

  const settings = { enabled: true, monitor: true, duck: false, volume: 1 };
  let ctx = null;
  let ttsBus = null;      // every TTS source goes through here
  let monitorGain = null; // ttsBus -> local speakers ("m'entendre")
  const mixes = new Set();
  let queue = [];
  let current = null;

  function ensureCtx() {
    if (ctx) return;
    ctx = new AudioContext({ sampleRate: 48000, latencyHint: 'interactive' });
    ttsBus = ctx.createGain();
    ttsBus.gain.value = settings.volume;
    monitorGain = ctx.createGain();
    monitorGain.gain.value = settings.monitor ? 1 : 0;
    ttsBus.connect(monitorGain).connect(ctx.destination);
    ctx.addEventListener('statechange', report);
  }

  // Autoplay policy: an AudioContext may start suspended until the user interacts with the page.
  // While suspended, the mixed track is silent, real voice included, hence the eager resume.
  function resume() {
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
  }
  for (const ev of ['pointerdown', 'keydown']) window.addEventListener(ev, resume, true);

  function setDuck(on) {
    const target = on && settings.duck ? 0 : 1;
    for (const m of mixes) m.micGain.gain.setTargetAtTime(target, ctx.currentTime, 0.02);
  }

  function wrapStream(stream, realTrack) {
    ensureCtx();
    resume();

    const src = ctx.createMediaStreamSource(new MediaStream([realTrack]));
    const micGain = ctx.createGain();
    micGain.gain.value = current && settings.duck ? 0 : 1;
    const dest = ctx.createMediaStreamDestination();
    dest.channelCount = 1;
    src.connect(micGain).connect(dest);
    ttsBus.connect(dest);

    const mix = { micGain, tracks: new Set() };
    mixes.add(mix);
    let refs = 0;
    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      mixes.delete(mix);
      try { src.disconnect(); } catch {}
      try { micGain.disconnect(); } catch {}
      try { ttsBus.disconnect(dest); } catch {}
      realTrack.stop();
      report();
    };

    // The real mic is released only once the mixed track and all its clones are stopped.
    const decorate = track => {
      refs++;
      mix.tracks.add(track);
      const nativeStop = track.stop.bind(track);
      const nativeClone = track.clone.bind(track);
      let stopped = false;
      track.stop = () => {
        nativeStop();
        if (stopped) return;
        stopped = true;
        mix.tracks.delete(track);
        if (--refs === 0) cleanup();
      };
      track.clone = () => decorate(nativeClone());
      // Teams reads these to know which device it is using: answer with the real mic's.
      for (const k of ['getSettings', 'getCapabilities', 'getConstraints']) {
        if (typeof realTrack[k] === 'function') track[k] = () => realTrack[k]();
      }
      track.applyConstraints = c => realTrack.applyConstraints(c);
      Object.defineProperty(track, 'label', { configurable: true, get: () => realTrack.label });
      return track;
    };

    const mixed = decorate(dest.stream.getAudioTracks()[0]);
    realTrack.addEventListener('ended', () => {
      // Device unplugged: propagate to Teams so it re-captures.
      for (const t of [...mix.tracks]) { t.stop(); t.dispatchEvent(new Event('ended')); }
      cleanup();
    });

    stream.removeTrack(realTrack);
    stream.addTrack(mixed);
    console.info(LOG, 'micro mixé :', realTrack.label);
    report();
    return stream;
  }

  const nativeGUM = MediaDevices.prototype.getUserMedia;
  MediaDevices.prototype.getUserMedia = async function (constraints) {
    const stream = await nativeGUM.call(this, constraints);
    if (!settings.enabled) return stream;
    const [audio] = stream.getAudioTracks();
    if (!audio) return stream;
    try {
      return wrapStream(stream, audio);
    } catch (err) {
      console.warn(LOG, 'mixage impossible, micro brut utilisé', err);
      return stream;
    }
  };

  // --- TTS queue ------------------------------------------------------------

  async function playNext() {
    if (current) return;
    const item = queue.shift();
    if (!item) { setDuck(false); report(); return; }
    ensureCtx();
    resume();
    // Claim the slot before the async decode so a second playNext() can't start in parallel.
    const entry = { id: item.id, text: item.text, source: null, skipped: false };
    current = entry;
    report();
    let buffer;
    try {
      buffer = await ctx.decodeAudioData(item.data);
    } catch (err) {
      console.warn(LOG, 'audio illisible', err);
    }
    if (!buffer || entry.skipped) {
      current = null;
      playNext();
      return;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ttsBus);
    entry.source = source;
    source.onended = () => {
      try { source.disconnect(); } catch {}
      current = null;
      if (!queue.length) setDuck(false);
      playNext();
    };
    setDuck(true);
    source.start();
    report();
  }

  function stopCurrent() {
    if (!current) return;
    if (current.source) { try { current.source.stop(); } catch {} }
    else current.skipped = true;
  }

  // --- Bridge with content.js -------------------------------------------------

  function report() {
    const tracks = [...mixes].flatMap(m => [...m.tracks]);
    window.postMessage({
      [TAG]: 'to-ext',
      type: 'state',
      state: {
        mics: mixes.size,
        muted: tracks.length > 0 && tracks.every(t => !t.enabled),
        ctxState: ctx ? ctx.state : 'none',
        current: current ? { id: current.id, text: current.text } : null,
        pending: queue.map(({ id, text }) => ({ id, text })),
      },
    }, location.origin);
  }
  // Mute state has no event: poll while a call is captured.
  setInterval(() => { if (mixes.size) report(); }, 2000);

  window.addEventListener('message', e => {
    if (e.source !== window || !e.data || e.data[TAG] !== 'to-page') return;
    const msg = e.data;
    switch (msg.type) {
      case 'ping': report(); break;
      case 'settings':
        Object.assign(settings, msg.settings);
        if (ctx) {
          ttsBus.gain.value = settings.volume;
          monitorGain.gain.value = settings.monitor ? 1 : 0;
          setDuck(!!current);
        }
        report();
        break;
      case 'enqueue':
        queue.push({ id: msg.id, text: msg.text, data: msg.data });
        playNext();
        report();
        break;
      case 'skip': stopCurrent(); break;
      case 'stop': queue = []; stopCurrent(); report(); break;
      case 'remove': queue = queue.filter(q => q.id !== msg.id); report(); break;
    }
  });
})();
