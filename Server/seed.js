require('dotenv').config();
const {
    sequelize,
    Role,
    Utilisateur,
    Activite,
    SousActivite,
    Outil,
    UtilisateurSousActivite,
    Parametre
} = require('./models');
const { hacher } = require('./utils/motDePasse');

async function seed() {
    try {
        // On désactive les FK, on vide TOUTES les tables existantes, puis on
        // réactive les FK — le tout dans UNE SEULE transaction, pour forcer
        // Sequelize à garder la même connexion MySQL du début à la fin.
        // (Sans ça, sequelize.query() et sequelize.sync() peuvent piocher deux
        // connexions différentes dans le pool : le "SET FOREIGN_KEY_CHECKS=0"
        // passé sur l'une ne s'applique pas à l'autre, d'où l'erreur
        // ER_ROW_IS_REFERENCED_2 au DROP TABLE malgré la désactivation.)
        console.log('🔧 Suppression des tables existantes...');
        const transactionSuppression = await sequelize.transaction();
        try {
            await sequelize.query('SET FOREIGN_KEY_CHECKS = 0', { transaction: transactionSuppression });

            const tables = await sequelize.getQueryInterface().showAllTables({ transaction: transactionSuppression });
            for (const table of tables) {
                const nomTable = typeof table === 'string' ? table : table.tableName;
                await sequelize.query(`DROP TABLE IF EXISTS \`${nomTable}\``, { transaction: transactionSuppression });
            }

            await sequelize.query('SET FOREIGN_KEY_CHECKS = 1', { transaction: transactionSuppression });
            await transactionSuppression.commit();
        } catch (errSuppression) {
            await transactionSuppression.rollback().catch(() => {});
            throw errSuppression;
        }

        console.log('🔄 Création des tables...');
        // La base est maintenant vide : un sync() simple (sans force) suffit à
        // tout créer, sans aucun DROP donc aucun risque de conflit de FK.
        await sequelize.sync();
        console.log('✅ Base de données synchronisée');

        // ---------- Rôles ----------
        const permissionsCompletes = {
            utilisateurs: { read: true, create: true, update: true, delete: true },
            roles: { read: true, create: true, update: true, delete: true },
            activites: { read: true, create: true, update: true, delete: true },
            sous_activites: { read: true, create: true, update: true, delete: true },
            outils: { read: true, create: true, update: true, delete: true },
            acces: { read: true, create: true, update: true, delete: true },
            tickets: { read: true, create: true, update: true, delete: true },
            diagnostic: { read: true, create: true, update: true, delete: true },
            notifications: { read: true, create: true, update: true, delete: true },
            export: { read: true, create: true, update: true, delete: true },
            profil: { read: true, create: true, update: true, delete: true },
            partage: { read: true, create: true, update: true, delete: true },
            journal: { read: true, create: true, update: true, delete: true },
            onglets: { outils: true, archives: true, sous_activites: true, utilisateurs: true }
        };

        const roles = await Role.bulkCreate([
            { nom: 'Administrateur', abbreviation: 'ADMIN', permissions: permissionsCompletes },
            {
                nom: 'Agent',
                abbreviation: 'AGT',
                permissions: {
                    utilisateurs: { read: true, create: false, update: false, delete: false },
                    roles: { read: true, create: false, update: false, delete: false },
                    activites: { read: true, create: false, update: false, delete: false },
                    sous_activites: { read: true, create: false, update: false, delete: false },
                    outils: { read: true, create: true, update: true, delete: false },
                    acces: { read: true, create: false, update: false, delete: false },
                    // Un agent peut ouvrir des tickets, se les assigner et les
                    // traiter (changer statut/priorité), mais pas les supprimer.
                    tickets: { read: true, create: true, update: true, delete: false },
                    diagnostic: { read: true, create: true, update: false, delete: false },
                    notifications: { read: true, create: true, update: true, delete: true },
                    export: { read: true, create: true, update: false, delete: false },
                    profil: { read: true, create: true, update: true, delete: false },
                    // Un agent peut partager un outil qu'il possède/gère,
                    // mais pas révoquer le partage d'un autre.
                    partage: { read: true, create: true, update: false, delete: false },
                    journal: { read: false, create: false, update: false, delete: false },
                    onglets: { outils: true, archives: true, sous_activites: true, utilisateurs: true }
                }
            },
            {
                nom: 'Invité',
                abbreviation: 'INV',
                permissions: {
                    utilisateurs: { read: true, create: false, update: false, delete: false },
                    roles: { read: true, create: false, update: false, delete: false },
                    activites: { read: true, create: false, update: false, delete: false },
                    sous_activites: { read: true, create: false, update: false, delete: false },
                    outils: { read: true, create: false, update: false, delete: false },
                    acces: { read: true, create: false, update: false, delete: false },
                    // Un invité peut signaler un problème (ouvrir un ticket) et
                    // discuter dessus, mais pas le réassigner ni le supprimer.
                    tickets: { read: true, create: true, update: false, delete: false },
                    diagnostic: { read: true, create: false, update: false, delete: false },
                    notifications: { read: true, create: true, update: true, delete: true },
                    export: { read: false, create: false, update: false, delete: false },
                    profil: { read: true, create: true, update: true, delete: false },
                    partage: { read: false, create: false, update: false, delete: false },
                    journal: { read: false, create: false, update: false, delete: false },
                    // Un invité ne voit ni l'onglet Utilisateurs ni Archives
                    // par défaut, pour rester centré sur les outils du quotidien.
                    onglets: { outils: true, archives: false, sous_activites: true, utilisateurs: false }
                }
            }
        ]);
        console.log('✅ Rôles créés');

        // ---------- Paramètres généraux ----------
        const MOT_DE_PASSE_DEFAUT = 'GLO@2026';
        await Parametre.create({
            nom_entreprise: null,
            mot_de_passe_defaut: MOT_DE_PASSE_DEFAUT,
            // Politique de mot de passe : 6 caractères minimum, pas de
            // complexité exigée par défaut — ajustable depuis Réglages généraux.
            mdp_longueur_min: 6,
            mdp_complexite: false,
            // Anti-brute-force : 5 échecs -> blocage 15 minutes (par matricule
            // ET par IP, voir authController.js / utils/limiteurIp.js).
            max_tentatives_connexion: 5,
            duree_blocage_minutes: 15,
            // Durée de session : 8h, comme avant (désormais configurable).
            session_duree_heures: 8,
            // Surveillance réseau automatique : activée par défaut, cycle
            // toutes les 5 minutes (voir utils/surveillance.js).
            surveillance_active: true,
            surveillance_intervalle_minutes: 5
        });
        console.log(`✅ Paramètres créés (mot de passe par défaut : ${MOT_DE_PASSE_DEFAUT})`);

        const adminRole = roles.find(r => r.nom === 'Administrateur');
        const agentRole = roles.find(r => r.nom === 'Agent');

        // ---------- Utilisateurs ----------
        // id_activite laissé à null pour l'admin le temps de créer la 1ère activité,
        // on le rattachera juste après.
        const admin = await Utilisateur.create({
            matricule: '0000.admin',
            nom: 'Admin',
            prenom: 'System',
            id_role: adminRole.id,
            mot_de_passe: hacher(MOT_DE_PASSE_DEFAUT),
            doit_changer_mdp: true
        });
        console.log(`✅ Admin créé (matricule : 0000.admin, mot de passe : ${MOT_DE_PASSE_DEFAUT})`);

        // ---------- Activité ----------
        const activite = await Activite.create({
            nom: 'Maintenance Bâtiment',
            abbreviation: 'MAINT',
            logo: null,
            id_user: admin.id
        });
        console.log('✅ Activité créée');

        // ---------- Sous-activités (arborescence) ----------
        const electricite = await SousActivite.create({
            nom: 'Électricité',
            id_activite: activite.id,
            id_parent: null
        });
        const cablage = await SousActivite.create({
            nom: 'Câblage',
            id_activite: activite.id,
            id_parent: electricite.id
        });
        const plomberie = await SousActivite.create({
            nom: 'Plomberie',
            id_activite: activite.id,
            id_parent: null
        });
        console.log('✅ Sous-activités créées');

        // ---------- Agent rattaché à l'activité ----------
        const agent = await Utilisateur.create({
            matricule: '0001.dupont',
            nom: 'Dupont',
            prenom: 'Jean',
            id_activite: activite.id,
            id_role: agentRole.id,
            mot_de_passe: hacher(MOT_DE_PASSE_DEFAUT),
            doit_changer_mdp: true
        });
        console.log(`✅ Agent créé (matricule : 0001.dupont, mot de passe : ${MOT_DE_PASSE_DEFAUT})`);

        // ---------- Accès particulier de l'agent sur "Câblage" ----------
        await UtilisateurSousActivite.create({
            id_user: agent.id,
            id_sous_activite: cablage.id,
            permissions: { read: true, write: true, delete: false }
        });
        console.log('✅ Accès particulier accordé à l\'agent sur "Câblage"');

        // ---------- Outil ----------
        const outil = await Outil.create({
            nom: 'Tournevis électrique',
            lien: null,
            active: true,
            image: null,
            id_user: admin.id
        });
        await outil.setActivites([activite.id]);
        await outil.setSousActivites([cablage.id]);
        console.log('✅ Outil créé et rattaché à Câblage');

        console.log('🎉 Seed terminé avec succès !');
        process.exit(0);
    } catch (error) {
        console.error('❌ Erreur seed :', error);
        await sequelize.query('SET FOREIGN_KEY_CHECKS = 1');
        process.exit(1);
    }
}

seed();
