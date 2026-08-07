const { Parametre } = require('../models');
const { consigner } = require('../utils/journal');

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
        res.json({ nom_entreprise: parametre.nom_entreprise });
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

async function mettreAJour(req, res, next) {
    try {
        const parametre = await trouverOuCreer();
        const { nom_entreprise, mot_de_passe_defaut } = req.body;

        await parametre.update({
            nom_entreprise: nom_entreprise !== undefined ? (nom_entreprise || null) : parametre.nom_entreprise,
            mot_de_passe_defaut: mot_de_passe_defaut || parametre.mot_de_passe_defaut
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
