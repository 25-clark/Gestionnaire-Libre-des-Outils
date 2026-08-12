const { DataTypes } = require('sequelize');

// Un message dans le fil de discussion d'un ticket — c'est la "messagerie"
// : chaque ticket a son propre fil, entre le créateur, l'assigné, et toute
// personne ayant accès en lecture au ticket.
module.exports = (sequelize) => {
    const TicketMessage = sequelize.define('TicketMessage', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        id_ticket: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        id_user: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        contenu: {
            type: DataTypes.TEXT,
            allowNull: false
        }
    }, {
        tableName: 'ticket_messages',
        timestamps: true,
        updatedAt: false,
        underscored: true
    });

    return TicketMessage;
};
