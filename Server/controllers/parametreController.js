const { definirAlgo } = require('../utils/credentialsCrypto');
const { Parametre } = require('../models');
const { consigner } = require('../utils/journal');
const { validerPolitiqueMotDePasse } = require('../utils/motDePasse');

// Une seule ligne de réglages existe toujours (id: 1), créée à la volée si
// elle n'existe pas encore (première utilisation de l'app).
async function trouverOuCreer() {
    const [parametre] = await Parametre.findOrCreate({ where: { id: 1 }, defaults: {} });
    return parametre;
}

// Accessible SANS authentification : seulement le nom de l'entreprise, pour
// pouvoir l'afficher sur la page de connexion et dans l'en-tête. Ne jamais
// exposer mot_de_passe_defaut ici (un compte fraîchement créé/réinitialisé
// utilise ce mot de passe : le révéler publiquement permettrait de se
// connecter à sa place avant qu'il ne l'ait changé).
async function obtenirPublic(req, res, next) {
    try {
        const parametre = await trouverOuCreer();
        let installation_terminee = !!parametre.installation_terminee;
        // Rétrocompat : si des utilisateurs existent déjà, ne pas forcer le wizard
        if (!installation_terminee) {
            const { Utilisateur } = require('../models');
            const n = await Utilisateur.count();
            if (n > 0) {
                if (chiffrement_algo) definirAlgo(chiffrement_algo);
        await parametre.update({ installation_terminee: true, cgu_acceptees_le: parametre.cgu_acceptees_le || new Date() });
                installation_terminee = true;
            }
        }
        res.json({
            nom_entreprise: parametre.nom_entreprise,
            credentials_actifs: !!parametre.credentials_actifs,
            chiffrement_algo: parametre.chiffrement_algo || 'aes-256-gcm',
            auth_3fa_actif: !!parametre.auth_3fa_actif,
            totp_disponible: parametre.totp_disponible !== false,
            totp_obligatoire: !!parametre.totp_obligatoire,
            installation_terminee,
            ldap_actif: !!parametre.ldap_actif
        });
    } catch (err) { next(err); }
}

// Réservé à l'administrateur (voir parametreRoutes.js) : objet complet,
// y compris le mot de passe par défaut, pour la page de réglages.
async function obtenir(req, res, next) {
    try {
        const parametre = await trouverOuCreer();
        res.json(parametre);
    } catch (err) { next(err); }
}

// Bornes raisonnables pour éviter qu'un réglage absurde (0 tentative, 0
// caractère...) ne rende l'application inutilisable ou dangereusement
// permissive. On corrige silencieusement (clamp) plutôt que de rejeter,
// pour rester simple à l'usage.
function borner(valeur, min, max, valeurParDefaut) {
    const n = parseInt(valeur, 10);
    if (Number.isNaN(n)) return valeurParDefaut;
    return Math.min(Math.max(n, min), max);
}

async function mettreAJour(req, res, next) {
    try {
        const parametre = await trouverOuCreer();
        const {
            nom_entreprise,
            mot_de_passe_defaut,
            mdp_longueur_min,
            mdp_complexite,
            max_tentatives_connexion,
            duree_blocage_minutes,
            session_duree_heures,
            surveillance_active,
            surveillance_intervalle_minutes,
            credentials_actifs,
            chiffrement_algo,
            auth_3fa_actif,
            totp_disponible,
            totp_obligatoire
        } = req.body;

        const nouvelleLongueurMin = mdp_longueur_min !== undefined
            ? borner(mdp_longueur_min, 4, 32, parametre.mdp_longueur_min)
            : parametre.mdp_longueur_min;
        const nouvelleComplexite = mdp_complexite !== undefined ? !!mdp_complexite : parametre.mdp_complexite;

        // Le mot de passe par défaut doit lui-même respecter la politique
        // qu'on est en train d'enregistrer (sinon les nouveaux comptes/
        // réinitialisations partiraient avec un mot de passe non conforme).
        if (mot_de_passe_defaut) {
            const { valide, message } = validerPolitiqueMotDePasse(mot_de_passe_defaut, {
                mdp_longueur_min: nouvelleLongueurMin,
                mdp_complexite: nouvelleComplexite
            });
            if (!valide) {
                return res.status(400).json({ message: `Mot de passe par défaut : ${message}` });
            }
        }

        if (chiffrement_algo) definirAlgo(chiffrement_algo);
        await parametre.update({
            nom_entreprise: nom_entreprise !== undefined ? (nom_entreprise || null) : parametre.nom_entreprise,
            mot_de_passe_defaut: mot_de_passe_defaut || parametre.mot_de_passe_defaut,
            mdp_longueur_min: nouvelleLongueurMin,
            mdp_complexite: nouvelleComplexite,
            max_tentatives_connexion: max_tentatives_connexion !== undefined
                ? borner(max_tentatives_connexion, 3, 20, parametre.max_tentatives_connexion)
                : parametre.max_tentatives_connexion,
            duree_blocage_minutes: duree_blocage_minutes !== undefined
                ? borner(duree_blocage_minutes, 1, 1440, parametre.duree_blocage_minutes)
                : parametre.duree_blocage_minutes,
            session_duree_heures: session_duree_heures !== undefined
                ? borner(session_duree_heures, 1, 168, parametre.session_duree_heures)
                : parametre.session_duree_heures,
            surveillance_active: surveillance_active !== undefined ? !!surveillance_active : parametre.surveillance_active,
            surveillance_intervalle_minutes: surveillance_intervalle_minutes !== undefined
                ? borner(surveillance_intervalle_minutes, 1, 1440, parametre.surveillance_intervalle_minutes)
                : parametre.surveillance_intervalle_minutes,
            credentials_actifs: credentials_actifs !== undefined ? !!credentials_actifs : parametre.credentials_actifs,
            chiffrement_algo: chiffrement_algo || parametre.chiffrement_algo || 'aes-256-gcm',
            auth_3fa_actif: auth_3fa_actif !== undefined ? !!auth_3fa_actif : parametre.auth_3fa_actif,
            totp_disponible: totp_disponible !== undefined ? !!totp_disponible : parametre.totp_disponible,
            totp_obligatoire: totp_obligatoire !== undefined ? !!totp_obligatoire : parametre.totp_obligatoire
        });

        await consigner({
            user: req.currentUser,
            action: 'modification',
            ressource: 'parametre',
            id_ressource: parametre.id,
            libelle: `Réglages généraux modifiés par ${req.currentUser.prenom} ${req.currentUser.nom}`
        });

        res.json(parametre);
    } catch (err) { next(err); }
}

module.exports = { obtenirPublic, obtenir, mettreAJour };
