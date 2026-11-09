# Mise en production

Ce guide sert de checklist, à suivre par une personne ou par un agent. Chaque étape se termine par une vérification. Il vise un serveur Linux avec systemd, et la variante Windows est en fin de document.

## 0. Ce qu'il faut savoir avant

- **Un seul process** : en prod, l'API sert aussi le dashboard buildé. Il n'y a ni base de données ni service externe.
- **Une seule instance par token** : ne lance jamais deux instances avec le même `DISCORD_TOKEN`, par exemple la prod et un dev local. Les deux recevraient les mêmes commandes.
- **Fichiers locaux à conserver** lors des mises à jour (tous ignorés par git) :
  - `backend/.env` : les secrets
  - `backend/data/` : voix choisies par les utilisateurs, salon `/tts-salon`
  - `backend/voices/` et `backend/piper/` : ils peuvent être retéléchargés avec `npm run setup`
- **Réseau** : HTTPS sortant (Discord, téléchargement de Piper et des voix) et **UDP sortant sur les ports 50000 à 65535** (audio vocal Discord). Aucun port entrant n'est nécessaire, sauf pour exposer le dashboard.
- **Plateformes** : Linux x86_64 ou arm64 avec **glibc** (Debian, Ubuntu, Fedora…). Alpine (musl) n'est pas pris en charge par le binaire Piper.

## 1. Prérequis système

```bash
node -v   # doit afficher v20 ou plus
tar --version
git --version
```

Si Node manque ou est trop ancien, installe Node 20 LTS ou plus récent (via NodeSource, nvm ou le gestionnaire de paquets).

Crée un utilisateur dédié (recommandé) :

```bash
sudo useradd --system --create-home --home-dir /opt/tts-discord-bot --shell /usr/sbin/nologin ttsbot
```

## 2. Récupérer le code

```bash
sudo -u ttsbot git clone <url-du-repo> /opt/tts-discord-bot
cd /opt/tts-discord-bot
sudo -u ttsbot git checkout main
```

**Vérification** : `ls` montre `backend/ frontend/ scripts/ package.json`.

## 3. Setup

```bash
sudo -u ttsbot npm run setup
```

**Vérification** : la sortie se termine par `✓ Setup done` et l'étape *Testing Piper* affiche `ok (… bytes of audio)`. Si Piper échoue avec une erreur de bibliothèque partagée, le système n'utilise sans doute pas glibc (voir l'étape 0).

## 4. Configuration

Édite `backend/.env`, créé par le setup avec un `API_TOKEN` aléatoire :

```ini
DISCORD_TOKEN=<token du bot>
GUILD_ID=<id du serveur Discord>
API_PORT=3000
# ENABLE_TEXT_CHANNEL=true   # seulement si l'intent "Message Content" est coché sur le portail
```

Protège le fichier : `sudo chmod 600 backend/.env && sudo chown ttsbot: backend/.env`.

Sur le [portail développeur](https://discord.com/developers/applications), vérifie que le bot a bien été invité avec les scopes `bot` et `applications.commands`. Le lien d'invitation exact s'affiche dans les logs à l'étape 6.

## 5. Build

```bash
sudo -u ttsbot npm run build
```

**Vérification** : `frontend/dist/index.html` et `backend/dist/index.js` existent.

## 6. Premier lancement manuel

```bash
sudo -u ttsbot npm start
```

**Vérification** : les logs contiennent, dans l'ordre :

```
[tts] N voice(s) loaded: …
[bot] Logged in as <nom>#xxxx
[bot] Invite link: https://discord.com/oauth2/authorize?…
[commands] 8 slash commands registered on guild <GUILD_ID>
[api] Listening on http://localhost:3000
```

Dans un autre terminal :

```bash
curl -s localhost:3000/health                                   # {"ok":true}
curl -s -H "Authorization: Bearer $(grep ^API_TOKEN backend/.env | cut -d= -f2-)" localhost:3000/voices
```

Si un warning `The bot is not a member of GUILD_ID` apparaît, ouvre le lien d'invitation affiché dans les logs. Arrête ensuite avec Ctrl+C.

## 7. Service systemd

`/etc/systemd/system/tts-bot.service` :

```ini
[Unit]
Description=TTS Discord bot
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=ttsbot
WorkingDirectory=/opt/tts-discord-bot/backend
ExecStart=/usr/bin/env node dist/index.js
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now tts-bot
```

**Vérification** : `systemctl status tts-bot` est `active (running)` et `journalctl -u tts-bot -n 30` montre les mêmes logs qu'à l'étape 6. Si Node a été installé via nvm, remplace `/usr/bin/env node` par le chemin absolu donné par `which node`.

**Test fonctionnel** : dans Discord, rejoins un salon vocal puis tape `/say texte:bonjour`. Le bot doit rejoindre le salon et parler.

## 8. Exposer le dashboard (optionnel)

Le dashboard écoute sur `API_PORT`, en HTTP simple. Il est protégé par `API_TOKEN`, mais ce token circule en clair en HTTP. Deux options :

- **Ne pas l'exposer** (le plus simple) : y accéder via un tunnel SSH, avec `ssh -L 3000:localhost:3000 serveur` puis http://localhost:3000.
- **Passer par un reverse proxy HTTPS** qui transmet les WebSockets. Par exemple avec Caddy :

  ```
  tts.example.com {
      reverse_proxy localhost:3000
  }
  ```

  Dans ce cas, bloque l'accès direct au port 3000 dans le pare-feu.

## 9. Mise à jour

```bash
cd /opt/tts-discord-bot
sudo -u ttsbot git pull
sudo -u ttsbot npm run setup      # installe les nouvelles dépendances, ne touche ni au .env ni aux voix
sudo -u ttsbot npm run build
sudo systemctl restart tts-bot
```

## Variante Windows (serveur ou PC allumé en permanence)

1. Installe Node 20+ et Git, puis exécute dans PowerShell : `git clone …`, `npm run setup`, édite `backend\.env`, puis `npm run build`.
2. Vérifie avec `npm start` (mêmes logs qu'à l'étape 6).
3. Pour le faire tourner en service, utilise pm2 :

   ```powershell
   npm i -g pm2 pm2-windows-startup
   pm2 start backend/dist/index.js --name tts-bot --cwd backend
   pm2 save
   pm2-startup install
   ```

4. Le pare-feu Windows doit autoriser `node.exe` en sortie (UDP), ce qui est le cas par défaut.
