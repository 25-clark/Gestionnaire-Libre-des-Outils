const { Journal } = require('../models');

/**
 * Enregistre un événement dans le journal (audit log). N'échoue jamais
 * l'action en cours si l'écriture du journal rate — un souci de journalisation
 * ne doit pas empêcher l'action métier elle-même.
 *
 * @param {object}  params
 * @param {object}  [params.user]        req.currentUser, ou null pour un événement système
 * @param {string}  params.action        ex: 'connexion', 'creation', 'modification', 'suppression'
 * @param {string}  params.ressource     ex: 'auth', 'utilisateur', 'activite', 'outil', 'role', 'acces'
 * @param {number}  [params.id_ressource]
 * @param {string}  params.libelle       phrase lisible, ex: "Utilisateur Jean Dupont créé"
 */
async function consigner({ user, action, ressource, id_ressource = null, libelle }) {
    try {
        await Journal.create({
            id_user: user ? user.id : null,
            matricule_user: user ? user.matricule : null,
            nom_user: user ? `${user.prenom} ${user.nom}` : 'Système',
            action,
            ressource,
            id_ressource,
            libelle
        });
    } catch (err) {
        console.error("[journal] échec de l'enregistrement d'un événement :", err.message);
    }
}

module.exports = { consigner };
