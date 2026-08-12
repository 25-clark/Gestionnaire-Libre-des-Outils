const { Notification } = require('../models');

/**
 * Crée une notification in-app pour un utilisateur. N'échoue jamais l'action
 * en cours si l'écriture rate (même principe que consigner() pour le journal).
 *
 * Pas d'envoi email ici : ce projet n'a pas de serveur SMTP configuré dans
 * cet environnement. Pour brancher un envoi email plus tard, il suffirait
 * d'appeler un service mail ici en plus de Notification.create — le reste
 * du code (tous les appels à notifier()) n'aurait pas à changer.
 *
 * @param {object} params
 * @param {number} params.id_user   destinataire
 * @param {string} params.message
 * @param {string} [params.lien]
 * @param {string} [params.type]    info | succes | alerte (défaut: info)
 */
async function notifier({ id_user, message, lien = null, type = 'info' }) {
    if (!id_user) return;
    try {
        await Notification.create({ id_user, message, lien, type });
    } catch (err) {
        console.error("[notification] échec de l'enregistrement :", err.message);
    }
}

module.exports = { notifier };
