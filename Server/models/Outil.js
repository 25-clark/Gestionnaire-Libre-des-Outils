const { DataTypes } = require('sequelize');

// Un outil appartient à un seul propriétaire (id_user) mais peut être rattaché
// à plusieurs activités et/ou sous-activités (relations many-to-many, voir
// OutilActivite / OutilSousActivite dans index.js).
// Pas de modification possible : en cas d'erreur, on supprime et on recrée.
module.exports = (sequelize) => {
    const Outil = sequelize.define('Outil', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        nom: {
            type: DataTypes.STRING,
            allowNull: false
        },
        lien: {
            type: DataTypes.STRING,
            allowNull: true
        },
        active: {
            // false = désactivé (mais pas supprimé)
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true
        },
        image: {
            type: DataTypes.STRING,
            allowNull: true
        },
        id_user: {
            // propriétaire unique de l'outil
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'utilisateurs',
                key: 'id'
            }
        }
    }, {
        tableName: 'outils',
        timestamps: true,
        underscored: true
    });

    return Outil;
};
