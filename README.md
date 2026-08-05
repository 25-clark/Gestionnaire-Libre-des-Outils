# GLO — Gestionnaire d'Outils par Activité

Application de gestion des outils utilisés par les différentes activités et
sous-activités d'une organisation, avec gestion fine des accès par rôle.

Le projet est composé de **deux applications indépendantes** :

- **`Server/`** — API backend (Node.js + Express + Sequelize + MySQL)
- **`Interface/`** — Frontend (Node.js + Express + EJS), qui consomme l'API du `Server/`

---

## 1. Prérequis

- Node.js 18+ et npm
- MySQL (5.7+ ou 8+) installé et démarré

---

## 2. Installation du backend (`Server/`)

```bash
cd Server
npm install
copy .env.example .env
```

Éditer `.env` et renseigner vos identifiants MySQL (`DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASS`).
Créer la base de données vide au préalable :

```sql
CREATE DATABASE glo_db CHARACTER SET utf8mb4;
```

Initialiser la base avec des données de démonstration :

```bash
npm run seed
```

Cela crée :
- un rôle **Administrateur** (tous les droits), **Agent** (droits limités), **Invité** (lecture seule)
- un admin de connexion : matricule **`0000.admin`**
- un agent : matricule **`0001.dupont`**
- une activité "Maintenance Bâtiment" avec des sous-activités ("Électricité" > "Câblage", "Plomberie")
- un outil "Tournevis électrique"

Démarrer le serveur :

```bash
npm start
# ou npm run dev (avec nodemon)
```

Par défaut, l'API tourne sur **http://localhost:2520**.

---

## 3. Installation du frontend (`Interface/`)

Dans un **second terminal** :

```bash
cd Interface
npm install
copy .env.example .env
```

Vérifier que `API_URL` dans `.env` pointe bien vers le backend (`http://localhost:2520/api` par défaut).

Démarrer l'interface :

```bash
npm start
# ou npm run dev
```

Ouvrir **http://localhost:2521** dans le navigateur, puis se connecter avec le matricule
`0000.admin` (aucun mot de passe n'est requis — outil interne).

---

## 4. Modèle de données (résumé)

| Entité | Champs | Particularité |
|---|---|---|
| **Role** | id, nom, abbreviation, permissions (JSON) | CRUD complet (admin) |
| **Utilisateur** | id, matricule, nom, prenom, id_activite, id_role | Pas de modification : suppression + recréation |
| **Activite** | id, nom, abbreviation, logo, id_user (créateur) | Modifiable |
| **SousActivite** | id, nom, id_activite, id_parent | Modifiable, arborescence façon dossiers |
| **Outil** | id, nom, lien, active, image, id_user (propriétaire) | Pas de modification, sauf activation/désactivation |

Relations many-to-many gérées par tables pivots :
- `UtilisateurActivite` / `UtilisateurSousActivite` — accès particuliers accordés par un admin
- `OutilActivite` / `OutilSousActivite` — un outil peut apparaître dans plusieurs activités/sous-activités

---

## 5. Permissions

Chaque rôle porte un objet `permissions` du type :

```json
{
  "utilisateurs":   { "read": true, "create": true, "update": false, "delete": false },
  "activites":      { "read": true, "create": false, "update": false, "delete": false },
  "sous_activites": { "read": true, "create": false, "update": false, "delete": false },
  "outils":         { "read": true, "create": true, "update": true, "delete": false },
  "roles":          { "read": false, "create": false, "update": false, "delete": false },
  "acces":          { "read": false, "create": false, "update": false, "delete": false }
}
```

Un utilisateur avec le rôle **ADMIN** contourne toujours ces vérifications (accès total).

En plus des permissions globales du rôle, un admin peut accorder un **accès particulier**
("superuser ciblé") à un utilisateur sur une activité ou sous-activité précise via la page
**Accès** de l'interface (ex : droit d'écriture sur une seule activité, sans toucher aux autres).

---

## 6. Notes techniques

- Authentification par session (cookie), sans mot de passe (matricule uniquement).
- Les deux applications communiquent en HTTP : l'Interface relaie le cookie de session du
  Server à chaque appel API (voir `Interface/config/api.js`).
- Les images (logos d'activité, images d'outil) sont uploadées et hébergées côté `Interface/`
  (`public/uploads/`), puis le chemin est transmis au `Server/` qui l'enregistre en base.
- Pensez à ajouter un vrai système de mot de passe / SSO si l'application devient accessible
  depuis l'extérieur du réseau interne.
