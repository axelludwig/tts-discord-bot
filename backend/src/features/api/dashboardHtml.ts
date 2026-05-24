export function buildDashboardHtml(guildIdDefault: string): string {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>TTS Bot - Dashboard</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:system-ui,sans-serif;background:#0f0f0f;color:#e0e0e0;padding:24px}
  h1{font-size:1.4rem;margin-bottom:20px;color:#fff}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:16px}
  .card{background:#1a1a1a;border:1px solid #2a2a2a;border-radius:10px;padding:16px}
  .card h2{font-size:.95rem;text-transform:uppercase;letter-spacing:.05em;color:#888;margin-bottom:12px}
  label{display:block;font-size:.8rem;color:#aaa;margin-bottom:3px;margin-top:8px}
  input,select,textarea{width:100%;padding:6px 8px;background:#111;border:1px solid #333;border-radius:6px;color:#e0e0e0;font-size:.85rem}
  textarea{resize:vertical;min-height:60px}
  button{margin-top:10px;padding:7px 14px;background:#5865f2;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:.85rem;font-weight:600}
  button:hover{background:#4752c4}
  .result{margin-top:10px;padding:8px;background:#111;border:1px solid #222;border-radius:6px;font-size:.78rem;font-family:monospace;white-space:pre-wrap;max-height:160px;overflow:auto;color:#7dff7d}
  .result.err{color:#ff6b6b}
  .token-bar{display:flex;gap:8px;margin-bottom:20px;align-items:center}
  .token-bar input{max-width:320px}
  .token-bar label{color:#aaa;font-size:.85rem;white-space:nowrap}
  #health-dot{display:inline-block;width:10px;height:10px;border-radius:50%;background:#555;margin-right:6px;vertical-align:middle}
</style>
</head>
<body>
<h1>TTS Discord Bot - <span id="health-dot"></span><span id="health-txt">...</span></h1>

<div class="token-bar">
  <label for="g-token">API Token :</label>
  <input id="g-token" type="password" placeholder="changer-moi"/>
</div>

<div class="grid">

  <div class="card">
    <h2>GET /health</h2>
    <button onclick="req('GET','/health',null,'r-health',true)">Ping</button>
    <div class="result" id="r-health"></div>
  </div>

  <div class="card">
    <h2>GET /guilds</h2>
    <button onclick="req('GET','/guilds',null,'r-guilds')">Lister les guilds</button>
    <div class="result" id="r-guilds"></div>
  </div>

  <div class="card">
    <h2>GET /guilds/:id/channels</h2>
    <label>Guild ID</label>
    <input id="ch-guild" class="guild-id" placeholder="123456789"/>
    <button onclick="req('GET','/guilds/'+v('ch-guild')+'/channels',null,'r-channels')">Lister les channels</button>
    <div class="result" id="r-channels"></div>
  </div>

  <div class="card">
    <h2>GET /status</h2>
    <button onclick="req('GET','/status',null,'r-status')">Voir le statut</button>
    <div class="result" id="r-status"></div>
  </div>

  <div class="card">
    <h2>GET /voices</h2>
    <button onclick="req('GET','/voices',null,'r-voices')">Lister les voix</button>
    <div class="result" id="r-voices"></div>
  </div>

  <div class="card">
    <h2>POST /voice/join</h2>
    <label>Guild ID</label>
    <input id="join-guild" class="guild-id" placeholder="123456789"/>
    <label>Channel ID</label>
    <input id="join-channel" placeholder="987654321"/>
    <button onclick="req('POST','/voice/join',{guildId:v('join-guild'),channelId:v('join-channel')},'r-join')">Rejoindre</button>
    <div class="result" id="r-join"></div>
  </div>

  <div class="card">
    <h2>POST /voice/leave</h2>
    <label>Guild ID</label>
    <input id="leave-guild" class="guild-id" placeholder="123456789"/>
    <button onclick="req('POST','/voice/leave',{guildId:v('leave-guild')},'r-leave')">Quitter</button>
    <div class="result" id="r-leave"></div>
  </div>

  <div class="card">
    <h2>POST /speak</h2>
    <label>Guild ID</label>
    <input id="sp-guild" class="guild-id" placeholder="123456789"/>
    <label>Texte</label>
    <textarea id="sp-text">Bonjour a tous !</textarea>
    <label>Voix</label>
    <select id="sp-voice"><option value="">- chargement... -</option></select>
    <label>Pitch (-24 a +24)</label>
    <input id="sp-pitch" type="number" value="0" min="-24" max="24"/>
    <label>Tempo (0.5 a 2.0)</label>
    <input id="sp-tempo" type="number" value="1" min="0.5" max="2" step="0.1"/>
    <button onclick="req('POST','/speak',{guildId:v('sp-guild'),text:v('sp-text'),voiceId:v('sp-voice'),pitch:num('sp-pitch'),tempo:num('sp-tempo')},'r-speak')">Parler</button>
    <div class="result" id="r-speak"></div>
  </div>

  <div class="card">
    <h2>POST /stop</h2>
    <label>Guild ID</label>
    <input id="stop-guild" class="guild-id" placeholder="123456789"/>
    <button onclick="req('POST','/stop',{guildId:v('stop-guild')},'r-stop')">Stop</button>
    <div class="result" id="r-stop"></div>
  </div>

</div>

<script>
const GUILD_ID_DEFAULT = '${guildIdDefault}';
const v = id => document.getElementById(id).value.trim();
const num = id => parseFloat(document.getElementById(id).value);

(function(){
  const saved = localStorage.getItem('tts_api_token');
  if(saved) document.getElementById('g-token').value = saved;
  document.getElementById('g-token').addEventListener('input', function(){
    localStorage.setItem('tts_api_token', this.value);
  });
  if(GUILD_ID_DEFAULT){
    document.querySelectorAll('.guild-id').forEach(el => {
      if(!el.value) el.value = GUILD_ID_DEFAULT;
    });
  }
})();

async function req(method, path, body, resultId, noAuth=false){
  const el = document.getElementById(resultId);
  el.className = 'result';
  el.textContent = '...';
  const headers = {'Content-Type':'application/json'};
  if(!noAuth) headers['Authorization'] = 'Bearer '+v('g-token');
  try{
    const r = await fetch(path,{method,headers,body:body?JSON.stringify(body):undefined});
    const json = await r.json();
    el.textContent = JSON.stringify(json,null,2);
    if(!r.ok) el.className='result err';
  }catch(e){
    el.className='result err';
    el.textContent = String(e);
  }
}

async function loadVoiceSelect(){
  const sel = document.getElementById('sp-voice');
  const token = v('g-token');
  if(!token) return;
  try{
    const r = await fetch('/voices',{headers:{'Authorization':'Bearer '+token}});
    if(!r.ok) return;
    const voices = await r.json();
    const prev = sel.value;
    sel.innerHTML = voices.map(vx => '<option value="'+vx.id+'">'+vx.id+'</option>').join('');
    if(voices.find(vx => vx.id === prev)) sel.value = prev;
  }catch{}
}
document.getElementById('g-token').addEventListener('change', loadVoiceSelect);

(async()=>{
  const dot = document.getElementById('health-dot');
  const txt = document.getElementById('health-txt');
  try{
    const r = await fetch('/health');
    const j = await r.json();
    if(j.ok){dot.style.background='#4caf50';txt.textContent='Online';}
    else{dot.style.background='#ff9800';txt.textContent='Degrade';}
  }catch{dot.style.background='#f44336';txt.textContent='Hors ligne';}
})();
loadVoiceSelect();
</script>
</body>
</html>`;
}
