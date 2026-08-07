const { DataTypes } = require('sequelize');

// Réglages généraux de l'application. Une seule ligne existe toujours (id: 1)
// — cf. parametreController.js qui la crée si besoin (findOrCreate).
//
// mot_de_passe_defaut : stocké en clair volontairement (pas haché). C'est un
// mot de passe temporaire connu de l'admin, communiqué aux nouveaux
// utilisateurs / utilisé lors d'une réinitialisation — il doit rester lisible
// pour pouvoir être communiqué. Il n'est jamais utilisé pour authentifier
// directement (voir Utilisateur.mot_de_passe, qui lui est haché).
module.exports = (sequelize) => {
    const Parametre = sequelize.define('Parametre', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        nom_entreprise: {
            type: DataTypes.STRING,
            allowNull: true,
            defaultValue: null
        },
        mot_de_passe_defaut: {
            type: DataTypes.STRING,
            allowNull: false,
            defaultValue: 'Bienvenue123'
        }
    }, {
        tableName: 'parametres',
        timestamps: true,
        underscored: true
    });

    return Parametre;
};
