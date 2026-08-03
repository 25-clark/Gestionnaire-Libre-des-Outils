const { DataTypes } = require('sequelize');

// Pas de mise à jour de nom/prénom : en cas d'erreur, on supprime et on recrée
// l'utilisateur (cf. consigne métier). Le champ "id_activite" est l'activité
// principale de l'utilisateur ; des accès supplémentaires (à d'autres activités
// ou sous-activités) sont gérés via les tables pivot UtilisateurActivite /
// UtilisateurSousActivite.
module.exports = (sequelize) => {
    const Utilisateur = sequelize.define('Utilisateur', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        matricule: {
            // format attendu : 0000.prenom
            type: DataTypes.STRING(30),
            allowNull: false,
            unique: true
        },
        nom: {
            type: DataTypes.STRING,
            allowNull: false
        },
        prenom: {
            type: DataTypes.STRING,
            allowNull: false
        },
        id_activite: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: {
                model: 'activites',
                key: 'id'
            }
        },
        id_role: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'roles',
                key: 'id'
            }
        }
    }, {
        tableName: 'utilisateurs',
        timestamps: true,
        underscored: true
    });

    return Utilisateur;
};
