# tts-discord-bot

Bot Discord qui lit du texte à voix haute dans un salon vocal, avec la synthèse vocale locale [Piper](https://github.com/rhasspy/piper) (aucun service externe). On le pilote par **slash commands** dans Discord ou depuis un **dashboard web**. Les deux alimentent la même file d'attente.

- `backend/` : bot discord.js, slash commands, API Express et Socket.IO, file d'attente par serveur, Piper + ffmpeg
- `frontend/` : dashboard React (Vite)
- `scripts/` : setup et lancement en dev, compatibles Windows, Linux et macOS

> Mise en production : voir **[DEPLOY.md](DEPLOY.md)**.

## Prérequis

- Node.js 20 ou plus, et `tar` (présent par défaut sous Windows 10+, Linux et macOS)
- Une application Discord avec un bot ([portail développeur](https://discord.com/developers/applications)) :
  - *Bot*, puis *Reset Token* : c'est le `DISCORD_TOKEN`
  - Invitation avec les scopes **`bot` + `applications.commands`** et les permissions *View Channel*, *Connect* et *Speak*. Le bot affiche ce lien d'invitation dans ses logs au démarrage.
  - Seulement pour `/tts-salon` : cocher l'intent privilégié *Message Content* (onglet *Bot*)

Pas besoin d'installer ffmpeg : il est fourni par `ffmpeg-static`. Piper et les voix sont téléchargés par le setup.

## Installation

```bash
npm run setup
```

Le setup peut être relancé sans risque. Il installe les dépendances, télécharge Piper pour ta plateforme (Windows x64, Linux x64/arm64, macOS) et la voix `fr_FR-siwis-medium`, teste la synthèse, puis crée `backend/.env` avec un `API_TOKEN` aléatoire. Il reste à remplir `DISCORD_TOKEN` et `GUILD_ID`.

Pour ajouter des voix (liste sur [piper-samples](https://rhasspy.github.io/piper-samples/)), puis redémarrer le bot :

```bash
npm run setup -- fr_FR-tom-medium fr_FR-upmc-medium
```

## Lancer

| | Commande | Adresse |
|---|---|---|
| Dev (API + dashboard, rechargement auto) | `npm run dev` | http://localhost:5173 |
| Prod (un seul process, dashboard servi par l'API) | `npm run build && npm start` | http://localhost:`API_PORT` |

Au premier lancement, ouvre les *Paramètres* du dashboard et colle l'`API_TOKEN`.

## Slash commands

Les réponses ne sont visibles que par la personne qui lance la commande. Pour `/leave`, `/skip` et `/stop`, il faut être dans le même salon vocal que le bot.

| Commande | Effet |
|---|---|
| `/join` | Le bot rejoint ton salon vocal |
| `/leave` | Le bot quitte le salon et vide la file |
| `/say texte [voix] [pitch] [vitesse]` | Ajoute un message à la file. Le bot rejoint ton salon s'il n'est connecté nulle part. |
| `/skip` | Passe au message suivant |
| `/stop` | Arrête la lecture et vide la file |
| `/queue` | Affiche la file |
| `/voix [voix] [pitch] [vitesse] [reset]` | Règle ta voix par défaut (sans option : affiche tes réglages) |
| `/tts-salon [salon]` | *(Gérer le serveur)* Lit à voix haute les messages d'un salon texte. Sans option, désactive. |

Avec `/tts-salon`, un message n'est lu que si son auteur est dans le salon vocal du bot. Les messages qui commencent par `//` sont ignorés, et les liens, emojis et blocs de code sont simplifiés. Cette fonction demande `ENABLE_TEXT_CHANNEL=true` et l'intent *Message Content*.

Les commandes sont enregistrées au démarrage sur `GUILD_ID` (elles apparaissent tout de suite). Sans `GUILD_ID`, elles sont enregistrées globalement et peuvent mettre jusqu'à une heure à apparaître. Les réglages (`/voix`, `/tts-salon`) sont stockés dans `backend/data/settings.json`.

## Configuration (`backend/.env`)

| Variable | Défaut | Rôle |
|---|---|---|
| `DISCORD_TOKEN` | *requis* | Token du bot |
| `API_TOKEN` | *requis* | Secret partagé entre le dashboard et l'API |
| `GUILD_ID` | | Serveur du dashboard et des slash commands |
| `API_PORT` | `3000` | Port de l'API et du dashboard en prod (le proxy Vite le lit aussi) |
| `CORS_ORIGIN` | `http://localhost:5173` | Origine autorisée en dev uniquement |
| `DEFAULT_VOICE` | `fr_FR-siwis-medium` | Voix utilisée quand personne n'en a choisi |
| `ENABLE_TEXT_CHANNEL` | `false` | Active `/tts-salon`. Il faut l'intent *Message Content*, sinon le bot ne peut pas se connecter. |
| `MAX_QUEUE_LENGTH` | `20` | Nombre max de messages en attente par serveur |
| `MAX_TEXT_LENGTH` | `500` | Longueur max d'un message |
| `PIPER_BIN` | `backend/piper/piper(.exe)` | Binaire Piper |
| `VOICES_DIR` | `backend/voices` | Dossier des modèles `.onnx` |
| `FFMPEG_BIN` | ffmpeg-static, sinon le `PATH` | Binaire ffmpeg |
| `SETTINGS_FILE` | `data/settings.json` | Réglages persistants, chemin relatif à `backend/` |

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

| Symptôme | Cause probable |
|---|---|
| `Used disallowed intents` au démarrage | `ENABLE_TEXT_CHANNEL=true` sans l'intent *Message Content* coché |
| Les slash commands n'apparaissent pas | Bot invité sans le scope `applications.commands` (réinvite-le avec le lien des logs), ou `GUILD_ID` erroné |
| Le bot reste bloqué en `signalling` | Il manque des permissions dans le salon, ou l'intent *Guild Voice States* |
| Le bot reste bloqué en `connecting` | L'UDP sortant (ports 50000 à 65535) est bloqué par un pare-feu |
| `spawn error` de piper | Relance `npm run setup -- --force` |
