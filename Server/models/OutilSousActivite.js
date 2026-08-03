const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const OutilSousActivite = sequelize.define('OutilSousActivite', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        id_outil: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'outils',
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
        }
    }, {
        tableName: 'outil_sous_activites',
        timestamps: true,
        underscored: true
    });

    return OutilSousActivite;
};
