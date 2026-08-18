/**
 * Credentials personnels d'un utilisateur pour un outil donné.
 * Un enregistrement par couple (utilisateur, outil) — jamais partagé.
 */
module.exports = (sequelize) => {
    const { DataTypes } = require('sequelize');
    return sequelize.define('UtilisateurOutilCredential', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        id_user: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: { model: 'utilisateurs', key: 'id' }
        },
        id_outil: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: { model: 'outils', key: 'id' }
        },
        // [ { label, valeur } ] — valeurs chiffrées AES-256-GCM
        credentials: {
            type: DataTypes.JSON,
            allowNull: false,
            defaultValue: []
        }
    }, {
        tableName: 'utilisateur_outil_credentials',
        timestamps: true,
        underscored: true,
        indexes: [
            { unique: true, fields: ['id_user', 'id_outil'], name: 'uq_user_outil_creds' }
        ]
    });
};
