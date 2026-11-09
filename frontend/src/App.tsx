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

interface GuildRealtimeState {
  guildId: string;
  connected: boolean;
  channelId?: string;
  playing: boolean;
  queue: QueueState;
  channels: Channel[];
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

function QueuePanel({ queue, guildId, token }: { queue: QueueState; guildId: string; token: string }) {
  if (!queue.current && queue.pending.length === 0) return null;
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
            <span className="queue-text">{queue.current.text}</span>
            <span className="queue-voice">{queue.current.voiceId}</span>
          </li>
        )}
        {queue.pending.map((item, i) => (
          <li key={item.id} className="queue-item">
            <span className="queue-badge">{i + 1}</span>
            <span className="queue-text">{item.text}</span>
            <span className="queue-voice">{item.voiceId}</span>
            <button className="queue-remove" title="Retirer" onClick={() => removeItem(item.id)}>✕</button>
          </li>
        ))}
      </ol>
    </div>
  );
}

function ChatArea({
  channelName,
  guildId,
  token,
  queue,
}: {
  channelName: string | null;
  guildId: string;
  token: string;
  queue: QueueState;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [voices, setVoices] = useState<{ id: string; language: string }[]>([]);
  const [selectedVoice, setSelectedVoice] = useState('fr_FR-siwis-medium');
  const [pitch, setPitch] = useState(0);
  const [tempo, setTempo] = useState(1);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Load available voices
  useEffect(() => {
    if (!token) return;
    callApi('GET', '/voices', undefined, token).then((res) => {
      if (res.ok && Array.isArray(res.data)) {
        const list = res.data as { id: string; language: string }[];
        setVoices(list);
        // Keep current selection if it exists in the list, otherwise pick first
        setSelectedVoice((prev) => {
          const ids = list.map((v) => v.id);
          return ids.includes(prev) ? prev : (ids[0] ?? prev);
        });
      }
    });
  }, [token]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = async () => {
    const text = draft.trim();
    if (!text || !selectedVoice || !guildId) return;
    setSendError(null);
    setSending(true);

    const now = new Date();
    const time = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
    const msgId = crypto.randomUUID();

    setMessages((prev) => [
      ...prev,
      { id: msgId, author: TTS_BOT_NAME, content: text, time, color: TTS_BOT_COLOR },
    ]);
    setDraft('');

    const res = await callApi('POST', '/speak', { guildId, text, voiceId: selectedVoice, pitch, tempo }, token);
    if (!res.ok) {
      const errMsg = (res.data as Record<string, unknown>)?.['error'] as string | undefined;
      setSendError(errMsg ?? 'Erreur lors de la synthèse vocale');
    }
    setSending(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  return (
    <div className="chat-area">
      <div className="chat-header">
        <span className="chat-header-icon">🔊</span>
        <span className="chat-header-name">{channelName ?? 'Aucun salon'}</span>
      </div>

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
        <QueuePanel queue={queue} guildId={guildId} token={token} />
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
              disabled={sending}
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
              disabled={sending}
            />
            <strong>{tempo.toFixed(2)}x</strong>
          </label>
        </div>
        {sendError && <div className="chat-send-error">{sendError}</div>}
        <div className="chat-input-bar">
          <input
            className="chat-input"
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={channelName ? `Parler en tant que tts-bot dans #${channelName}…` : 'Rejoins un salon vocal pour parler…'}
            disabled={!channelName || !token || sending}
          />
          <button
            className="chat-send-btn"
            onClick={send}
            disabled={!draft.trim() || !channelName || !token || sending}
          >
            {sending ? '…' : '🔊 Parler'}
          </button>
        </div>
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
// App
// ---------------------------------------------------------------------------

export default function App() {
  const [token, setToken] = useLocalStorage('tts_api_token', '');
  const [showSettings, setShowSettings] = useState(!localStorage.getItem('tts_api_token'));
  const [guildId, setGuildId] = useState('');
  const [guildName, setGuildName] = useState('');
  const [channels, setChannels] = useState<Channel[]>([]);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [joiningChannelId, setJoiningChannelId] = useState<string | null>(null);
  const [online, setOnline] = useState<boolean | null>(null);
  const [queue, setQueue] = useState<QueueState>(EMPTY_QUEUE);
  const socketRef = useRef<Socket | null>(null);

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
    }

    setJoiningChannelId(null);
  };

  const activeChannelName = channels.find((c) => c.id === activeChannelId)?.name;

  return (
    <div className="layout">
    <div className="sidebar">
      {/* Server header */}
      <div className="server-header">
        <span className="server-name">{guildName || 'TTS Bot'}</span>
        <span
          className={`status-dot${online === true ? ' online' : online === false ? ' offline' : ''}`}
          title={online === true ? 'En ligne' : online === false ? 'Hors ligne' : '…'}
        />
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
            onClick={() => handleChannelClick(ch)}
          />
        ))}
      </div>

      {/* Footer */}
      <div className="sidebar-footer">
        {activeChannelName && (
          <div className="now-playing">
            <IconSpeaker size={14} />
            <span>{activeChannelName}</span>
            <button
              className="leave-btn"
              title="Quitter le salon"
              onClick={async () => {
                await callApi('POST', '/voice/leave', { guildId }, token);
                setActiveChannelId(null);
              }}
            >
              ✕
            </button>
          </div>
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
    <ChatArea channelName={activeChannelName ?? null} guildId={guildId} token={token} queue={queue} />
    </div>
  );
}

