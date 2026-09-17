# Déploiement GLO

GLO est composé de **deux services** :

| Composant | Rôle | Hébergement recommandé |
|-----------|------|------------------------|
| **Server/** | API, MySQL, sessions, surveillance, SLA, uploads | **Railway**, **Render**, **Fly.io**, VPS |
| **Interface/** | EJS + Express (UI) | Vercel *possible*, ou même hôte que le Server |

> **Important :** le **Server** (MySQL, jobs en arrière-plan, fichiers uploadés, sessions fichier) **n’est pas adapté à Vercel** (fonctions serverless sans processus long ni disque persistant).  
> Sur Vercel, déployez au maximum l’**Interface**, en pointant `API_URL` vers le Server hébergé ailleurs.

---

## Scripts lint & build

À la racine du projet :

```bash
npm run install:all   # installe Server + Interface
npm run lint          # ESLint sur les deux apps
npm run lint:fix   # ESLint + correction auto
npm run build         # vérifie la syntaxe Node (Server + Interface)
```

Par application :

```bash
cd Server && npm run lint && npm run build
cd Interface && npm run lint && npm run build
```

---

## Option A — Déploiement recommandé (Server + Interface hors Vercel)

### 1. Base de données MySQL

- Créer une base (PlanetScale, Railway MySQL, Aiven, ou MySQL géré).
- Noter host, port, user, password, nom de base.

### 2. Déployer le Server (ex. Railway / Render)

1. Créer un service Node depuis le dossier `Server/`.
2. Variables d’environnement (exemple) :

```env
PORT=4000
DB_HOST=...
DB_PORT=3306
DB_USER=...
DB_PASSWORD=...
DB_NAME=glo_db
SESSION_SECRET=une-chaine-longue-aleatoire
CREDENTIALS_SECRET=une-autre-chaine-aleatoire
CLIENT_URL=https://votre-interface.vercel.app
SMTP_HOST=...
SMTP_PORT=587
SMTP_USER=...
SMTP_PASS=...
```

3. Build / start :

```text
Build : npm install && npm run build
Start : npm start
```

4. Après le premier démarrage : tables créées via Sequelize / `assurerColonnes`.  
   Optionnel : `npm run seed` (une fois) pour données de démo.

5. Noter l’URL publique API, ex. `https://glo-server.up.railway.app`.

### 3. Déployer l’Interface (Vercel ou même plateforme)

**Sur Vercel :**

1. Importer le dépôt GitHub du projet.
2. **Root Directory** : laisser la racine (utilise `vercel.json`) **ou** définir `Interface`.
3. Variables d’environnement Interface :

```env
PORT=3000
API_URL=https://glo-server.up.railway.app/api
SESSION_SECRET=meme-secret-ou-autre
NODE_ENV=production
```

4. Vercel exécute `build` puis route tout vers `Interface/app.js`.
5. Dans le Server, `CLIENT_URL` = URL Vercel de l’Interface (CORS + cookies).

**Build & lint sur Vercel :**

- Build Command : `cd Interface && npm install && npm run build`
- (Optionnel) Install Command : `cd Interface && npm install`

### 4. Vérifications post-déploiement

- [ ] `GET https://votre-api/api/health` → `{ "status": "ok" }`
- [ ] Ouvrir l’Interface → page de connexion / installation
- [ ] Login admin
- [ ] CORS : pas d’erreur console entre Interface et API
- [ ] Cookies de session (même site ou `credentials: true` + CORS)

---

## Option B — Tout sur un VPS (le plus simple pour GLO)

```bash
git clone <votre-repo>
cd Gestionnaire-Libre-des-Outils
npm run install:all

# Configurer Server/.env et Interface/.env
cd Server && npm run build && npm start   # PM2 recommandé
cd Interface && npm run build && npm start
```

Nginx reverse-proxy :

- `https://glo.example.com` → Interface `:3000`
- `https://glo.example.com/api` → Server `:4000`

---

## Pourquoi pas « tout sur Vercel » ?

| Besoin GLO | Limite Vercel |
|------------|----------------|
| MySQL + Sequelize (connexions longues) | Serverless, connexions fragiles |
| Surveillance / SLA / planification (timers) | Pas de process long |
| Uploads fichiers (outils, logos) | Disque éphémère |
| Sessions fichier / store local | Pas de FS persistant |
| Diagnostic réseau (`ping`, etc.) | Environnement restreint |

---

## Commandes utiles en CI (GitHub Actions)

```yaml
- run: npm run install:all
- run: npm run lint
- run: npm run build
```

---

## Modes local et production

GLO lit `NODE_ENV` dans chaque `.env` :

| | Local (`development`) | Production (`production`) |
|--|----------------------|---------------------------|
| Secrets | défauts de dev acceptés | `SESSION_SECRET` obligatoire |
| Cookies `secure` | non | oui (HTTPS) |
| CORS | localhost flexible | uniquement `CLIENT_URL` / `CLIENT_URLS` |
| `trust proxy` | optionnel | activé |
| Fichiers statiques | sans cache long | cache 7 jours |
| MySQL SSL | non | `DB_SSL=true` si besoin |

### Démarrage local

```bash
# Server/.env  → NODE_ENV=development, CLIENT_URL=http://localhost:3000
# Interface/.env → NODE_ENV=development, API_URL=http://localhost:4000/api

cd Server && npm run dev
cd Interface && npm run dev
```

### Démarrage production (même machine / VPS)

```bash
# Server/.env  → NODE_ENV=production, secrets forts, CLIENT_URL=https://...
# Interface/.env → NODE_ENV=production, API_URL=https://api.../api

cd Server && npm start
cd Interface && npm start
```

Au démarrage, chaque process affiche le mode détecté, CORS, cookies et DB.
