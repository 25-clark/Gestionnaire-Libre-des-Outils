const { DataTypes } = require('sequelize');

// Journal d'événements (audit log) : trace les actions sensibles
// (connexions, créations/modifications/suppressions, changements de
// permissions...). Le matricule/nom de l'auteur sont dupliqués ici
// volontairement (dénormalisés) pour que l'historique reste lisible même
// si l'utilisateur est supprimé plus tard.
module.exports = (sequelize) => {
    const Journal = sequelize.define('Journal', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        id_user: {
            type: DataTypes.INTEGER,
            allowNull: true
        },
        matricule_user: {
            type: DataTypes.STRING,
            allowNull: true
        },
        nom_user: {
            type: DataTypes.STRING,
            allowNull: true
        },
        // ex: connexion, deconnexion, creation, modification, suppression,
        // reinitialisation_mdp, octroi_acces, revocation_acces
        action: {
            type: DataTypes.STRING,
            allowNull: false
        },
        // ex: auth, utilisateur, activite, sous_activite, outil, role, acces, parametre
        ressource: {
            type: DataTypes.STRING,
            allowNull: false
        },
        id_ressource: {
            type: DataTypes.INTEGER,
            allowNull: true
        },
        libelle: {
            type: DataTypes.STRING,
            allowNull: false
        }
    }, {
        tableName: 'journal',
        // Un journal d'événements ne se modifie jamais après coup : seul
        // createdAt nous intéresse.
        timestamps: true,
        updatedAt: false,
        underscored: true
    });

    return Journal;
};
