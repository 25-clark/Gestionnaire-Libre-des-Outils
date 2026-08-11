const { DataTypes } = require('sequelize');

// Historique des changements de statut réseau d'un outil (en ligne / hors
// ligne), alimenté par la surveillance périodique automatique (voir
// Server/utils/surveillance.js). On n'enregistre qu'un CHANGEMENT d'état,
// pas chaque vérification individuelle, pour ne pas saturer la table sur
// un outil surveillé pendant des mois.
module.exports = (sequelize) => {
    const OutilHistoriqueStatut = sequelize.define('OutilHistoriqueStatut', {
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
        statut: {
            // 'en_ligne' | 'hors_ligne'
            type: DataTypes.STRING,
            allowNull: false
        }
    }, {
        tableName: 'outil_historique_statuts',
        timestamps: true,
        updatedAt: false,
        underscored: true
    });

    return OutilHistoriqueStatut;
};
