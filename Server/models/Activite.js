const { DataTypes } = require('sequelize');

// Une activité est un "dossier racine" : elle peut avoir des sous-activités,
// des utilisateurs et des outils. Contrairement aux utilisateurs et aux outils,
// l'activité (et ses sous-activités) PEUVENT être modifiées, car elles peuvent
// être liées à plusieurs utilisateurs/outils.
module.exports = (sequelize) => {
    const Activite = sequelize.define('Activite', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        nom: {
            type: DataTypes.STRING,
            allowNull: false
        },
        abbreviation: {
            type: DataTypes.STRING(10),
            allowNull: false
        },
        logo: {
            type: DataTypes.STRING,
            allowNull: true
        },
        id_user: {
            // créateur de l'activité
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'utilisateurs',
                key: 'id'
            }
        }
    }, {
        tableName: 'activites',
        timestamps: true,
        underscored: true
    });

    return Activite;
};
