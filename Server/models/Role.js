const { DataTypes } = require('sequelize');

// Un rôle définit ce qu'un utilisateur peut faire globalement (CRUD par ressource).
// La structure de "permissions" est un objet du type :
// {
//   utilisateurs:   { read: true, create: true, update: true, delete: true },
//   roles:          { read: true, create: true, update: true, delete: true },
//   activites:      { read: true, create: true, update: true, delete: true },
//   sous_activites: { read: true, create: true, update: true, delete: true },
//   outils:         { read: true, create: true, update: true, delete: true },
//   acces:          { read: true, create: true, update: true, delete: true }
// }
module.exports = (sequelize) => {
    const Role = sequelize.define('Role', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        nom: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true
        },
        abbreviation: {
            type: DataTypes.STRING(10),
            allowNull: false,
            unique: true
        },
        permissions: {
            type: DataTypes.JSON,
            allowNull: false,
            defaultValue: {}
        }
    }, {
        tableName: 'roles',
        timestamps: true,
        underscored: true
    });

    return Role;
};
