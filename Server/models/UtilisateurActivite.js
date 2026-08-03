const { DataTypes } = require('sequelize');

// Accès accordé par un admin à un utilisateur sur une activité qui n'est pas
// son activité principale. "permissions" précise le niveau accordé, ex :
// { read: true, write: true, delete: false }
module.exports = (sequelize) => {
    const UtilisateurActivite = sequelize.define('UtilisateurActivite', {
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
        id_activite: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'activites',
                key: 'id'
            }
        },
        permissions: {
            type: DataTypes.JSON,
            allowNull: false,
            defaultValue: { read: true, write: false, delete: false }
        }
    }, {
        tableName: 'utilisateur_activites',
        timestamps: true,
        underscored: true
    });

    return UtilisateurActivite;
};
