const { DataTypes } = require('sequelize');

// Ticket façon GLPI, volontairement simplifié : statut + priorité +
// assignation, sans catégories ni SLA. Lié optionnellement à un outil, une
// activité ou une sous-activité (aucun, un seul, ou plusieurs à la fois —
// utile par ex. pour signaler "cet outil, dans cette sous-activité").
module.exports = (sequelize) => {
    const Ticket = sequelize.define('Ticket', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        titre: {
            type: DataTypes.STRING,
            allowNull: false
        },
        description: {
            type: DataTypes.TEXT,
            allowNull: false
        },
        // ouvert | en_cours | resolu | ferme
        statut: {
            type: DataTypes.STRING,
            allowNull: false,
            defaultValue: 'ouvert'
        },
        // basse | normale | haute | urgente
        priorite: {
            type: DataTypes.STRING,
            allowNull: false,
            defaultValue: 'normale'
        },
        id_outil: { type: DataTypes.INTEGER, allowNull: true },
        id_activite: { type: DataTypes.INTEGER, allowNull: true },
        id_sous_activite: { type: DataTypes.INTEGER, allowNull: true },
        id_createur: { type: DataTypes.INTEGER, allowNull: false },
        id_assigne: { type: DataTypes.INTEGER, allowNull: true }
    }, {
        tableName: 'tickets',
        timestamps: true,
        underscored: true
    });

    return Ticket;
};
