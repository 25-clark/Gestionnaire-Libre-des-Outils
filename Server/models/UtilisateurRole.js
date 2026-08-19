const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const UtilisateurRole = sequelize.define('UtilisateurRole', {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        id_user: { type: DataTypes.INTEGER, allowNull: false },
        id_role: { type: DataTypes.INTEGER, allowNull: false }
    }, {
        tableName: 'utilisateur_roles',
        timestamps: true,
        underscored: true
    });
    return UtilisateurRole;
};
