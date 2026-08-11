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
        console.log('🔧 Désactivation des contraintes de clé étrangère...');
        await sequelize.query('SET FOREIGN_KEY_CHECKS = 0');

        console.log('🔄 Synchronisation de la base de données...');
        await sequelize.sync({ force: true });
        console.log('✅ Base de données synchronisée');

        console.log('🔧 Réactivation des contraintes de clé étrangère...');
        await sequelize.query('SET FOREIGN_KEY_CHECKS = 1');

        // ---------- Rôles ----------
        const permissionsCompletes = {
            utilisateurs: { read: true, create: true, update: true, delete: true },
            roles: { read: true, create: true, update: true, delete: true },
            activites: { read: true, create: true, update: true, delete: true },
            sous_activites: { read: true, create: true, update: true, delete: true },
            outils: { read: true, create: true, update: true, delete: true },
            acces: { read: true, create: true, update: true, delete: true }
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
                    acces: { read: true, create: false, update: false, delete: false }
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
                    acces: { read: true, create: false, update: false, delete: false }
                }
            }
        ]);
        console.log('✅ Rôles créés');

        // ---------- Paramètres généraux ----------
        const MOT_DE_PASSE_DEFAUT = 'Bienvenue123';
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
