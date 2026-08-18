/**
 * Sauvegarde / restauration GLO (export JSON versionné).
 * Ordre des tables respecté pour les clés étrangères.
 */
const {
    sequelize,
    Role,
    Utilisateur,
    Activite,
    SousActivite,
    Outil,
    UtilisateurActivite,
    UtilisateurSousActivite,
    OutilActivite,
    OutilSousActivite,
    Parametre,
    Journal,
    OutilHistoriqueStatut,
    Notification,
    Ticket,
    TicketMessage,
    TicketImage,
    UtilisateurOutilCredential
} = require('../models');

const VERSION = 1;

const TABLES = [
    { name: 'parametres', model: Parametre },
    { name: 'roles', model: Role },
    { name: 'activites', model: Activite },
    { name: 'sous_activites', model: SousActivite },
    { name: 'utilisateurs', model: Utilisateur },
    { name: 'outils', model: Outil },
    { name: 'utilisateur_activites', model: UtilisateurActivite },
    { name: 'utilisateur_sous_activites', model: UtilisateurSousActivite },
    { name: 'outil_activites', model: OutilActivite },
    { name: 'outil_sous_activites', model: OutilSousActivite },
    { name: 'utilisateur_outil_credentials', model: UtilisateurOutilCredential },
    { name: 'outil_historique_statuts', model: OutilHistoriqueStatut },
    { name: 'tickets', model: Ticket },
    { name: 'ticket_messages', model: TicketMessage },
    { name: 'ticket_images', model: TicketImage },
    { name: 'notifications', model: Notification },
    { name: 'journal', model: Journal }
];

async function exporterSauvegarde() {
    const tables = {};
    for (const t of TABLES) {
        if (!t.model) continue;
        try {
            let rows;
            if (t.name === 'utilisateurs') {
                rows = await t.model.unscoped().findAll({ raw: true });
            } else {
                rows = await t.model.findAll({ raw: true });
            }
            tables[t.name] = rows;
        } catch (err) {
            // Table absente (migration pas encore passée) → ignorer
            tables[t.name] = [];
            console.warn('[sauvegarde] skip', t.name, err.message);
        }
    }
    return {
        glo_backup: true,
        version: VERSION,
        created_at: new Date().toISOString(),
        tables
    };
}

async function restaurerSauvegarde(payload, options = {}) {
    if (!payload || !payload.glo_backup || !payload.tables) {
        throw new Error('Fichier de sauvegarde GLO invalide (glo_backup manquant).');
    }
    const vider = options.vider !== false;
    const tables = payload.tables;

    await sequelize.query('SET FOREIGN_KEY_CHECKS = 0');
    try {
        if (vider) {
            // Ordre inverse pour vider
            for (const t of [...TABLES].reverse()) {
                if (!t.model) continue;
                try {
                    await t.model.destroy({ where: {}, truncate: true, force: true });
                } catch (e) {
                    try {
                        await sequelize.query(`DELETE FROM \`${t.name}\``);
                    } catch (_) { /* ignore */ }
                }
            }
        }

        for (const t of TABLES) {
            const rows = tables[t.name];
            if (!t.model || !Array.isArray(rows) || !rows.length) continue;
            // bulkCreate par paquets
            const chunk = 100;
            for (let i = 0; i < rows.length; i += chunk) {
                const part = rows.slice(i, i + chunk);
                await t.model.bulkCreate(part, {
                    ignoreDuplicates: true,
                    validate: false
                });
            }
        }
    } finally {
        await sequelize.query('SET FOREIGN_KEY_CHECKS = 1');
    }

    const nbUsers = await Utilisateur.count();
    return { ok: true, nb_utilisateurs: nbUsers, version: payload.version };
}

module.exports = { exporterSauvegarde, restaurerSauvegarde, VERSION };
