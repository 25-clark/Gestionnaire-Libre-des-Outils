const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    return sequelize.define('DemandeAcces', {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        id_demandeur: { type: DataTypes.INTEGER, allowNull: false },
        type_cible: {
            type: DataTypes.ENUM('activite', 'sous_activite', 'outil'),
            allowNull: false
        },
        id_cible: { type: DataTypes.INTEGER, allowNull: false },
        message: { type: DataTypes.TEXT, allowNull: true },
        statut: {
            type: DataTypes.ENUM('en_attente', 'approuvee', 'refusee', 'annulee'),
            allowNull: false,
            defaultValue: 'en_attente'
        },
        id_valideur: { type: DataTypes.INTEGER, allowNull: true },
        reponse: { type: DataTypes.TEXT, allowNull: true },
        traite_le: { type: DataTypes.DATE, allowNull: true }
    }, {
        tableName: 'demandes_acces',
        underscored: true,
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at'
    });
};
