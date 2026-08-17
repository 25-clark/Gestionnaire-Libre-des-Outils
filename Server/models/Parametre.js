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
        },
        // ---- Politique de mot de passe ----
        mdp_longueur_min: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 6
        },
        // Exige au moins une majuscule + une minuscule + un chiffre.
        mdp_complexite: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false
        },
        // ---- Anti-brute-force (voir authController.js / utils/limiteurIp.js) ----
        max_tentatives_connexion: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 5
        },
        duree_blocage_minutes: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 15
        },
        // ---- Session ----
        session_duree_heures: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 8
        },
        // ---- Surveillance réseau automatique (voir utils/surveillance.js) ----
        surveillance_active: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true
        },
        surveillance_intervalle_minutes: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 5
        },
        // ---- LDAP (voir utils/ldap.js) ----
        // ldap_bind_password : stocké en clair, comme mot_de_passe_defaut —
        // c'est un secret de service (compte technique), pas un mot de passe
        // utilisateur. Un vrai coffre-fort de secrets serait préférable en
        // production, mais hors de portée ici sans dépendance supplémentaire.
        ldap_actif: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
        ldap_url: { type: DataTypes.STRING, allowNull: true },
        ldap_bind_dn: { type: DataTypes.STRING, allowNull: true },
        ldap_bind_password: { type: DataTypes.STRING, allowNull: true },
        ldap_base_dn_utilisateurs: { type: DataTypes.STRING, allowNull: true },
        ldap_filtre_utilisateurs: { type: DataTypes.STRING, allowNull: true, defaultValue: '(objectClass=person)' },
        ldap_attribut_matricule: { type: DataTypes.STRING, allowNull: true, defaultValue: 'uid' },
        ldap_attribut_nom: { type: DataTypes.STRING, allowNull: true, defaultValue: 'sn' },
        ldap_attribut_prenom: { type: DataTypes.STRING, allowNull: true, defaultValue: 'givenName' },
        ldap_role_par_defaut: { type: DataTypes.STRING, allowNull: true },
        ldap_base_dn_groupes: { type: DataTypes.STRING, allowNull: true },
        ldap_filtre_groupes: { type: DataTypes.STRING, allowNull: true, defaultValue: '(objectClass=groupOfNames)' },
        ldap_attribut_groupe_nom: { type: DataTypes.STRING, allowNull: true, defaultValue: 'cn' },
        // Sous-groupes recherchés SOUS le DN de chaque groupe importé comme
        // activité, pour devenir ses sous-activités.
        ldap_filtre_sous_groupes: { type: DataTypes.STRING, allowNull: true, defaultValue: '(objectClass=groupOfNames)' }
    }, {
        tableName: 'parametres',
        timestamps: true,
        underscored: true
    });

    return Parametre;
};
