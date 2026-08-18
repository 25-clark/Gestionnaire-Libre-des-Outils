const { DataTypes } = require('sequelize');

// Pas de mise à jour de nom/prénom : en cas d'erreur, on supprime et on recrée
// l'utilisateur (cf. consigne métier). Le champ "id_activite" est l'activité
// principale de l'utilisateur ; des accès supplémentaires (à d'autres activités
// ou sous-activités) sont gérés via les tables pivot UtilisateurActivite /
// UtilisateurSousActivite.
module.exports = (sequelize) => {
    const Utilisateur = sequelize.define('Utilisateur', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        matricule: {
            // format attendu : 0000.prenom
            type: DataTypes.STRING(30),
            allowNull: false,
            unique: true
        },
        nom: {
            type: DataTypes.STRING,
            allowNull: false
        },
        prenom: {
            type: DataTypes.STRING,
            allowNull: false
        },
        id_activite: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: {
                model: 'activites',
                key: 'id'
            }
        },
        id_role: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'roles',
                key: 'id'
            }
        },
        // Haché (voir utils/motDePasse.js), jamais stocké en clair.
        mot_de_passe: {
            type: DataTypes.STRING,
            allowNull: false
        },
        // true tant que l'utilisateur n'a pas personnalisé son mot de passe
        // par défaut (à la création ou après une réinitialisation par un
        // admin) : force le changement immédiat à la prochaine connexion.
        doit_changer_mdp: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true
        },
        // Anti-brute-force par compte (voir authController.js) : incrémenté à
        // chaque mot de passe erroné, remis à zéro à la première connexion
        // réussie. Persisté en base (contrairement au compteur par IP, qui
        // lui est en mémoire) pour survivre à un redémarrage du serveur.
        tentatives_echouees: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0
        },
        // Date jusqu'à laquelle ce compte est bloqué suite à trop d'échecs
        // (null = pas bloqué).
        bloque_jusqu_a: {
            type: DataTypes.DATE,
            allowNull: true
        },
        // ---- Profil enrichi ----
        email: {
            type: DataTypes.STRING,
            allowNull: true
        },
        telephone: {
            type: DataTypes.STRING(30),
            allowNull: true
        },
        autres_contacts: {
            // Tableau de chaînes (ex. ["Teams: @jean", "Slack: #ops"])
            type: DataTypes.JSON,
            allowNull: true,
            defaultValue: []
        },
        fonction: {
            type: DataTypes.STRING,
            allowNull: true
        },
        adresse: {
            type: DataTypes.TEXT,
            allowNull: true
        },
        // Préférences de compte (thème, langue, etc.) stockées en JSON
        totp_secret: {
            type: DataTypes.STRING(128),
            allowNull: true
        },
        totp_actif: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false
        },
        favoris: {
            type: DataTypes.JSON,
            allowNull: true,
            defaultValue: { outils: [], activites: [] }
        },
        preferences: {
            type: DataTypes.JSON,
            allowNull: true,
            defaultValue: { theme: 'clair', langue: 'fr' }
        }
    }, {
        tableName: 'utilisateurs',
        timestamps: true,
        underscored: true,
        // Exclut mot_de_passe (haché) de TOUTES les lectures par défaut, y
        // compris via include: [{ model: Utilisateur }] ailleurs dans l'app —
        // pas besoin de le faire manuellement à chaque contrôleur.
        defaultScope: {
            attributes: { exclude: ['mot_de_passe'] }
        },
        scopes: {
            // Réservé à la connexion et à la vérification de l'ancien mot de
            // passe (authController.js). Ne jamais renvoyer ce scope au client.
            avecMotDePasse: {}
        }
    });

    return Utilisateur;
};
