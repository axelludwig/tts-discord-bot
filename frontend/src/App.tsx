import { useState, useEffect, useCallback, useRef } from 'react';

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

type ApiResult = { data: unknown; ok: boolean } | null;

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
  const data = await r.json();
  return { data, ok: r.ok };
}

// ---------------------------------------------------------------------------
// Small shared components
// ---------------------------------------------------------------------------

function ResultBox({ result, loading }: { result: ApiResult; loading: boolean }) {
  if (loading) return <pre className="result">…</pre>;
  if (!result) return null;
  return (
    <pre className={`result${result.ok ? '' : ' err'}`}>
      {JSON.stringify(result.data, null, 2)}
    </pre>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card">
      <h2>{title}</h2>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Individual cards
// ---------------------------------------------------------------------------

function HealthCard({ token }: { token: string }) {
  const [result, setResult] = useState<ApiResult>(null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true);
    try {
      setResult(await callApi('GET', '/health', undefined, token, true));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card title="GET /health">
      <button onClick={run} disabled={loading}>
        Ping
      </button>
      <ResultBox result={result} loading={loading} />
    </Card>
  );
}

function GuildsCard({ token }: { token: string }) {
  const [result, setResult] = useState<ApiResult>(null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true);
    try {
      setResult(await callApi('GET', '/guilds', undefined, token));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card title="GET /guilds">
      <button onClick={run} disabled={loading}>
        Lister les guilds
      </button>
      <ResultBox result={result} loading={loading} />
    </Card>
  );
}

function ChannelsCard({ token, defaultGuildId }: { token: string; defaultGuildId: string }) {
  const [guildId, setGuildId] = useState(defaultGuildId);
  const [result, setResult] = useState<ApiResult>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (defaultGuildId && !guildId) setGuildId(defaultGuildId);
  }, [defaultGuildId, guildId]);

  const run = async () => {
    setLoading(true);
    try {
      setResult(await callApi('GET', `/guilds/${guildId}/channels`, undefined, token));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card title="GET /guilds/:id/channels">
      <Field label="Guild ID">
        <input value={guildId} onChange={(e) => setGuildId(e.target.value)} placeholder="123456789" />
      </Field>
      <button onClick={run} disabled={loading || !guildId}>
        Lister les channels
      </button>
      <ResultBox result={result} loading={loading} />
    </Card>
  );
}

function StatusCard({ token }: { token: string }) {
  const [result, setResult] = useState<ApiResult>(null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true);
    try {
      setResult(await callApi('GET', '/status', undefined, token));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card title="GET /status">
      <button onClick={run} disabled={loading}>
        Voir le statut
      </button>
      <ResultBox result={result} loading={loading} />
    </Card>
  );
}

function VoicesCard({ token }: { token: string }) {
  const [result, setResult] = useState<ApiResult>(null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true);
    try {
      setResult(await callApi('GET', '/voices', undefined, token));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card title="GET /voices">
      <button onClick={run} disabled={loading}>
        Lister les voix
      </button>
      <ResultBox result={result} loading={loading} />
    </Card>
  );
}

function JoinCard({
  token,
  defaultGuildId,
}: {
  token: string;
  defaultGuildId: string;
}) {
  const [guildId, setGuildId] = useState(defaultGuildId);
  const [channelId, setChannelId] = useState('');
  const [result, setResult] = useState<ApiResult>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (defaultGuildId && !guildId) setGuildId(defaultGuildId);
  }, [defaultGuildId, guildId]);

  const run = async () => {
    setLoading(true);
    try {
      setResult(await callApi('POST', '/voice/join', { guildId, channelId }, token));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card title="POST /voice/join">
      <Field label="Guild ID">
        <input value={guildId} onChange={(e) => setGuildId(e.target.value)} placeholder="123456789" />
      </Field>
      <Field label="Channel ID">
        <input value={channelId} onChange={(e) => setChannelId(e.target.value)} placeholder="987654321" />
      </Field>
      <button onClick={run} disabled={loading || !guildId || !channelId}>
        Rejoindre
      </button>
      <ResultBox result={result} loading={loading} />
    </Card>
  );
}

function LeaveCard({
  token,
  defaultGuildId,
}: {
  token: string;
  defaultGuildId: string;
}) {
  const [guildId, setGuildId] = useState(defaultGuildId);
  const [result, setResult] = useState<ApiResult>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (defaultGuildId && !guildId) setGuildId(defaultGuildId);
  }, [defaultGuildId, guildId]);

  const run = async () => {
    setLoading(true);
    try {
      setResult(await callApi('POST', '/voice/leave', { guildId }, token));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card title="POST /voice/leave">
      <Field label="Guild ID">
        <input value={guildId} onChange={(e) => setGuildId(e.target.value)} placeholder="123456789" />
      </Field>
      <button onClick={run} disabled={loading || !guildId}>
        Quitter
      </button>
      <ResultBox result={result} loading={loading} />
    </Card>
  );
}

interface Voice {
  id: string;
}

function SpeakCard({
  token,
  defaultGuildId,
}: {
  token: string;
  defaultGuildId: string;
}) {
  const [guildId, setGuildId] = useState(defaultGuildId);
  const [text, setText] = useState('Bonjour à tous !');
  const [voices, setVoices] = useState<Voice[]>([]);
  const [voiceId, setVoiceId] = useState('');
  const [pitch, setPitch] = useState(0);
  const [tempo, setTempo] = useState(1);
  const [result, setResult] = useState<ApiResult>(null);
  const [loading, setLoading] = useState(false);
  const prevToken = useRef('');

  useEffect(() => {
    if (defaultGuildId && !guildId) setGuildId(defaultGuildId);
  }, [defaultGuildId, guildId]);

  useEffect(() => {
    if (!token || token === prevToken.current) return;
    prevToken.current = token;
    callApi('GET', '/voices', undefined, token)
      .then((res) => {
        if (res.ok && Array.isArray(res.data)) {
          const list = res.data as Voice[];
          setVoices(list);
          if (list.length > 0 && !voiceId) setVoiceId(list[0].id);
        }
      })
      .catch(() => {});
  }, [token, voiceId]);

  const run = async () => {
    setLoading(true);
    try {
      setResult(
        await callApi('POST', '/speak', { guildId, text, voiceId, pitch, tempo }, token),
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card title="POST /speak">
      <Field label="Guild ID">
        <input value={guildId} onChange={(e) => setGuildId(e.target.value)} placeholder="123456789" />
      </Field>
      <Field label="Texte">
        <textarea value={text} onChange={(e) => setText(e.target.value)} />
      </Field>
      <Field label="Voix">
        <select value={voiceId} onChange={(e) => setVoiceId(e.target.value)}>
          {voices.length === 0 && <option value="">— entrez un token pour charger —</option>}
          {voices.map((v) => (
            <option key={v.id} value={v.id}>
              {v.id}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Pitch (−24 à +24)">
        <input
          type="number"
          value={pitch}
          min={-24}
          max={24}
          onChange={(e) => setPitch(Number(e.target.value))}
        />
      </Field>
      <Field label="Tempo (0.5 à 2.0)">
        <input
          type="number"
          value={tempo}
          min={0.5}
          max={2}
          step={0.1}
          onChange={(e) => setTempo(Number(e.target.value))}
        />
      </Field>
      <button onClick={run} disabled={loading || !guildId || !text || !voiceId}>
        Parler
      </button>
      <ResultBox result={result} loading={loading} />
    </Card>
  );
}

function StopCard({
  token,
  defaultGuildId,
}: {
  token: string;
  defaultGuildId: string;
}) {
  const [guildId, setGuildId] = useState(defaultGuildId);
  const [result, setResult] = useState<ApiResult>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (defaultGuildId && !guildId) setGuildId(defaultGuildId);
  }, [defaultGuildId, guildId]);

  const run = async () => {
    setLoading(true);
    try {
      setResult(await callApi('POST', '/stop', { guildId }, token));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card title="POST /stop">
      <Field label="Guild ID">
        <input value={guildId} onChange={(e) => setGuildId(e.target.value)} placeholder="123456789" />
      </Field>
      <button onClick={run} disabled={loading || !guildId}>
        Stop
      </button>
      <ResultBox result={result} loading={loading} />
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Health status hook (polling on mount)
// ---------------------------------------------------------------------------

type HealthStatus = 'unknown' | 'online' | 'degraded' | 'offline';

function useHealthStatus() {
  const [status, setStatus] = useState<HealthStatus>('unknown');

  useEffect(() => {
    callApi('GET', '/health', undefined, '', true)
      .then((res) => {
        const data = res.data as Record<string, unknown> | null;
        if (res.ok && data && data['ok'] === true) setStatus('online');
        else setStatus('degraded');
      })
      .catch(() => setStatus('offline'));
  }, []);

  const dotColor: Record<HealthStatus, string> = {
    unknown: '#555',
    online: '#4caf50',
    degraded: '#ff9800',
    offline: '#f44336',
  };

  const label: Record<HealthStatus, string> = {
    unknown: '…',
    online: 'Online',
    degraded: 'Dégradé',
    offline: 'Hors ligne',
  };

  return { dotColor: dotColor[status], label: label[status] };
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

export default function App() {
  const [token, setToken] = useLocalStorage('tts_api_token', '');
  const { dotColor, label } = useHealthStatus();

  // Read the default guild ID injected by the server (not available in the
  // React SPA, so we fall back to empty string — users can fill it manually).
  const defaultGuildId = '';

  return (
    <>
      <h1>
        🤖 TTS Discord Bot —{' '}
        <span className="health-dot" style={{ background: dotColor }} />
        {label}
      </h1>

      <div className="token-bar">
        <label htmlFor="g-token">API Token :</label>
        <input
          id="g-token"
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="changer-moi"
        />
      </div>

      <div className="grid">
        <HealthCard token={token} />
        <GuildsCard token={token} />
        <ChannelsCard token={token} defaultGuildId={defaultGuildId} />
        <StatusCard token={token} />
        <VoicesCard token={token} />
        <JoinCard token={token} defaultGuildId={defaultGuildId} />
        <LeaveCard token={token} defaultGuildId={defaultGuildId} />
        <SpeakCard token={token} defaultGuildId={defaultGuildId} />
        <StopCard token={token} defaultGuildId={defaultGuildId} />
      </div>
    </>
  );
}
