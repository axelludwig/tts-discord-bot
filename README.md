# tts-discord-bot

Bot Discord qui lit du texte à voix haute dans un salon vocal, avec la synthèse vocale locale [Piper](https://github.com/rhasspy/piper) (aucun service externe). Il se pilote depuis un dashboard web : choix du salon, de la voix, de la hauteur et de la vitesse, et gestion de la file d'attente.

- `backend/` : bot discord.js, API Express et Socket.IO, file d'attente par serveur, Piper + ffmpeg
- `frontend/` : dashboard React (Vite)
- `scripts/` : setup et lancement en dev, compatibles Windows, Linux et macOS

## Prérequis

- Node.js 20 ou plus
- Un bot Discord : [portail développeur](https://discord.com/developers/applications), puis *Bot*, puis *Reset Token*. Invite-le avec les scopes `bot` et les permissions *View Channel*, *Connect* et *Speak*.

Pas besoin d'installer ffmpeg : il est fourni par `ffmpeg-static`. Piper et les voix sont téléchargés par le setup.

## Installation

```bash
npm run setup
```

Le setup installe les dépendances, télécharge Piper pour ta plateforme (Windows x64, Linux x64/arm64, macOS) et la voix `fr_FR-siwis-medium`, teste la synthèse, puis crée `backend/.env` avec un `API_TOKEN` aléatoire.

Il reste à remplir `DISCORD_TOKEN` et `GUILD_ID` dans `backend/.env`.

Pour ajouter des voix (liste sur [piper-samples](https://rhasspy.github.io/piper-samples/)) :

```bash
npm run setup -- fr_FR-tom-medium fr_FR-upmc-medium
```

## Lancer

| | Commande | Adresse |
|---|---|---|
| Dev (API + dashboard, rechargement auto) | `npm run dev` | http://localhost:5173 |
| Prod (un seul process, dashboard servi par l'API) | `npm run build && npm start` | http://localhost:`API_PORT` |

Au premier lancement, ouvre les *Paramètres* du dashboard et colle l'`API_TOKEN`.

### En service permanent

**Linux (systemd)**, dans `/etc/systemd/system/tts-bot.service` :

```ini
[Unit]
Description=TTS Discord bot
After=network-online.target

[Service]
WorkingDirectory=/opt/tts-discord-bot
ExecStart=/usr/bin/npm start
Restart=on-failure
User=ttsbot

[Install]
WantedBy=multi-user.target
```

Puis `sudo systemctl enable --now tts-bot`.

**Windows ou Linux (pm2)** : `npm i -g pm2`, `npm run build`, puis `pm2 start npm --name tts-bot -- start` et `pm2 save`.

## Configuration (`backend/.env`)

| Variable | Défaut | Rôle |
|---|---|---|
| `DISCORD_TOKEN` | *requis* | Token du bot |
| `API_TOKEN` | *requis* | Secret partagé entre le dashboard et l'API |
| `GUILD_ID` | | Serveur affiché dans le dashboard |
| `API_PORT` | `3000` | Port de l'API (le proxy Vite le lit aussi) |
| `CORS_ORIGIN` | `http://localhost:5173` | Origine autorisée en dev |
| `PIPER_BIN` | `backend/piper/piper(.exe)` | Binaire Piper |
| `VOICES_DIR` | `backend/voices` | Dossier des modèles `.onnx` |
| `FFMPEG_BIN` | ffmpeg-static, sinon le `PATH` | Binaire ffmpeg |
| `MAX_QUEUE_LENGTH` | `20` | Nombre max de messages en attente par serveur |
| `MAX_TEXT_LENGTH` | `500` | Longueur max d'un message |

## API

Toutes les routes, sauf `/health`, `/config` et le dashboard, demandent `Authorization: Bearer <API_TOKEN>`.

| Méthode | Route | Corps / effet |
|---|---|---|
| `GET` | `/guilds`, `/guilds/:id/channels`, `/voices`, `/status` | Lecture |
| `POST` | `/voice/join` | `{ guildId, channelId }` |
| `POST` | `/voice/leave` | `{ guildId }` (vide aussi la file) |
| `POST` | `/speak` | `{ guildId, text, voiceId, pitch?, tempo?, author? }` ajoute à la file et renvoie `{ id, position }` |
| `GET` | `/queue/:guildId` | `{ current, pending }` |
| `DELETE` | `/queue/:guildId/:itemId` | Retire un message en attente |
| `POST` | `/skip` | `{ guildId }` passe au message suivant |
| `POST` | `/stop` | `{ guildId }` arrête et vide la file |

Socket.IO, avec `auth: { token }` : `guild:subscribe { guildId }`, puis l'API pousse `guild:update` à chaque changement (connexion, file, membres des salons).

## Dépannage

- **Le bot reste bloqué en `signalling`** : il manque des permissions dans le salon, ou l'intent *Guild Voice States*.
- **Le bot reste bloqué en `connecting`** : l'UDP sortant (ports 50000 à 65535) est bloqué par un pare-feu.
- **`spawn error` de piper** : relance `npm run setup -- --force`.
