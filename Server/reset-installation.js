/**
 * Réinitialise GLO pour revenir à l'assistant de première installation.
 * N'utilise pas SQL manuellement : tout passe par Sequelize / le script.
 *
 * Usage : npm run reset-installation
 *
 * - Vide les données métier (utilisateurs, activités, outils, tickets, etc.)
 * - Conserve la structure des tables
 * - Remet installation_terminee = false et CGU non acceptées
 * - Ne recrée PAS d'admin ni de données de démo (contrairement à seed)
 */
require('dotenv').config();
const { sequelize, Parametre } = require('./models');

async function reset() {
    try {
        await sequelize.authenticate();
        console.log('Connexion DB OK.');

        // Ordre compatible FK (enfants d'abord). On ignore les tables absentes.
        const tablesAVider = [
            'ticket_images',
            'ticket_messages',
            'tickets',
            'notifications',
            'journals',
            'outil_historique_statuts',
            'outil_sous_activites',
            'outil_activites',
            'utilisateur_sous_activites',
            'utilisateur_activites',
            'outils',
            'sous_activites',
            'activites',
            'utilisateurs',
            'roles'
        ];

        const transaction = await sequelize.transaction();
        try {
            await sequelize.query('SET FOREIGN_KEY_CHECKS = 0', { transaction });

            const existantes = await sequelize.getQueryInterface().showAllTables({ transaction });
            const noms = existantes.map(t => (typeof t === 'string' ? t : t.tableName).toLowerCase());

            for (const table of tablesAVider) {
                if (noms.includes(table.toLowerCase())) {
                    await sequelize.query(`TRUNCATE TABLE \`${table}\``, { transaction });
                    console.log(`  truncé : ${table}`);
                }
            }

            await sequelize.query('SET FOREIGN_KEY_CHECKS = 1', { transaction });
            await transaction.commit();
        } catch (err) {
            await transaction.rollback().catch(() => {});
            await sequelize.query('SET FOREIGN_KEY_CHECKS = 1').catch(() => {});
            throw err;
        }

        // Paramètres : garder la ligne id=1, réinitialiser l'état d'installation
        const [parametre] = await Parametre.findOrCreate({ where: { id: 1 }, defaults: {} });
        await parametre.update({
            installation_terminee: false,
            cgu_acceptees_le: null,
            ldap_actif: false,
            credentials_actifs: false
        });

        console.log('');
        console.log('Réinitialisation terminée.');
        console.log('  - Données métier vidées (pas de seed)');
        console.log('  - installation_terminee = false');
        console.log('');
        console.log('Prochaine étape :');
        console.log('  1. Redémarrer Server + Interface');
        console.log('  2. Ouvrir http://localhost:3000 → assistant /installation');
        process.exit(0);
    } catch (err) {
        console.error('Échec reset-installation :', err.message);
        process.exit(1);
    }
}

reset();
