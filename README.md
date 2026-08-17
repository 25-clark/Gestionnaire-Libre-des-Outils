# GLO — Gestionnaire Libre des Outils

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

Par défaut, l'API tourne sur **http://localhost:4000**.

---

## 3. Installation du frontend (`Interface/`)

Dans un **second terminal** :

```bash
cd Interface
npm install
copy .env.example .env
```

Vérifier que `API_URL` dans `.env` pointe bien vers le backend (`http://localhost:4000/api` par défaut).

Démarrer l'interface :

```bash
npm start
# ou npm run dev
```

Ouvrir **http://localhost:3000** dans le navigateur, puis se connecter avec le matricule
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

- Authentification par session (cookie) avec matricule + mot de passe (haché, jamais stocké en clair).
- Les deux applications communiquent en HTTP : l'Interface relaie le cookie de session du
  Server à chaque appel API (voir `Interface/config/api.js`).
- Les images (logos d'activité, images d'outil) sont uploadées et hébergées côté `Interface/`
  (`public/uploads/`), puis le chemin est transmis au `Server/` qui l'enregistre en base.
- Pensez à activer HTTPS si l'application devient accessible depuis l'extérieur du réseau interne.

---

## 7. Sécurité, surveillance réseau et statistiques

**Anti-brute-force** (`Server/utils/limiteurIp.js`, `authController.js`) : après *N* échecs de
connexion (réglable), un compte est bloqué temporairement — à la fois par **matricule** (persisté
en base, `Utilisateur.tentatives_echouees` / `bloque_jusqu_a`) et par **IP** (en mémoire, protection
complémentaire contre le test de plusieurs matricules depuis la même machine).

**Politique de mot de passe** et **durée de session** configurables depuis **Réglages généraux**
(menu Administration, réservé à l'admin) : longueur minimale, exigence de complexité, nombre
d'échecs avant blocage, durée du blocage, durée de session avant déconnexion automatique.

**Surveillance réseau automatique** (`Server/utils/surveillance.js`) : tout outil ayant une
adresse renseignée est pingé périodiquement en arrière-plan (intervalle réglable, 5 min par
défaut). Statut 🟢/🔴/⚪ affiché automatiquement dans les listes d'outils, avec bouton
"🔄 Vérifier maintenant" pour forcer une vérification immédiate, et un historique des
changements d'état (`OutilHistoriqueStatut`) consultable via l'icône 📈.

**Statistiques** (menu Administration, réservé à l'admin) : vue d'ensemble du parc — nombre
d'activités/sous-activités/utilisateurs/outils, répartition des utilisateurs par rôle, état de
la surveillance réseau, et les 12 derniers événements du Journal.

**Dernière connexion** : visible dans l'onglet "Utilisateurs" de chaque activité (calculée à la
volée depuis le Journal, pas stockée en double), pratique pour repérer les comptes inactifs.

⚠️ Ces fonctionnalités ajoutent des colonnes/tables (`Utilisateur.tentatives_echouees`,
`Parametre.*`, `Outil.dernier_statut`, `OutilHistoriqueStatut`...). Comme ce projet n'a pas de
système de migration, il faut relancer `npm run seed` côté `Server/` pour que la base de données
reflète ces changements (cela réinitialise les données — à faire uniquement en développement).
