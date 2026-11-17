import { useState, useEffect, useCallback, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import './App.css';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChannelMember {
  id: string;
  displayName: string;
  avatarUrl: string;
}

interface Channel {
  id: string;
  name: string;
  members: ChannelMember[];
}

interface Message {
  id: string;
  author: string;
  content: string;
  time: string;
  color: string;
}

interface QueueItem {
  id: string;
  text: string;
  voiceId: string;
  author?: string;
}

interface QueueState {
  current: QueueItem | null;
  pending: QueueItem[];
}

const EMPTY_QUEUE: QueueState = { current: null, pending: [] };

interface Preset {
  id: string;
  label: string;
  text: string;
  /** Unset: the voice/pitch/tempo currently selected in the dashboard are used. */
  voiceId?: string;
  pitch?: number;
  tempo?: number;
}

interface Voice {
  id: string;
  language: string;
}

interface GuildRealtimeState {
  guildId: string;
  connected: boolean;
  channelId?: string;
  playing: boolean;
  queue: QueueState;
  channels: Channel[];
  presets?: Preset[];
}

// ---------------------------------------------------------------------------
// Colors
// ---------------------------------------------------------------------------

const COLORS = ['#5865f2', '#eb459e', '#57f287', '#fee75c', '#ed4245', '#3ba55c', '#faa61a'];
function seedColor(name: string) {
  let n = 0;
  for (let i = 0; i < name.length; i++) n += name.charCodeAt(i);
  return COLORS[n % COLORS.length];
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function useLocalStorage(key: string, defaultValue: string) {
  const [value, setValue] = useState(() => localStorage.getItem(key) ?? defaultValue);
  const set = useCallback(
    (v: string) => {
      setValue(v);
      localStorage.setItem(key, v);
    },
    [key],
  );
  return [value, set] as const;
}

/** useState persisted as JSON in localStorage (falls back to in-memory if storage is unavailable). */
function usePersistentState<T>(key: string, defaultValue: T, isValid: (v: unknown) => v is T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw !== null) {
        const parsed: unknown = JSON.parse(raw);
        if (isValid(parsed)) return parsed;
      }
    } catch {
      /* ignore */
    }
    return defaultValue;
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* ignore */
    }
  }, [key, value]);
  return [value, setValue] as const;
}

const isString = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const inRange = (min: number, max: number) => (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const isPitch = inRange(-24, 24);
const isTempo = inRange(0.5, 2);

async function callApi(
  method: string,
  path: string,
  body: unknown,
  token: string,
  noAuth = false,
): Promise<{ data: unknown; ok: boolean }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (!noAuth && token) headers['Authorization'] = `Bearer ${token}`;
  const r = await fetch(path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => null);
  return { data, ok: r.ok };
}

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

/** Below this width the dashboard switches to a single column with tabs (e.g. a 200px-wide window). */
const COMPACT_QUERY = '(max-width: 760px)';


// ---------------------------------------------------------------------------
// Chat area
// ---------------------------------------------------------------------------

function MiniAvatar({ name, color }: { name: string; color: string }) {
  const initial = name.replace(/[^a-zA-Z]/g, '')[0]?.toUpperCase() ?? '?';
  return (
    <div className="chat-avatar" style={{ background: color }}>
      {initial}
    </div>
  );
}

const TTS_BOT_NAME = 'tts-bot';
const TTS_BOT_COLOR = seedColor(TTS_BOT_NAME);

function QueuePanel({
  queue,
  guildId,
  token,
  showEmpty = false,
}: {
  queue: QueueState;
  guildId: string;
  token: string;
  showEmpty?: boolean;
}) {
  if (!queue.current && queue.pending.length === 0) {
    return showEmpty ? <p className="hint">La file d'attente est vide.</p> : null;
  }
  const removeItem = (id: string) => callApi('DELETE', `/queue/${guildId}/${id}`, undefined, token);

  return (
    <div className="queue-panel">
      <div className="queue-header">
        <span className="queue-title">File d'attente</span>
        <span className="queue-count">{queue.pending.length} en attente</span>
        <button className="queue-btn" onClick={() => callApi('POST', '/skip', { guildId }, token)} disabled={!queue.current}>
          ⏭ Passer
        </button>
        <button className="queue-btn danger" onClick={() => callApi('POST', '/stop', { guildId }, token)}>
          ⏹ Tout arrêter
        </button>
      </div>
      <ol className="queue-list">
        {queue.current && (
          <li className="queue-item current">
            <span className="queue-badge">▶</span>
            {queue.current.author && <span className="queue-author">{queue.current.author}</span>}
            <span className="queue-text">{queue.current.text}</span>
            <span className="queue-voice">{queue.current.voiceId}</span>
          </li>
        )}
        {queue.pending.map((item, i) => (
          <li key={item.id} className="queue-item">
            <span className="queue-badge">{i + 1}</span>
            {item.author && <span className="queue-author">{item.author}</span>}
            <span className="queue-text">{item.text}</span>
            <span className="queue-voice">{item.voiceId}</span>
            <button className="queue-remove" title="Retirer" onClick={() => removeItem(item.id)}>✕</button>
          </li>
        ))}
      </ol>
    </div>
  );
}

function VoiceControls({
  voices,
  selectedVoice,
  setSelectedVoice,
  pitch,
  setPitch,
  tempo,
  setTempo,
  disabled,
}: {
  voices: Voice[];
  selectedVoice: string;
  setSelectedVoice: (v: string) => void;
  pitch: number;
  setPitch: (v: number) => void;
  tempo: number;
  setTempo: (v: number) => void;
  disabled: boolean;
}) {
  return (
    <>
      <div className="chat-identity-bar">
        <div className="chat-identity-avatar" style={{ background: TTS_BOT_COLOR }}>T</div>
        <span className="chat-identity-name" style={{ color: TTS_BOT_COLOR }}>{TTS_BOT_NAME}</span>
        <span className="chat-identity-badge">BOT TTS</span>
        {voices.length > 0 && (
          <select
            className="chat-voice-select"
            value={selectedVoice}
            onChange={(e) => setSelectedVoice(e.target.value)}
          >
            {voices.map((v) => (
              <option key={v.id} value={v.id}>{v.id}</option>
            ))}
          </select>
        )}
      </div>
      <div className="chat-tts-controls">
        <label className="chat-tts-control">
          <span>Pitch</span>
          <input
            type="range"
            min={-24}
            max={24}
            step={1}
            value={pitch}
            onChange={(e) => setPitch(Number(e.target.value))}
            disabled={disabled}
          />
          <strong>{pitch}</strong>
        </label>
        <label className="chat-tts-control">
          <span>Vitesse</span>
          <input
            type="range"
            min={0.5}
            max={2}
            step={0.05}
            value={tempo}
            onChange={(e) => setTempo(Number(e.target.value))}
            disabled={disabled}
          />
          <strong>{tempo.toFixed(2)}x</strong>
        </label>
      </div>
    </>
  );
}

function ChatArea({
  channelName,
  messages,
  draft,
  setDraft,
  canType,
  sending,
  sendError,
  onSend,
  compact,
  active,
  controls,
}: {
  channelName: string | null;
  messages: Message[];
  draft: string;
  setDraft: (v: string) => void;
  canType: boolean;
  sending: boolean;
  sendError: string | null;
  onSend: (text: string) => void;
  compact: boolean;
  /** False while another tab is shown (compact mode): the area stays mounted but hidden. */
  active: boolean;
  /** Extra controls above the input (queue, voice settings) in the wide layout. */
  controls?: React.ReactNode;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // The input is disabled while sending, which drops focus: give it back once done,
  // and also when coming back to this tab.
  useEffect(() => {
    if (!sending && active) inputRef.current?.focus();
  }, [sending, active]);

  useEffect(() => {
    if (active) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, active]);

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    onSend(text);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const placeholder = channelName
    ? compact ? `Parler dans #${channelName}…` : `Parler en tant que tts-bot dans #${channelName}…`
    : compact ? 'Rejoins un salon (onglet 🔊)' : 'Rejoins un salon vocal pour parler…';

  return (
    <div className="chat-area">
      {!compact && (
        <div className="chat-header">
          <span className="chat-header-icon">🔊</span>
          <span className="chat-header-name">{channelName ?? 'Aucun salon'}</span>
        </div>
      )}

      <div className="chat-messages">
        {messages.length === 0 && (
          <p className="chat-empty">Les messages envoyés pendant cette session apparaîtront ici.</p>
        )}
        {messages.map((msg, i) => {
          const showHeader = i === 0 || messages[i - 1].author !== msg.author;
          return (
            <div key={msg.id} className={`chat-msg${showHeader ? ' with-header' : ' continued'}`}>
              {showHeader ? (
                <MiniAvatar name={msg.author} color={msg.color} />
              ) : (
                <div className="chat-avatar-spacer" />
              )}
              <div className="chat-msg-body">
                {showHeader && (
                  <div className="chat-msg-meta">
                    <span className="chat-msg-author" style={{ color: msg.color }}>{msg.author}</span>
                    <span className="chat-msg-time">{msg.time}</span>
                  </div>
                )}
                <p className="chat-msg-text">{msg.content}</p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="chat-input-area">
        {controls}
        {sendError && <div className="chat-send-error">{sendError}</div>}
        <div className="chat-input-bar">
          <textarea
            ref={inputRef}
            className="chat-input"
            rows={compact ? 4 : 1}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            disabled={!canType || sending}
          />
          <button
            className="chat-send-btn"
            onClick={send}
            disabled={!draft.trim() || !canType || sending}
          >
            {sending ? '…' : '🔊 Parler'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Quick messages (right panel)
// ---------------------------------------------------------------------------

interface PresetDraft {
  id?: string;
  label: string;
  text: string;
  voiceId: string;
  pitch: number;
  tempo: number;
}

const EMPTY_DRAFT: PresetDraft = { label: '', text: '', voiceId: '', pitch: 0, tempo: 1 };

function errorOf(data: unknown): string {
  return ((data as Record<string, unknown> | null)?.['error'] as string | undefined) ?? 'Erreur inconnue';
}

function PresetForm({
  initial,
  voices,
  onSave,
  onCancel,
}: {
  initial: PresetDraft;
  voices: Voice[];
  onSave: (draft: PresetDraft) => Promise<string | null>;
  onCancel: () => void;
}) {
  const [d, setD] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof PresetDraft>(k: K, v: PresetDraft[K]) => setD((prev) => ({ ...prev, [k]: v }));

  const submit = async () => {
    if (!d.text.trim()) return setError('Le texte est requis');
    setSaving(true);
    const err = await onSave(d);
    setSaving(false);
    setError(err);
  };

  return (
    <form
      className="preset-form"
      onSubmit={(e) => { e.preventDefault(); submit(); }}
      onKeyDown={(e) => { if (e.key === 'Escape') onCancel(); }}
    >
      <input
        className="preset-input"
        placeholder="Libellé du bouton (optionnel)"
        value={d.label}
        maxLength={40}
        onChange={(e) => set('label', e.target.value)}
        autoFocus
      />
      <textarea
        className="preset-input"
        placeholder="Texte à prononcer (Ctrl+Entrée pour valider)"
        rows={3}
        value={d.text}
        onChange={(e) => set('text', e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submit(); } }}
      />
      <select className="preset-input" value={d.voiceId} onChange={(e) => set('voiceId', e.target.value)}>
        <option value="">Voix et réglages du moment</option>
        {voices.map((v) => (
          <option key={v.id} value={v.id}>{v.id}</option>
        ))}
      </select>
      {d.voiceId && (
        <>
          <label className="preset-slider">
            <span>Pitch</span>
            <input type="range" min={-24} max={24} step={1} value={d.pitch} onChange={(e) => set('pitch', Number(e.target.value))} />
            <strong>{d.pitch}</strong>
          </label>
          <label className="preset-slider">
            <span>Vitesse</span>
            <input type="range" min={0.5} max={2} step={0.05} value={d.tempo} onChange={(e) => set('tempo', Number(e.target.value))} />
            <strong>{d.tempo.toFixed(2)}x</strong>
          </label>
        </>
      )}
      {error && <div className="preset-error">{error}</div>}
      <div className="preset-form-actions">
        <button type="button" className="queue-btn" onClick={onCancel}>Annuler</button>
        <button type="submit" className="queue-btn primary" disabled={saving || !d.text.trim()}>
          {d.id ? 'Enregistrer' : 'Ajouter'}
        </button>
      </div>
    </form>
  );
}

function QuickPanel({
  presets,
  setPresets,
  voices,
  guildId,
  token,
  canSend,
  onSend,
  onError,
}: {
  presets: Preset[];
  setPresets: (presets: Preset[]) => void;
  voices: Voice[];
  guildId: string;
  token: string;
  canSend: boolean;
  onSend: (preset: Preset) => void;
  onError: (message: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<PresetDraft | null>(null);
  const base = `/guilds/${guildId}/presets`;
  const ready = !!token && !!guildId;

  const save = async (d: PresetDraft): Promise<string | null> => {
    const body = {
      label: d.label,
      text: d.text,
      ...(d.voiceId ? { voiceId: d.voiceId, pitch: d.pitch, tempo: d.tempo } : {}),
    };
    const res = d.id
      ? await callApi('PUT', `${base}/${d.id}`, body, token)
      : await callApi('POST', base, body, token);
    if (!res.ok) return errorOf(res.data);
    const saved = res.data as Preset;
    setPresets(d.id ? presets.map((p) => (p.id === saved.id ? saved : p)) : [...presets, saved]);
    setForm(null);
    return null;
  };

  const remove = async (p: Preset) => {
    if (!confirm(`Supprimer « ${p.label} » ?`)) return;
    const res = await callApi('DELETE', `${base}/${p.id}`, undefined, token);
    if (!res.ok) return onError(errorOf(res.data));
    setPresets(presets.filter((x) => x.id !== p.id));
    if (form?.id === p.id) setForm(null);
  };

  const move = async (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= presets.length) return;
    const next = [...presets];
    [next[index], next[target]] = [next[target], next[index]];
    setPresets(next);
    const res = await callApi('PUT', `${base}/order`, { ids: next.map((p) => p.id) }, token);
    if (res.ok && Array.isArray(res.data)) setPresets(res.data as Preset[]);
    else onError(errorOf(res.data));
  };

  const edit = (p: Preset) =>
    setForm({ id: p.id, label: p.label, text: p.text, voiceId: p.voiceId ?? '', pitch: p.pitch ?? 0, tempo: p.tempo ?? 1 });

  return (
    <aside className="quick-panel">
      <div className="quick-header">
        <span className="quick-title">Messages rapides</span>
        <button
          className={`quick-icon-btn${editing ? ' active' : ''}`}
          title={editing ? 'Terminer la modification' : 'Modifier les boutons'}
          onClick={() => { setEditing((e) => !e); setForm(null); }}
          disabled={!ready}
        >
          {editing ? '✓' : '✎'}
        </button>
        <button
          className="quick-icon-btn"
          title="Nouveau message"
          onClick={() => setForm({ ...EMPTY_DRAFT })}
          disabled={!ready}
        >
          +
        </button>
      </div>

      <div className="quick-body">
        {form && (
          <PresetForm key={form.id ?? 'new'} initial={form} voices={voices} onSave={save} onCancel={() => setForm(null)} />
        )}

        {ready && presets.length === 0 && !form && (
          <p className="hint">Aucun message enregistré. Clique sur + pour en ajouter un.</p>
        )}

        <ul className="quick-list">
          {presets.map((p, i) => (
            <li key={p.id} className={`quick-item${form?.id === p.id ? ' selected' : ''}`}>
              <button
                className="quick-btn"
                title={editing ? 'Modifier' : p.text}
                onClick={() => (editing ? edit(p) : onSend(p))}
                disabled={!editing && !canSend}
              >
                <span className="quick-btn-label">{p.label}</span>
                {p.voiceId && <span className="quick-btn-voice">{p.voiceId}</span>}
              </button>
              {editing && (
                <div className="quick-item-actions">
                  <button className="quick-icon-btn" title="Monter" onClick={() => move(i, -1)} disabled={i === 0}>▲</button>
                  <button className="quick-icon-btn" title="Descendre" onClick={() => move(i, 1)} disabled={i === presets.length - 1}>▼</button>
                  <button className="quick-icon-btn" title="Modifier" onClick={() => edit(p)}>✎</button>
                  <button className="quick-icon-btn danger" title="Supprimer" onClick={() => remove(p)}>🗑</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Pronunciation (English words, brands, acronyms read the French way)
// ---------------------------------------------------------------------------

interface LexiconEntry {
  word: string;
  say: string;
  caseSensitive?: boolean;
}

interface RecentWord {
  word: string;
  say: string | null;
  source: 'sigle' | 'auto' | null;
  count: number;
}

interface PronunciationData {
  entries: LexiconEntry[];
  defaults: LexiconEntry[];
  recent: RecentWord[];
}

interface Preview {
  text: string;
  phonemes: string | null;
  changes: { from: string; to: string; source: string }[];
  unresolved: string[];
}

const EMPTY_ENTRY: LexiconEntry = { word: '', say: '', caseSensitive: false };

/** Phonemes no French word produces (same list as the backend): the word is still read the English way. */
const ENGLISH_PHONEMES = /[ɪʊθðɹʌɒæɜːɐɚɝᵻɾʔh]|ɑ(?!̃)/;

function PronunciationPanel({
  token,
  canSpeak,
  onSpeak,
  onClose,
}: {
  token: string;
  canSpeak: boolean;
  onSpeak: (text: string) => void;
  onClose?: () => void;
}) {
  const [data, setData] = useState<PronunciationData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testText, setTestText] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [form, setForm] = useState<LexiconEntry>(EMPTY_ENTRY);
  const [check, setCheck] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const formRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!token) return;
    const res = await callApi('GET', '/pronunciation', undefined, token);
    if (res.ok) setData(res.data as PronunciationData);
    else setError(errorOf(res.data));
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const test = async () => {
    if (!testText.trim()) return;
    const res = await callApi('POST', '/pronunciation/preview', { text: testText }, token);
    if (!res.ok) return setError(errorOf(res.data));
    setError(null);
    setPreview(res.data as Preview);
    load(); // the test may have added words to "recent"
  };

  // Phonemes of the spelling being typed, so it can be tuned before saving.
  useEffect(() => {
    const say = form.say.trim();
    if (!say || !token) return setCheck(null);
    const timer = setTimeout(async () => {
      const res = await callApi('POST', '/pronunciation/preview', { text: say, raw: true }, token);
      setCheck(res.ok ? ((res.data as Preview).phonemes ?? null) : null);
    }, 300);
    return () => clearTimeout(timer);
  }, [form.say, token]);

  const edit = (entry: LexiconEntry) => {
    setForm({ ...EMPTY_ENTRY, ...entry });
    formRef.current?.focus();
    formRef.current?.scrollIntoView({ block: 'nearest' });
  };

  const save = async () => {
    const res = await callApi('PUT', '/pronunciation/entries', form, token);
    if (!res.ok) return setError(errorOf(res.data));
    setError(null);
    setForm(EMPTY_ENTRY);
    load();
  };

  const remove = async (entry: LexiconEntry) => {
    if (!confirm(`Supprimer la prononciation de « ${entry.word} » ?`)) return;
    const res = await callApi('DELETE', '/pronunciation/entries', entry, token);
    if (!res.ok) return setError(errorOf(res.data));
    load();
  };

  const match = (e: LexiconEntry) =>
    !filter || `${e.word} ${e.say}`.toLowerCase().includes(filter.toLowerCase());
  const customKeys = new Set(data?.entries.map((e) => e.word.toLowerCase()));

  const entryRow = (e: LexiconEntry, custom: boolean) => (
    <li key={`${custom}-${e.word}-${e.caseSensitive ?? false}`} className="prono-row">
      <span className="prono-word">{e.word}{e.caseSensitive && <em title="Respecte les majuscules"> Aa</em>}</span>
      <span className="prono-arrow">→</span>
      <span className="prono-say">{e.say === e.word ? <em>tel quel</em> : e.say}</span>
      <button className="quick-icon-btn" title="Écouter" disabled={!canSpeak} onClick={() => onSpeak(e.word)}>🔊</button>
      <button className="quick-icon-btn" title={custom ? 'Modifier' : 'Remplacer'} onClick={() => edit(e)}>✎</button>
      {custom && <button className="quick-icon-btn danger" title="Supprimer" onClick={() => remove(e)}>🗑</button>}
    </li>
  );

  if (!token) return <p className="hint">Entrez votre token dans les paramètres.</p>;

  return (
    <div className="prono-panel">
      <div className="quick-header">
        <span className="quick-title">Prononciations</span>
        {onClose && <button className="quick-icon-btn" title="Fermer" onClick={onClose}>✕</button>}
      </div>

      <div className="prono-body">
        <p className="hint prono-intro">
          Les voix sont françaises : les mots anglais, les marques et les sigles sont réécrits à la française avant
          d'être lus. La plupart sont corrigés automatiquement, les règles ci-dessous priment.
        </p>

        {error && <div className="preset-error">{error}</div>}

        {/* Test */}
        <section className="prono-section">
          <h3>Tester</h3>
          <form className="prono-inline" onSubmit={(e) => { e.preventDefault(); test(); }}>
            <input
              className="preset-input"
              placeholder="ex. On se fait un Teams sur Discord ?"
              value={testText}
              onChange={(e) => setTestText(e.target.value)}
            />
            <button type="submit" className="queue-btn primary" disabled={!testText.trim()}>Tester</button>
            <button type="button" className="queue-btn" disabled={!canSpeak || !testText.trim()} onClick={() => onSpeak(testText)} title="Faire lire par le bot">🔊</button>
          </form>
          {preview && (
            <div className="prono-preview">
              <div><span className="prono-label">Lu :</span> {preview.text}</div>
              {preview.phonemes && <div className="prono-phonemes">/{preview.phonemes}/</div>}
              {preview.changes.length > 0 && (
                <ul className="prono-changes">
                  {preview.changes.map((c, i) => (
                    <li key={i}>{c.from} → {c.to} <span className={`prono-tag ${c.source}`}>{c.source}</span></li>
                  ))}
                </ul>
              )}
              {preview.unresolved.map((w) => (
                <div key={w} className="prono-warn">
                  ⚠ « {w} » est encore lu à l'anglaise.{' '}
                  <button className="queue-btn" onClick={() => edit({ word: w, say: '' })}>Corriger</button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Add / edit */}
        <section className="prono-section">
          <h3>{data?.entries.some((e) => e.word.toLowerCase() === form.word.trim().toLowerCase()) ? 'Modifier' : 'Ajouter'}</h3>
          <form className="preset-form" onSubmit={(e) => { e.preventDefault(); save(); }}>
            <div className="prono-inline">
              <input
                ref={formRef}
                className="preset-input"
                placeholder="Mot écrit (ex. Teams)"
                value={form.word}
                maxLength={60}
                onChange={(e) => setForm({ ...form, word: e.target.value })}
              />
              <input
                className="preset-input"
                placeholder="Lu comme (ex. timmze)"
                value={form.say}
                maxLength={120}
                onChange={(e) => setForm({ ...form, say: e.target.value })}
              />
            </div>
            {check && (
              <div className={`prono-phonemes${ENGLISH_PHONEMES.test(check) ? ' bad' : ''}`}>
                /{check}/{ENGLISH_PHONEMES.test(check) && ' : encore des sons anglais, change l\'orthographe'}
              </div>
            )}
            <label className="prono-check">
              <input
                type="checkbox"
                checked={!!form.caseSensitive}
                onChange={(e) => setForm({ ...form, caseSensitive: e.target.checked })}
              />
              Respecter les majuscules (ex. « AI » sans toucher à « ai »)
            </label>
            <p className="hint">
              Écris comme un mot français : « nn »/« mm » évitent les nasales (ouinndoze), « aill » donne « aï » (laillve),
              un « e » final fait sonner la consonne (stimme).
            </p>
            <div className="preset-form-actions">
              <button type="button" className="queue-btn" disabled={!canSpeak || !form.say.trim()} onClick={() => onSpeak(form.say)}>🔊 Écouter</button>
              <button type="button" className="queue-btn" onClick={() => setForm(EMPTY_ENTRY)}>Effacer</button>
              <button type="submit" className="queue-btn primary" disabled={!form.word.trim() || !form.say.trim()}>Enregistrer</button>
            </div>
          </form>
        </section>

        {/* Recent automatic corrections */}
        {!!data?.recent.length && (
          <section className="prono-section">
            <h3>Corrections automatiques récentes</h3>
            <p className="hint">Si l'une sonne mal, corrige-la : la règle remplacera la correction automatique.</p>
            <ul className="prono-list">
              {data.recent.map((r) => (
                <li key={r.word} className="prono-row">
                  <span className="prono-word">{r.word}</span>
                  <span className="prono-arrow">→</span>
                  <span className="prono-say">{r.say ?? <em className="prono-warn">pas de correction</em>}</span>
                  {r.source && <span className={`prono-tag ${r.source}`}>{r.source}</span>}
                  <button className="quick-icon-btn" title="Écouter" disabled={!canSpeak} onClick={() => onSpeak(r.word)}>🔊</button>
                  <button className="quick-icon-btn" title="Corriger" onClick={() => edit({ word: r.word, say: r.say ?? '' })}>✎</button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Rules */}
        <section className="prono-section">
          <h3>Règles ({(data?.entries.length ?? 0)} ajoutées, {(data?.defaults.length ?? 0)} par défaut)</h3>
          <input className="preset-input" placeholder="Filtrer…" value={filter} onChange={(e) => setFilter(e.target.value)} />
          <ul className="prono-list">
            {data?.entries.filter(match).map((e) => entryRow(e, true))}
          </ul>
          {data && data.entries.length === 0 && <p className="hint">Aucune règle ajoutée.</p>}
          <details className="prono-defaults">
            <summary>Règles par défaut</summary>
            <ul className="prono-list">
              {data?.defaults.filter((e) => match(e) && !customKeys.has(e.word.toLowerCase())).map((e) => entryRow(e, false))}
            </ul>
          </details>
        </section>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Icons (inline SVG, Discord-style)
// ---------------------------------------------------------------------------

function IconSpeaker({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M11.383 3.07904C11.009 2.92504 10.579 3.01004 10.293 3.29604L6 8.00204H3C2.45 8.00204 2 8.45204 2 9.00204V15.002C2 15.552 2.45 16.002 3 16.002H6L10.293 20.71C10.579 20.996 11.009 21.082 11.383 20.927C11.757 20.772 12 20.407 12 20.002V4.00204C12 3.59704 11.757 3.23204 11.383 3.07904Z" />
      <path d="M15.5 8.5C15.236 8.237 14.814 8.237 14.55 8.5C14.285 8.764 14.285 9.18 14.55 9.444C15.209 10.099 15.209 13.902 14.55 14.556C14.285 14.82 14.285 15.236 14.55 15.5C14.682 15.633 14.855 15.699 15.027 15.699C15.199 15.699 15.372 15.633 15.5 15.5C16.652 14.347 16.652 9.652 15.5 8.5Z" />
      <path d="M17.7 6.2C17.437 5.935 17.013 5.934 16.749 6.197C16.484 6.46 16.484 6.885 16.747 7.149C18.372 8.775 18.372 15.225 16.747 16.851C16.483 17.115 16.484 17.54 16.749 17.803C16.882 17.934 17.055 18 17.226 18C17.397 18 17.569 17.934 17.7 17.801C19.817 15.685 19.819 8.316 17.7 6.2Z" />
    </svg>
  );
}

function IconSettings({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M19.738 10H22V14H19.738C19.498 14.953 19.1 15.832 18.57 16.608L20 18.034L17.18 20.854L15.752 19.425C14.974 19.954 14.09 20.352 13.135 20.591V22H8.866V20.592C7.908 20.352 7.023 19.951 6.24 19.418L4.818 20.841L2 18.017L3.432 16.585C2.897 15.807 2.496 14.922 2.254 13.96H0V10H2.254C2.496 9.046 2.9 8.163 3.44 7.391L2 5.98L4.818 3.16L6.24 4.587C7.018 4.051 7.904 3.651 8.866 3.414V2H13.135V3.414C14.09 3.651 14.97 4.043 15.74 4.571L17.164 3.158L19.986 5.978L18.563 7.393C19.107 8.169 19.497 9.049 19.738 10ZM12 16C14.2091 16 16 14.2091 16 12C16 9.79086 14.2091 8 12 8C9.79086 8 8 9.79086 8 12C8 14.2091 9.79086 16 12 16Z" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Channel item
// ---------------------------------------------------------------------------

function ChannelItem({
  channel,
  active,
  joining,
  onClick,
}: {
  channel: Channel;
  active: boolean;
  joining: boolean;
  onClick: () => void;
}) {
  return (
    <div className={`channel-row${active ? ' active' : ''}${joining ? ' joining' : ''}`}>
      <button
        className="channel-btn"
        onClick={onClick}
        disabled={joining}
      >
        <span className="channel-icon">
          <IconSpeaker size={18} />
        </span>
        <span className="channel-name">{channel.name}</span>
        {active && <span className="channel-live">LIVE</span>}
      </button>

      {channel.members.length > 0 && (
        <ul className="member-list">
          {channel.members.map((m) => (
            <li key={m.id} className="member-item">
              <img
                className="member-avatar"
                src={m.avatarUrl}
                alt=""
                width={20}
                height={20}
              />
              <span className="member-name">{m.displayName}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sidebar (server, voice channels, settings)
// ---------------------------------------------------------------------------

function Sidebar({
  guildName,
  online,
  token,
  setToken,
  channels,
  activeChannelId,
  joiningChannelId,
  onChannelClick,
  onLeave,
  onOpenPronunciation,
}: {
  guildName: string;
  online: boolean | null;
  token: string;
  setToken: (v: string) => void;
  channels: Channel[];
  activeChannelId: string | null;
  joiningChannelId: string | null;
  onChannelClick: (channel: Channel) => void;
  onLeave: () => void;
  /** Unset in compact mode, where pronunciations have their own tab. */
  onOpenPronunciation?: () => void;
}) {
  const [showSettings, setShowSettings] = useState(!token);
  const activeChannelName = channels.find((c) => c.id === activeChannelId)?.name;

  return (
    <div className="sidebar">
      {/* Server header */}
      <div className="server-header">
        <span className="server-name">{guildName || 'TTS Bot'}</span>
        <StatusDot online={online} />
      </div>

      {/* Channel list */}
      <div className="channel-section">
        <div className="section-label">Salons vocaux</div>

        {!token && (
          <p className="hint">Entrez votre token dans les paramètres pour charger les salons.</p>
        )}
        {token && channels.length === 0 && (
          <p className="hint">Chargement…</p>
        )}

        {channels.map((ch) => (
          <ChannelItem
            key={ch.id}
            channel={ch}
            active={activeChannelId === ch.id}
            joining={joiningChannelId === ch.id}
            onClick={() => onChannelClick(ch)}
          />
        ))}
      </div>

      {/* Footer */}
      <div className="sidebar-footer">
        {activeChannelName && (
          <div className="now-playing">
            <IconSpeaker size={14} />
            <span>{activeChannelName}</span>
            <button className="leave-btn" title="Quitter le salon" onClick={onLeave}>
              ✕
            </button>
          </div>
        )}

        {onOpenPronunciation && (
          <button className="settings-toggle" onClick={onOpenPronunciation} disabled={!token}>
            <span aria-hidden>🗣️</span>
            <span>Prononciations</span>
          </button>
        )}

        <button
          className={`settings-toggle${showSettings ? ' open' : ''}`}
          onClick={() => setShowSettings((s) => !s)}
        >
          <IconSettings size={16} />
          <span>Paramètres</span>
        </button>

        {showSettings && (
          <div className="token-field">
            <label htmlFor="api-token">API Token</label>
            <input
              id="api-token"
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Entrez votre token…"
              autoComplete="off"
            />
          </div>
        )}
      </div>
    </div>
  );
}

function StatusDot({ online }: { online: boolean | null }) {
  return (
    <span
      className={`status-dot${online === true ? ' online' : online === false ? ' offline' : ''}`}
      title={online === true ? 'En ligne' : online === false ? 'Hors ligne' : '…'}
    />
  );
}

// ---------------------------------------------------------------------------
// Compact mode tabs
// ---------------------------------------------------------------------------

type Tab = 'text' | 'quick' | 'channels' | 'voice' | 'queue' | 'prono';

const TABS: { id: Tab; icon: string; label: string }[] = [
  { id: 'text', icon: '💬', label: 'Texte' },
  { id: 'quick', icon: '⚡', label: 'Rapides' },
  { id: 'channels', icon: '🔊', label: 'Salons' },
  { id: 'voice', icon: '🎚️', label: 'Voix' },
  { id: 'queue', icon: '📋', label: 'File' },
  { id: 'prono', icon: '🗣️', label: 'Prononc.' },
];

function TabBar({ tab, setTab, badges }: { tab: Tab; setTab: (t: Tab) => void; badges: Partial<Record<Tab, number>> }) {
  return (
    <nav className="tab-bar" role="tablist">
      {TABS.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={tab === t.id}
          aria-label={t.label}
          title={t.label}
          className={`tab-btn${tab === t.id ? ' active' : ''}`}
          onClick={() => setTab(t.id)}
        >
          <span className="tab-icon">{t.icon}</span>
          <span className="tab-label">{t.label}</span>
          {!!badges[t.id] && <span className="tab-badge">{badges[t.id]}</span>}
        </button>
      ))}
    </nav>
  );
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

export default function App() {
  const [token, setToken] = useLocalStorage('tts_api_token', '');
  const [guildId, setGuildId] = useState('');
  const [guildName, setGuildName] = useState('');
  const [channels, setChannels] = useState<Channel[]>([]);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [joiningChannelId, setJoiningChannelId] = useState<string | null>(null);
  const [online, setOnline] = useState<boolean | null>(null);
  const [queue, setQueue] = useState<QueueState>(EMPTY_QUEUE);
  const [presets, setPresets] = useState<Preset[]>([]);
  const socketRef = useRef<Socket | null>(null);

  const compact = useMediaQuery(COMPACT_QUERY);
  const [tab, setTab] = useState<Tab>(() => (localStorage.getItem('tts_api_token') ? 'text' : 'channels'));

  // Speech state (shared by the text input and the quick messages)
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [voices, setVoices] = useState<Voice[]>([]);
  const [selectedVoice, setSelectedVoice] = usePersistentState('tts_voice', 'fr_FR-siwis-medium', isString);
  const [pitch, setPitch] = usePersistentState('tts_pitch', 0, isPitch);
  const [tempo, setTempo] = usePersistentState('tts_tempo', 1, isTempo);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [showPronunciation, setShowPronunciation] = useState(false);

  // 1. Fetch public config (guildId) + health
  useEffect(() => {
    callApi('GET', '/config', undefined, '', true).then((res) => {
      const d = res.data as Record<string, unknown> | null;
      if (res.ok && typeof d?.['guildId'] === 'string') setGuildId(d['guildId'] as string);
    });
    callApi('GET', '/health', undefined, '', true).then((res) => {
      setOnline(res.ok && (res.data as Record<string, unknown>)?.['ok'] === true);
    });
  }, []);

  // 2. Fetch channels + guild name when guildId or token changes
  useEffect(() => {
    if (!guildId || !token) return;
    callApi('GET', `/guilds/${guildId}/channels`, undefined, token).then((res) => {
      if (res.ok && Array.isArray(res.data)) setChannels(res.data as Channel[]);
    });
    callApi('GET', '/guilds', undefined, token).then((res) => {
      if (res.ok && Array.isArray(res.data)) {
        const guild = (res.data as { id: string; name: string }[]).find((g) => g.id === guildId);
        if (guild) setGuildName(guild.name);
      }
    });
  }, [guildId, token]);

  // Load available voices
  useEffect(() => {
    if (!token) return;
    callApi('GET', '/voices', undefined, token).then((res) => {
      if (res.ok && Array.isArray(res.data)) {
        const list = res.data as Voice[];
        setVoices(list);
        // Keep current selection if it exists in the list, otherwise pick first
        setSelectedVoice((prev) => {
          const ids = list.map((v) => v.id);
          return ids.includes(prev) ? prev : (ids[0] ?? prev);
        });
      }
    });
  }, [token]);

  // 3. Fetch initial status once, then socket handles realtime updates
  const fetchStatus = useCallback(() => {
    if (!token || !guildId) return;
    callApi('GET', '/status', undefined, token).then((res) => {
      if (!res.ok || !res.data) return;
      const guilds = (res.data as { guilds: { guildId: string; connected: boolean; channelId?: string }[] }).guilds;
      const entry = guilds.find((g) => g.guildId === guildId);
      setActiveChannelId(entry?.connected && entry.channelId ? entry.channelId : null);
    });
    callApi('GET', `/guilds/${guildId}/channels`, undefined, token).then((res) => {
      if (res.ok && Array.isArray(res.data)) setChannels(res.data as Channel[]);
    });
  }, [token, guildId]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // 4. Realtime channel + status updates through Socket.IO
  useEffect(() => {
    if (!token || !guildId) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      return;
    }

    const socket = io('/', {
      auth: { token },
      transports: ['websocket', 'polling'],
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setOnline(true);
      socket.emit('guild:subscribe', { guildId });
    });

    socket.on('disconnect', () => {
      setOnline(false);
    });

    socket.on('connect_error', () => {
      setOnline(false);
    });

    socket.on('guild:update', (state: GuildRealtimeState) => {
      if (state.guildId !== guildId) return;
      setActiveChannelId(state.connected && state.channelId ? state.channelId : null);
      setChannels(state.channels);
      setQueue(state.queue ?? EMPTY_QUEUE);
      setPresets(state.presets ?? []);
    });

    return () => {
      socket.emit('guild:unsubscribe', { guildId });
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token, guildId]);

  // 5. Join / leave on click
  const handleChannelClick = async (channel: Channel) => {
    if (joiningChannelId) return;
    setJoiningChannelId(channel.id);

    if (activeChannelId === channel.id) {
      await callApi('POST', '/voice/leave', { guildId }, token);
      setActiveChannelId(null);
    } else {
      await callApi('POST', '/voice/join', { guildId, channelId: channel.id }, token);
      setActiveChannelId(channel.id);
      // In compact mode, joining a channel means you want to talk: go back to the text.
      setTab('text');
    }

    setJoiningChannelId(null);
  };

  const leave = async () => {
    await callApi('POST', '/voice/leave', { guildId }, token);
    setActiveChannelId(null);
  };

  // 6. Speech
  const speak = async (text: string, voiceId: string, pitch: number, tempo: number) => {
    if (!text || !voiceId || !guildId) return;
    setSendError(null);
    setSending(true);

    const now = new Date();
    const time = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');

    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), author: TTS_BOT_NAME, content: text, time, color: TTS_BOT_COLOR },
    ]);

    const res = await callApi('POST', '/speak', { guildId, text, voiceId, pitch, tempo }, token);
    if (!res.ok) {
      const errMsg = (res.data as Record<string, unknown>)?.['error'] as string | undefined;
      setSendError(errMsg ?? 'Erreur lors de la synthèse vocale');
    }
    setSending(false);
  };

  // A preset with its own voice uses its own pitch/tempo; otherwise the current settings apply.
  const sendPreset = (p: Preset) =>
    p.voiceId ? speak(p.text, p.voiceId, p.pitch ?? 0, p.tempo ?? 1) : speak(p.text, selectedVoice, pitch, tempo);

  const activeChannelName = channels.find((c) => c.id === activeChannelId)?.name ?? null;
  const canType = !!activeChannelName && !!token;

  // -------------------------------------------------------------------------
  // Pieces shared by both layouts
  // -------------------------------------------------------------------------

  const sidebar = (
    <Sidebar
      guildName={guildName}
      online={online}
      token={token}
      setToken={setToken}
      channels={channels}
      activeChannelId={activeChannelId}
      joiningChannelId={joiningChannelId}
      onChannelClick={handleChannelClick}
      onLeave={leave}
      onOpenPronunciation={compact ? undefined : () => setShowPronunciation(true)}
    />
  );

  const pronunciationPanel = (onClose?: () => void) => (
    <PronunciationPanel
      token={token}
      canSpeak={canType && !sending}
      onSpeak={(text) => speak(text, selectedVoice, pitch, tempo)}
      onClose={onClose}
    />
  );

  const voiceControls = (
    <VoiceControls
      voices={voices}
      selectedVoice={selectedVoice}
      setSelectedVoice={setSelectedVoice}
      pitch={pitch}
      setPitch={setPitch}
      tempo={tempo}
      setTempo={setTempo}
      disabled={sending}
    />
  );

  const quickPanel = (
    <QuickPanel
      presets={presets}
      setPresets={setPresets}
      voices={voices}
      guildId={guildId}
      token={token}
      canSend={canType && !sending}
      onSend={sendPreset}
      onError={setSendError}
    />
  );

  const chatArea = (active: boolean, controls?: React.ReactNode) => (
    <ChatArea
      channelName={activeChannelName}
      messages={messages}
      draft={draft}
      setDraft={setDraft}
      canType={canType}
      sending={sending}
      sendError={sendError}
      onSend={(text) => speak(text, selectedVoice, pitch, tempo)}
      compact={compact}
      active={active}
      controls={controls}
    />
  );

  if (!compact) {
    return (
      <div className="layout">
        {sidebar}
        {chatArea(true, <>
          <QueuePanel queue={queue} guildId={guildId} token={token} />
          {voiceControls}
        </>)}
        {quickPanel}
        {showPronunciation && (
          <div
            className="prono-overlay"
            onClick={(e) => { if (e.target === e.currentTarget) setShowPronunciation(false); }}
            onKeyDown={(e) => { if (e.key === 'Escape') setShowPronunciation(false); }}
          >
            {pronunciationPanel(() => setShowPronunciation(false))}
          </div>
        )}
      </div>
    );
  }

  // Compact layout: the text input takes the whole window, everything else lives in tabs.
  // Panels stay mounted (just hidden) so drafts and scroll positions survive tab switches.
  const queueCount = (queue.current ? 1 : 0) + queue.pending.length;

  return (
    <div className="layout compact">
      <TabBar tab={tab} setTab={setTab} badges={{ queue: queueCount }} />

      <div className="compact-status">
        <StatusDot online={online} />
        <button className="compact-channel" onClick={() => setTab('channels')} title="Changer de salon">
          {activeChannelName ? `#${activeChannelName}` : 'Aucun salon'}
        </button>
        {queue.current && (
          <button
            className="compact-skip"
            title={`Passer : ${queue.current.text}`}
            onClick={() => callApi('POST', '/skip', { guildId }, token)}
          >
            ⏭
          </button>
        )}
      </div>

      <div className="tab-panel" hidden={tab !== 'text'}>{chatArea(tab === 'text')}</div>
      <div className="tab-panel" hidden={tab !== 'quick'}>
        {quickPanel}
        {sendError && <div className="chat-send-error">{sendError}</div>}
      </div>
      <div className="tab-panel" hidden={tab !== 'channels'}>{sidebar}</div>
      <div className="tab-panel tab-panel-scroll" hidden={tab !== 'voice'}>{voiceControls}</div>
      <div className="tab-panel tab-panel-scroll" hidden={tab !== 'queue'}>
        <QueuePanel queue={queue} guildId={guildId} token={token} showEmpty />
      </div>
      <div className="tab-panel" hidden={tab !== 'prono'}>
        {tab === 'prono' && pronunciationPanel()}
        {tab === 'prono' && sendError && <div className="chat-send-error">{sendError}</div>}
      </div>
    </div>
  );
}
