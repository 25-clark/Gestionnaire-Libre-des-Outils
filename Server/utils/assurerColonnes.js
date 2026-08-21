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
    await ajouterColonne('parametres', 'sauvegarde_planifiee', 'TINYINT(1) NOT NULL DEFAULT 0');
    await ajouterColonne('parametres', 'sauvegarde_intervalle_heures', 'INT NOT NULL DEFAULT 24');
    await ajouterColonne('parametres', 'sauvegarde_dossier', 'VARCHAR(500) NULL');
    await ajouterColonne('parametres', 'journal_retention_jours', 'INT NOT NULL DEFAULT 90');
    await ajouterColonne('parametres', 'journal_nettoyage_actif', 'TINYINT(1) NOT NULL DEFAULT 0');
    await ajouterColonne('parametres', 'stats_publiques', 'TINYINT(1) NOT NULL DEFAULT 0');
    await ajouterColonne('parametres', 'rafraichissement_auto', 'TINYINT(1) NOT NULL DEFAULT 0');
    await ajouterColonne('parametres', 'rafraichissement_intervalle_min', 'INT NOT NULL DEFAULT 5');


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

    await ajouterColonne('parametres', 'mdp_expiration_jours', 'INT NOT NULL DEFAULT 0');
    await ajouterColonne('parametres', 'mdp_historique_count', 'INT NOT NULL DEFAULT 0');
    await ajouterColonne('parametres', 'rapport_planifie', 'TINYINT(1) NOT NULL DEFAULT 0');
    await ajouterColonne('parametres', 'rapport_intervalle_heures', 'INT NOT NULL DEFAULT 168');
    await ajouterColonne('parametres', 'rapport_emails', 'TEXT NULL');
    await ajouterColonne('utilisateurs', 'mot_de_passe_change_le', 'DATETIME NULL');
    await ajouterColonne('utilisateurs', 'mdp_historique', 'JSON NULL');

    try {
        await sequelize.query(`
            CREATE TABLE IF NOT EXISTS \`sessions_utilisateurs\` (
                \`id\` INT NOT NULL AUTO_INCREMENT,
                \`id_user\` INT NOT NULL,
                \`sid\` VARCHAR(255) NOT NULL,
                \`ip\` VARCHAR(64) NULL,
                \`user_agent\` VARCHAR(500) NULL,
                \`derniere_activite\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                \`revoquee\` TINYINT(1) NOT NULL DEFAULT 0,
                \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                \`updated_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (\`id\`),
                KEY \`idx_sess_user\` (\`id_user\`),
                KEY \`idx_sess_sid\` (\`sid\`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);
        console.log('[schema] Table sessions_utilisateurs OK');
    } catch (e) { console.warn('[schema] sessions_utilisateurs:', e.message); }

    try {
        await sequelize.query(`
            CREATE TABLE IF NOT EXISTS \`delegations\` (
                \`id\` INT NOT NULL AUTO_INCREMENT,
                \`id_donneur\` INT NOT NULL,
                \`id_receveur\` INT NOT NULL,
                \`date_debut\` DATETIME NOT NULL,
                \`date_fin\` DATETIME NOT NULL,
                \`perimetre\` JSON NOT NULL,
                \`motif\` VARCHAR(500) NULL,
                \`active\` TINYINT(1) NOT NULL DEFAULT 1,
                \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                \`updated_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (\`id\`),
                KEY \`idx_del_donneur\` (\`id_donneur\`),
                KEY \`idx_del_receveur\` (\`id_receveur\`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);
        console.log('[schema] Table delegations OK');
    } catch (e) { console.warn('[schema] delegations:', e.message); }

    try {
        await sequelize.query(`
            CREATE TABLE IF NOT EXISTS \`demandes_acces\` (
                \`id\` INT NOT NULL AUTO_INCREMENT,
                \`id_demandeur\` INT NOT NULL,
                \`type_cible\` ENUM('activite','sous_activite','outil') NOT NULL,
                \`id_cible\` INT NOT NULL,
                \`message\` TEXT NULL,
                \`statut\` ENUM('en_attente','approuvee','refusee','annulee') NOT NULL DEFAULT 'en_attente',
                \`id_valideur\` INT NULL,
                \`reponse\` TEXT NULL,
                \`traite_le\` DATETIME NULL,
                \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                \`updated_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (\`id\`),
                KEY \`idx_dem_demandeur\` (\`id_demandeur\`),
                KEY \`idx_dem_statut\` (\`statut\`)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);
        console.log('[schema] Table demandes_acces OK');
    } catch (e) { console.warn('[schema] demandes_acces:', e.message); }



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
