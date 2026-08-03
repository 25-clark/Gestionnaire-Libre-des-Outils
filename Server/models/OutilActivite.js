const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const OutilActivite = sequelize.define('OutilActivite', {
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
        id_activite: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'activites',
                key: 'id'
            }
        }
    }, {
        tableName: 'outil_activites',
        timestamps: true,
        underscored: true
    });

    return OutilActivite;
};
