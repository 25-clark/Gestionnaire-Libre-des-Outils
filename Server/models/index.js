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
const Parametre = require('./Parametre')(sequelize);
const Journal = require('./Journal')(sequelize);
const OutilHistoriqueStatut = require('./OutilHistoriqueStatut')(sequelize);
const Notification = require('./Notification')(sequelize);
const Ticket = require('./Ticket')(sequelize);
const TicketMessage = require('./TicketMessage')(sequelize);
const TicketImage = require('./TicketImage')(sequelize);
const UtilisateurOutilCredential = require('./UtilisateurOutilCredential')(sequelize);
const SessionUtilisateur = require('./SessionUtilisateur')(sequelize);
const Delegation = require('./Delegation')(sequelize);
const DemandeAcces = require('./DemandeAcces')(sequelize);
const UtilisateurRole = require('./UtilisateurRole')(sequelize);

// ========================= ASSOCIATIONS =========================

// ---- Role <-> Utilisateur ----
Role.hasMany(Utilisateur, { foreignKey: 'id_role' });
Utilisateur.belongsTo(Role, { foreignKey: 'id_role' });
// Rôles multiples (table de liaison)
Utilisateur.belongsToMany(Role, { through: UtilisateurRole, foreignKey: 'id_user', otherKey: 'id_role', as: 'Roles' });
Role.belongsToMany(Utilisateur, { through: UtilisateurRole, foreignKey: 'id_role', otherKey: 'id_user', as: 'UtilisateursMulti' });
UtilisateurRole.belongsTo(Utilisateur, { foreignKey: 'id_user' });
UtilisateurRole.belongsTo(Role, { foreignKey: 'id_role' });

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

// ---- Outil <-> OutilHistoriqueStatut (historique de disponibilité) ----
Outil.hasMany(OutilHistoriqueStatut, { foreignKey: 'id_outil', as: 'historiqueStatuts' });
OutilHistoriqueStatut.belongsTo(Outil, { foreignKey: 'id_outil' });

// ---- Ticket : liens optionnels vers Outil / Activite / SousActivite ----
Ticket.belongsTo(Outil, { foreignKey: 'id_outil' });
Ticket.belongsTo(Activite, { foreignKey: 'id_activite' });
Ticket.belongsTo(SousActivite, { foreignKey: 'id_sous_activite' });
Ticket.belongsTo(Utilisateur, { foreignKey: 'id_createur', as: 'Createur' });
Ticket.belongsTo(Utilisateur, { foreignKey: 'id_assigne', as: 'Assigne' });

// ---- Ticket <-> TicketMessage (fil de discussion / messagerie) ----
Ticket.hasMany(TicketMessage, { foreignKey: 'id_ticket', as: 'messages' });
TicketMessage.belongsTo(Ticket, { foreignKey: 'id_ticket' });
TicketMessage.belongsTo(Utilisateur, { foreignKey: 'id_user', as: 'Auteur' });

// ---- Ticket <-> TicketImage (images jointes à l'ouverture) ----
Ticket.hasMany(TicketImage, { foreignKey: 'id_ticket', as: 'images' });
TicketImage.belongsTo(Ticket, { foreignKey: 'id_ticket' });


// ---- Credentials personnels (utilisateur × outil) ----
Utilisateur.hasMany(UtilisateurOutilCredential, { foreignKey: 'id_user', as: 'credentialsOutils' });
UtilisateurOutilCredential.belongsTo(Utilisateur, { foreignKey: 'id_user' });
Outil.hasMany(UtilisateurOutilCredential, { foreignKey: 'id_outil', as: 'credentialsUtilisateurs' });
UtilisateurOutilCredential.belongsTo(Outil, { foreignKey: 'id_outil' });

// Sessions / délégation / demandes d'accès
Utilisateur.hasMany(SessionUtilisateur, { foreignKey: 'id_user', as: 'Sessions' });
SessionUtilisateur.belongsTo(Utilisateur, { foreignKey: 'id_user' });
Utilisateur.hasMany(Delegation, { foreignKey: 'id_donneur', as: 'DelegationsDonnees' });
Utilisateur.hasMany(Delegation, { foreignKey: 'id_receveur', as: 'DelegationsRecues' });
Delegation.belongsTo(Utilisateur, { foreignKey: 'id_donneur', as: 'Donneur' });
Delegation.belongsTo(Utilisateur, { foreignKey: 'id_receveur', as: 'Receveur' });
Utilisateur.hasMany(DemandeAcces, { foreignKey: 'id_demandeur', as: 'DemandesAcces' });
DemandeAcces.belongsTo(Utilisateur, { foreignKey: 'id_demandeur', as: 'Demandeur' });
DemandeAcces.belongsTo(Utilisateur, { foreignKey: 'id_valideur', as: 'Valideur' });

module.exports = {
    UtilisateurRole,
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
    UtilisateurOutilCredential,
    SessionUtilisateur,
    Delegation,
    DemandeAcces
};
