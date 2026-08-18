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

Éditer `.env` et renseigner vos identifiants MySQL. Créer la base :

```sql
CREATE DATABASE glo_db CHARACTER SET utf8mb4;
```

```bash
npm run seed
npm start
```

API sur **http://localhost:4000**.

---

## 3. Installation du frontend (`Interface/`)

```bash
cd Interface
npm install
copy .env.example .env
npm start
```

Ouvrir **http://localhost:3000**, se connecter avec `0000.admin`.

---

## 4. Nouvelles fonctionnalités (cette version)

### Profil utilisateur enrichi
- Champs : email, téléphone, autres contacts, fonction, adresse
- Préférences de compte : thème (clair / sombre / auto), langue
- Page **Mon profil** accessible depuis le menu Sécurité

### Rôles
- La permission **read** sur les **Activités** est toujours active (figée)
- Distinction claire agent / admin / superuser pour les tickets

### Tableaux
- Clic sur un en-tête de colonne (`th`) → tri
- Filtres personnalisés sauvegardés dans `localStorage`
- Script : `/js/glo-tableaux.js`

### Sélection multiple d'utilisateurs
- Cases à cocher + barre d'actions pour attribution / déplacement en masse

### Gestionnaire de credentials (Réglages généraux)
- Stockage login / mdp / champs libres par outil
- Copie presse-papier immédiate

### Premier déploiement
- Affichage des CGU (`/cgu`)
- Choix LDAP ou local
- Étapes d'installation des dépendances

### Modèle de données (ajouts)
- `utilisateurs` : email, telephone, autres_contacts, fonction, adresse, preferences (JSON)
- `parametres` : credentials (JSON), installation_terminee, cgu_acceptees_le

> Après mise à jour, synchroniser Sequelize (`alter: true`) ou ajouter les colonnes manuellement.


### Mon profil (UI)
- Menu contextuel en cliquant sur le **nom de l'utilisateur** (en haut à droite) : *Mon profil* · *Déconnexion*
- *Changer mon mot de passe* est accessible uniquement depuis la page Mon profil
- Page Mon profil en **deux cartes** côte à côte :
  - Gauche : infos (email, téléphone, autres contacts multiples, fonction, adresse)
  - Droite : préférences (thème clair/sombre/auto, langue)
- Thème sombre appliqué via classe `theme-sombre` sur `<html>` / `<body>`
