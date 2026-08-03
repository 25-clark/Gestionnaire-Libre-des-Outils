const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const UtilisateurSousActivite = sequelize.define('UtilisateurSousActivite', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        id_user: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'utilisateurs',
                key: 'id'
            }
        },
        id_sous_activite: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'sous_activites',
                key: 'id'
            }
        },
        permissions: {
            type: DataTypes.JSON,
            allowNull: false,
            defaultValue: { read: true, write: false, delete: false }
        }
    }, {
        tableName: 'utilisateur_sous_activites',
        timestamps: true,
        underscored: true
    });

    return UtilisateurSousActivite;
};
