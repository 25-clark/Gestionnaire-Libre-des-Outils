const sequelize = require('../config/database');

const Role = require('./Role')(sequelize);
const Utilisateur = require('./Utilisateur')(sequelize);
const Activite = require('./Activite')(sequelize);
const SousActivite = require('./SousActivite')(sequelize);
const Outil = require('./Outil')(sequelize);
const UtilisateurActivite = require('./UtilisateurActivite')(sequelize);
const UtilisateurSousActivite = require('./UtilisateurSousActivite')(sequelize);
const OutilActivite = require('./OutilActivite')(sequelize);
const OutilSousActivite = require('./OutilSousActivite')(sequelize);

// ========================= ASSOCIATIONS =========================

// ---- Role <-> Utilisateur ----
Role.hasMany(Utilisateur, { foreignKey: 'id_role' });
Utilisateur.belongsTo(Role, { foreignKey: 'id_role' });

// ---- Utilisateur <-> Activite (création) ----
// Une activité appartient à l'utilisateur qui l'a créée.
Utilisateur.hasMany(Activite, { foreignKey: 'id_user' });
Activite.belongsTo(Utilisateur, { foreignKey: 'id_user' });

// ---- Utilisateur <-> Activite (rattachement principal) ----
// Une activité peut avoir plusieurs utilisateurs rattachés directement.
Activite.hasMany(Utilisateur, { foreignKey: 'id_activite' });
Utilisateur.belongsTo(Activite, { foreignKey: 'id_activite' });

// ---- Activite <-> SousActivite ----
Activite.hasMany(SousActivite, { foreignKey: 'id_activite' });
SousActivite.belongsTo(Activite, { foreignKey: 'id_activite' });

// ---- SousActivite <-> SousActivite (arborescence, comme des dossiers) ----
SousActivite.hasMany(SousActivite, { foreignKey: 'id_parent', as: 'enfants' });
SousActivite.belongsTo(SousActivite, { foreignKey: 'id_parent', as: 'parent' });

// ---- Utilisateur <-> Outil (propriétaire) ----
Utilisateur.hasMany(Outil, { foreignKey: 'id_user' });
Outil.belongsTo(Utilisateur, { foreignKey: 'id_user' });

// ---- Outil <-> Activite (many-to-many) ----
// Un outil peut être visible dans une ou plusieurs activités.
// "unique: false" + uniqueKey court évitent le bug ER_TOO_LONG_IDENT en MySQL.
Outil.belongsToMany(Activite, {
    through: { model: OutilActivite, unique: false },
    foreignKey: 'id_outil',
    otherKey: 'id_activite',
    as: 'activites'
});
Activite.belongsToMany(Outil, {
    through: { model: OutilActivite, unique: false },
    foreignKey: 'id_activite',
    otherKey: 'id_outil',
    as: 'outils'
});

// ---- Outil <-> SousActivite (many-to-many) ----
Outil.belongsToMany(SousActivite, {
    through: { model: OutilSousActivite, unique: false },
    foreignKey: 'id_outil',
    otherKey: 'id_sous_activite',
    as: 'sousActivites'
});
SousActivite.belongsToMany(Outil, {
    through: { model: OutilSousActivite, unique: false },
    foreignKey: 'id_sous_activite',
    otherKey: 'id_outil',
    as: 'outils'
});

// ---- Utilisateur <-> Activite (accès supplémentaires accordés par l'admin) ----
Utilisateur.belongsToMany(Activite, {
    through: { model: UtilisateurActivite, unique: false },
    foreignKey: 'id_user',
    otherKey: 'id_activite',
    as: 'activitesAccessibles'
});
Activite.belongsToMany(Utilisateur, {
    through: { model: UtilisateurActivite, unique: false },
    foreignKey: 'id_activite',
    otherKey: 'id_user',
    as: 'utilisateursAvecAcces'
});

// ---- Utilisateur <-> SousActivite (accès supplémentaires accordés par l'admin) ----
Utilisateur.belongsToMany(SousActivite, {
    through: { model: UtilisateurSousActivite, unique: false },
    foreignKey: 'id_user',
    otherKey: 'id_sous_activite',
    as: 'sousActivitesAccessibles'
});
SousActivite.belongsToMany(Utilisateur, {
    through: { model: UtilisateurSousActivite, unique: false },
    foreignKey: 'id_sous_activite',
    otherKey: 'id_user',
    as: 'utilisateursAvecAcces'
});

// ---- Associations directes sur les tables pivot elles-mêmes ----
// belongsToMany (ci-dessus) ne crée PAS d'association directe entre la table
// pivot et les modèles source/cible. Ces belongsTo sont nécessaires pour
// pouvoir faire, par ex., UtilisateurActivite.findAll({ include: [Utilisateur, Activite] })
// (utilisé dans accesController pour lister/gérer les accès particuliers).
UtilisateurActivite.belongsTo(Utilisateur, { foreignKey: 'id_user' });
UtilisateurActivite.belongsTo(Activite, { foreignKey: 'id_activite' });

UtilisateurSousActivite.belongsTo(Utilisateur, { foreignKey: 'id_user' });
UtilisateurSousActivite.belongsTo(SousActivite, { foreignKey: 'id_sous_activite' });

OutilActivite.belongsTo(Outil, { foreignKey: 'id_outil' });
OutilActivite.belongsTo(Activite, { foreignKey: 'id_activite' });

OutilSousActivite.belongsTo(Outil, { foreignKey: 'id_outil' });
OutilSousActivite.belongsTo(SousActivite, { foreignKey: 'id_sous_activite' });

module.exports = {
    sequelize,
    Role,
    Utilisateur,
    Activite,
    SousActivite,
    Outil,
    UtilisateurActivite,
    UtilisateurSousActivite,
    OutilActivite,
    OutilSousActivite
};
