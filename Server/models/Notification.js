const { DataTypes } = require('sequelize');

// Notifications in-app pour un utilisateur donné (pas d'email : ce projet
// n'a pas de serveur SMTP configuré — voir utils/notification.js pour une
// note sur comment brancher un envoi email plus tard si besoin).
module.exports = (sequelize) => {
    const Notification = sequelize.define('Notification', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        id_user: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        // info | succes | alerte — influence juste l'icône/couleur affichée.
        type: {
            type: DataTypes.STRING,
            allowNull: false,
            defaultValue: 'info'
        },
        message: {
            type: DataTypes.STRING,
            allowNull: false
        },
        // Lien interne optionnel (ex: /activites/3) vers lequel cliquer.
        lien: {
            type: DataTypes.STRING,
            allowNull: true
        },
        lu: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false
        }
    }, {
        tableName: 'notifications',
        timestamps: true,
        updatedAt: false,
        underscored: true
    });

    return Notification;
};
