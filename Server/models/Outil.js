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
        // IP ou nom d'hôte de l'outil, optionnel — utilisé pour les tests
        // réseau (ping, traceroute, nslookup...), voir diagnosticController.js.
        adresse: {
            type: DataTypes.STRING,
            allowNull: true
        },
        // Résultat de la surveillance automatique périodique (voir
        // utils/surveillance.js) : 'inconnu' tant qu'aucune adresse n'est
        // renseignée ou qu'aucun cycle n'a encore eu lieu.
        dernier_statut: {
            type: DataTypes.STRING,
            allowNull: false,
            defaultValue: 'inconnu' // 'inconnu' | 'en_ligne' | 'hors_ligne'
        },
        derniere_verification: {
            type: DataTypes.DATE,
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
        },
        // Credentials de l'outil (login, mot de passe, champs libres).
        // Format : [ { label, valeur } ] — les *valeurs* sont chiffrées AES-256-GCM
        // au repos (voir utils/credentialsCrypto.js). Les libellés restent en clair.
        credentials: {
            type: DataTypes.JSON,
            allowNull: true,
            defaultValue: []
        }
    }, {
        tableName: 'outils',
        timestamps: true,
        underscored: true
    });

    return Outil;
};
