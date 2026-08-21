const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    return sequelize.define('Delegation', {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        id_donneur: { type: DataTypes.INTEGER, allowNull: false },
        id_receveur: { type: DataTypes.INTEGER, allowNull: false },
        date_debut: { type: DataTypes.DATE, allowNull: false },
        date_fin: { type: DataTypes.DATE, allowNull: false },
        perimetre: {
            type: DataTypes.JSON,
            allowNull: false,
            defaultValue: { tickets: true, acces: false }
        },
        motif: { type: DataTypes.STRING(500), allowNull: true },
        active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }
    }, {
        tableName: 'delegations',
        underscored: true,
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at'
    });
};
