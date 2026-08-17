/**
 * Ajoute les colonnes manquantes (évolutions de schéma) sans toucher aux données.
 * Appelé au démarrage du serveur — idempotent.
 */
const { sequelize } = require('../models');

async function colonneExiste(table, colonne) {
    const [rows] = await sequelize.query(
        `SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = :table
           AND COLUMN_NAME = :colonne`,
        { replacements: { table, colonne } }
    );
    return Number(rows[0].n) > 0;
}

async function ajouterColonne(table, colonne, definitionSql) {
    if (await colonneExiste(table, colonne)) {
        return false;
    }
    await sequelize.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${colonne}\` ${definitionSql}`);
    console.log(`[schema] Colonne ajoutée : ${table}.${colonne}`);
    return true;
}

async function assurerColonnes() {
    // ---- outils.credentials (JSON, chiffré côté appli) ----
    await ajouterColonne('outils', 'credentials', 'JSON NULL');

    // ---- utilisateurs : profil enrichi ----
    await ajouterColonne('utilisateurs', 'email', 'VARCHAR(255) NULL');
    await ajouterColonne('utilisateurs', 'telephone', 'VARCHAR(30) NULL');
    await ajouterColonne('utilisateurs', 'autres_contacts', 'JSON NULL');
    await ajouterColonne('utilisateurs', 'fonction', 'VARCHAR(255) NULL');
    await ajouterColonne('utilisateurs', 'adresse', 'TEXT NULL');
    await ajouterColonne('utilisateurs', 'preferences', "JSON NULL");

    // ---- parametres : activation credentials + legacy + installation ----
    await ajouterColonne('parametres', 'credentials_actifs', 'TINYINT(1) NOT NULL DEFAULT 0');
    await ajouterColonne('parametres', 'credentials', 'JSON NULL');
    await ajouterColonne('parametres', 'installation_terminee', 'TINYINT(1) NOT NULL DEFAULT 0');
    await ajouterColonne('parametres', 'cgu_acceptees_le', 'DATETIME NULL');

    console.log('[schema] Vérification des colonnes terminée.');
}

module.exports = { assurerColonnes };
