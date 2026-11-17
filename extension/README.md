# Extension TTS Teams

Fait parler le tts-bot **dans le micro de Teams web** (Chrome / Edge), mixé avec ton vrai micro.
Sans pilote audio virtuel ni droits admin.

## Fonctionnement

- `inject.js` tourne dans la page Teams avant son chargement et remplace `getUserMedia`.
  La piste micro que Teams reçoit est un mix WebAudio : vrai micro + bus TTS.
  `getSettings()` et `label` renvoient ceux du vrai micro.
- `content.js` affiche le panneau flottant (texte, voix, presets, file d'attente).
- `background.js` appelle l'API (`/ext/voices`, `/ext/presets`, `/ext/render`) avec le token.
  Les requêtes partent de l'extension, donc la CSP de Teams et le CORS ne s'appliquent pas.
- La synthèse (piper + ffmpeg) est la même que pour Discord : mêmes voix, même pitch, même tempo.

## Installation

1. Côté serveur : `EXTENSION_TOKEN` dans `backend/.env` (`openssl rand -hex 32`), puis `pm2 restart tts-bot`.
2. `chrome://extensions` (ou `edge://extensions`) → **Mode développeur** → **Charger l'extension non empaquetée** → ce dossier.
3. Les options de l'extension s'ouvrent au clic sur son icône hors de Teams : y mettre le serveur et le token, puis cliquer sur **Enregistrer et tester**.
4. Ouvrir Teams web **après** avoir installé l'extension, ou recharger l'onglet.

## Utilisation

- Le panneau apparaît en bas à droite de Teams. On peut le déplacer par son titre et le réduire avec `—`.
  L'icône de l'extension l'affiche ou le masque. `Alt+Maj+T` l'affiche et place le curseur dans le champ texte.
- Entrée envoie le texte, Maj+Entrée fait un retour à la ligne.
- Pastille verte = mixé dans le micro de l'appel. Orange = pas encore d'appel, sourdine, ou audio en pause (cliquer dans la page).
- Options du panneau :
  - **M'entendre** : joue aussi le TTS dans tes haut-parleurs.
  - **Couper mon micro pendant le TTS** : coupe ton vrai micro le temps du message.
  - **Mixer dans le micro** : si décoché, Teams reçoit le micro brut au prochain accès au micro.

## Limites

- Teams web uniquement (Teams bureau ne passe pas par le navigateur).
- Si Teams est en sourdine, le TTS ne passe pas non plus.
- La suppression du bruit de Teams peut abîmer la voix de synthèse : la mettre sur *Faible* si besoin.
- Si l'extension est rechargée, il faut recharger l'onglet Teams.
