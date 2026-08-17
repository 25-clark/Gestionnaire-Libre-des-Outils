/**
 * Migration manuelle : node migrate.js
 * Ajoute les colonnes manquantes puis quitte.
 */
require('dotenv').config();
const { sequelize } = require('./models');
const { assurerColonnes } = require('./utils/assurerColonnes');

(async () => {
    try {
        await sequelize.authenticate();
        console.log('Connexion OK.');
        await assurerColonnes();
        console.log('Migration terminée.');
        process.exit(0);
    } catch (err) {
        console.error('Migration échouée :', err.message);
        process.exit(1);
    }
})();
