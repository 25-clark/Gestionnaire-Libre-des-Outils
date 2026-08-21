const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    return sequelize.define('SessionUtilisateur', {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        id_user: { type: DataTypes.INTEGER, allowNull: false },
        sid: { type: DataTypes.STRING(255), allowNull: false },
        ip: { type: DataTypes.STRING(64), allowNull: true },
        user_agent: { type: DataTypes.STRING(500), allowNull: true },
        derniere_activite: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
        revoquee: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false }
    }, {
        tableName: 'sessions_utilisateurs',
        underscored: true,
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at'
    });
};
