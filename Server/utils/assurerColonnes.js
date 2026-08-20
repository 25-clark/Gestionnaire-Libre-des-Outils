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

    await ajouterColonne('utilisateurs', 'session_active_id', 'VARCHAR(255) NULL');
    await ajouterColonne('parametres', 'chiffrement_algo', "VARCHAR(32) NOT NULL DEFAULT 'aes-256-gcm'");
    await ajouterColonne('parametres', 'auth_3fa_actif', 'TINYINT(1) NOT NULL DEFAULT 0');

    await ajouterColonne('parametres', 'credentials', 'JSON NULL');
    await ajouterColonne('parametres', 'installation_terminee', 'TINYINT(1) NOT NULL DEFAULT 0');
    await ajouterColonne('parametres', 'cgu_acceptees_le', 'DATETIME NULL');


    // ---- Table credentials personnels (utilisateur × outil) ----
    try {
        await sequelize.query(`
            CREATE TABLE IF NOT EXISTS \`utilisateur_outil_credentials\` (
                \`id\` INT NOT NULL AUTO_INCREMENT,
                \`id_user\` INT NOT NULL,
                \`id_outil\` INT NOT NULL,
                \`credentials\` JSON NOT NULL,
                \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                \`updated_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (\`id\`),
                UNIQUE KEY \`uq_user_outil_creds\` (\`id_user\`, \`id_outil\`),
                KEY \`idx_uoc_user\` (\`id_user\`),
                KEY \`idx_uoc_outil\` (\`id_outil\`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);
        console.log('[schema] Table utilisateur_outil_credentials OK');
    } catch (e) {
        console.warn('[schema] utilisateur_outil_credentials:', e.message);
    }


    // ---- tickets : SLA / escalade ----
    await ajouterColonne('tickets', 'sla_echeance', 'DATETIME NULL');
    await ajouterColonne('tickets', 'derniere_relance_le', 'DATETIME NULL');
    await ajouterColonne('tickets', 'escalade_le', 'DATETIME NULL');
    await ajouterColonne('tickets', 'id_escalade_admin', 'INT NULL');

    // ---- outils : maintenance / dérangement ----
    await ajouterColonne('outils', 'note_maintenance', 'TEXT NULL');
    await ajouterColonne('outils', 'derangement_debut', 'DATETIME NULL');
    await ajouterColonne('outils', 'derangement_fin', 'DATETIME NULL');
    await ajouterColonne('outils', 'derangement_message', 'VARCHAR(500) NULL');


    await ajouterColonne('activites', 'reglages', 'JSON NULL');
    await ajouterColonne('sous_activites', 'reglages', 'JSON NULL');


    await ajouterColonne('utilisateurs', 'totp_secret', 'VARCHAR(128) NULL');
    await ajouterColonne('utilisateurs', 'totp_actif', 'TINYINT(1) NOT NULL DEFAULT 0');
    await ajouterColonne('utilisateurs', 'favoris', "JSON NULL");
    await ajouterColonne('parametres', 'totp_disponible', 'TINYINT(1) NOT NULL DEFAULT 1');
    await ajouterColonne('parametres', 'totp_obligatoire', 'TINYINT(1) NOT NULL DEFAULT 0');


    await ajouterColonne('tickets', 'assignees_users', 'JSON NULL');
    await ajouterColonne('tickets', 'assignees_roles', 'JSON NULL');
    try {
        await sequelize.query(`CREATE TABLE IF NOT EXISTS utilisateur_roles (
            id INT AUTO_INCREMENT PRIMARY KEY,
            id_user INT NOT NULL,
            id_role INT NOT NULL,
            created_at DATETIME NULL,
            updated_at DATETIME NULL,
            UNIQUE KEY uq_user_role (id_user, id_role)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`);
    } catch (e) { console.warn('[schema] utilisateur_roles', e.message); }

    console.log('[schema] Vérification des colonnes terminée.');
}

module.exports = { assurerColonnes };
