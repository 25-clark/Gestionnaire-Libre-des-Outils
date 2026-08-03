const { DataTypes } = require('sequelize');

// Une sous-activité appartient toujours à une activité racine (id_activite)
// et peut avoir un parent (id_parent) pour former une arborescence façon
// dossiers / sous-dossiers, à profondeur illimitée.
module.exports = (sequelize) => {
    const SousActivite = sequelize.define('SousActivite', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        nom: {
            type: DataTypes.STRING,
            allowNull: false
        },
        id_activite: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'activites',
                key: 'id'
            }
        },
        id_parent: {
            // null = sous-activité directement sous l'activité racine
            type: DataTypes.INTEGER,
            allowNull: true,
            references: {
                model: 'sous_activites',
                key: 'id'
            }
        }
    }, {
        tableName: 'sous_activites',
        timestamps: true,
        underscored: true
    });

    return SousActivite;
};
