-- Migration manuelle optionnelle — le serveur ajoute aussi ces colonnes au démarrage.
-- MySQL 8.0.29+ pour IF NOT EXISTS ; sinon utiliser : npm run migrate

ALTER TABLE `outils` ADD COLUMN `credentials` JSON NULL;

ALTER TABLE `utilisateurs` ADD COLUMN `email` VARCHAR(255) NULL;
ALTER TABLE `utilisateurs` ADD COLUMN `telephone` VARCHAR(30) NULL;
ALTER TABLE `utilisateurs` ADD COLUMN `autres_contacts` JSON NULL;
ALTER TABLE `utilisateurs` ADD COLUMN `fonction` VARCHAR(255) NULL;
ALTER TABLE `utilisateurs` ADD COLUMN `adresse` TEXT NULL;
ALTER TABLE `utilisateurs` ADD COLUMN `preferences` JSON NULL;

ALTER TABLE `parametres` ADD COLUMN `credentials_actifs` TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE `parametres` ADD COLUMN `credentials` JSON NULL;
ALTER TABLE `parametres` ADD COLUMN `installation_terminee` TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE `parametres` ADD COLUMN `cgu_acceptees_le` DATETIME NULL;
