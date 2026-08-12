const { DataTypes } = require('sequelize');

// Images jointes à un ticket (illustration du problème). Ajoutées à la
// création uniquement (voir ticketController.js) — pas de gestion d'ajout
// après coup pour l'instant.
module.exports = (sequelize) => {
    const TicketImage = sequelize.define('TicketImage', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        id_ticket: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        chemin: {
            type: DataTypes.STRING,
            allowNull: false
        }
    }, {
        tableName: 'ticket_images',
        timestamps: true,
        updatedAt: false,
        underscored: true
    });

    return TicketImage;
};
