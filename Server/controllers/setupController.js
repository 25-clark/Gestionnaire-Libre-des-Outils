/**
 * Assistant de première installation (sans authentification tant que
 * installation_terminee === false).
 */
const { Parametre, Role, Utilisateur, Activite, SousActivite, Outil, sequelize } = require('../models');
const { hacher } = require('../utils/motDePasse');
const { assurerColonnes } = require('../utils/assurerColonnes');

async function parametre() {
    const [p] = await Parametre.findOrCreate({ where: { id: 1 }, defaults: {} });
    return p;
}

function installationDejaFaite(p) {
    return !!p.installation_terminee;
}

async function statut(req, res, next) {
    try {
        await assurerColonnes();
        const p = await parametre();
        const nbUsers = await Utilisateur.count();
        const nbRoles = await Role.count();
        // Installation déjà en place (données seed / ancienne version) :
        // on marque comme terminée pour ne pas bloquer l'accès.
        if (!p.installation_terminee && nbUsers > 0) {
            await p.update({
                installation_terminee: true,
                cgu_acceptees_le: p.cgu_acceptees_le || new Date()
            });
            p.installation_terminee = true;
        }
        res.json({
            installation_terminee: !!p.installation_terminee,
            cgu_acceptees: !!p.cgu_acceptees_le,
            ldap_actif: !!p.ldap_actif,
            mode_auth: p.ldap_actif ? 'ldap' : 'local',
            nb_utilisateurs: nbUsers,
            nb_roles: nbRoles,
            a_admin: nbUsers > 0
        });
    } catch (err) { next(err); }
}

async function accepterCgu(req, res, next) {
    try {
        const p = await parametre();
        if (installationDejaFaite(p)) {
            return res.status(400).json({ message: 'Installation déjà terminée.' });
        }
        if (!req.body.accepte) {
            return res.status(400).json({ message: 'Vous devez accepter les CGU.' });
        }
        await p.update({ cgu_acceptees_le: new Date() });
        res.json({ ok: true, etape: 'auth' });
    } catch (err) { next(err); }
}

async function choisirAuth(req, res, next) {
    try {
        const p = await parametre();
        if (installationDejaFaite(p)) {
            return res.status(400).json({ message: 'Installation déjà terminée.' });
        }
        if (!p.cgu_acceptees_le) {
            return res.status(400).json({ message: 'Acceptez d\'abord les CGU.' });
        }
        const mode = req.body.mode === 'ldap' ? 'ldap' : 'local';
        await p.update({ ldap_actif: mode === 'ldap' });
        res.json({ ok: true, mode_auth: mode, etape: 'dependances' });
    } catch (err) { next(err); }
}

async function creerRolesSiBesoin() {
    const count = await Role.count();
    if (count > 0) return Role.findAll();

    const permissionsCompletes = {
        utilisateurs: { read: true, create: true, update: true, delete: true },
        roles: { read: true, create: true, update: true, delete: true },
        activites: { read: true, create: true, update: true, delete: true },
        sous_activites: { read: true, create: true, update: true, delete: true },
        outils: { read: true, create: true, update: true, delete: true },
        acces: { read: true, create: true, update: true, delete: true },
        tickets: { read: true, create: true, update: true, delete: true },
        diagnostic: { read: true, create: true, update: true, delete: true },
        notifications: { read: true, create: true, update: true, delete: true },
        export: { read: true, create: true, update: true, delete: true },
        profil: { read: true, create: true, update: true, delete: true },
        partage: { read: true, create: true, update: true, delete: true },
        credentials: { read: true, create: true, update: true, delete: true },
        journal: { read: true, create: true, update: true, delete: true },
        onglets: { outils: true, archives: true, sous_activites: true, utilisateurs: true }
    };

    await Role.bulkCreate([
        { nom: 'Administrateur', abbreviation: 'ADMIN', permissions: permissionsCompletes },
        {
            nom: 'Agent', abbreviation: 'AGT',
            permissions: {
                utilisateurs: { read: true, create: false, update: false, delete: false },
                roles: { read: true, create: false, update: false, delete: false },
                activites: { read: true, create: false, update: false, delete: false },
                sous_activites: { read: true, create: false, update: false, delete: false },
                outils: { read: true, create: true, update: true, delete: false },
                acces: { read: true, create: false, update: false, delete: false },
                tickets: { read: true, create: true, update: true, delete: false },
                diagnostic: { read: true, create: true, update: false, delete: false },
                notifications: { read: true, create: true, update: true, delete: true },
                export: { read: true, create: true, update: false, delete: false },
                profil: { read: true, create: true, update: true, delete: false },
                partage: { read: true, create: true, update: false, delete: false },
                journal: { read: false, create: false, update: false, delete: false },
                credentials: { read: true, create: true, update: true, delete: false },
                onglets: { outils: true, archives: true, sous_activites: true, utilisateurs: true }
            }
        },
        {
            nom: 'Invité', abbreviation: 'INV',
            permissions: {
                utilisateurs: { read: true, create: false, update: false, delete: false },
                roles: { read: true, create: false, update: false, delete: false },
                activites: { read: true, create: false, update: false, delete: false },
                sous_activites: { read: true, create: false, update: false, delete: false },
                outils: { read: true, create: false, update: false, delete: false },
                acces: { read: true, create: false, update: false, delete: false },
                tickets: { read: true, create: true, update: false, delete: false },
                diagnostic: { read: true, create: false, update: false, delete: false },
                notifications: { read: true, create: true, update: true, delete: true },
                export: { read: false, create: false, update: false, delete: false },
                profil: { read: true, create: true, update: true, delete: false },
                partage: { read: false, create: false, update: false, delete: false },
                journal: { read: false, create: false, update: false, delete: false },
                credentials: { read: false, create: false, update: false, delete: false },
                onglets: { outils: true, archives: false, sous_activites: true, utilisateurs: false }
            }
        }
    ]);
    return Role.findAll();
}

async function creerAdmin(req, res, next) {
    try {
        const p = await parametre();
        if (installationDejaFaite(p)) {
            return res.status(400).json({ message: 'Installation déjà terminée.' });
        }
        if (!p.cgu_acceptees_le) {
            return res.status(400).json({ message: 'Acceptez d\'abord les CGU.' });
        }

        await creerRolesSiBesoin();
        const roleAdmin = await Role.findOne({ where: { abbreviation: 'ADMIN' } });
        if (!roleAdmin) {
            return res.status(500).json({ message: 'Rôle ADMIN introuvable.' });
        }

        const { matricule, nom, prenom, mot_de_passe } = req.body;
        if (!matricule || !nom || !prenom || !mot_de_passe) {
            return res.status(400).json({ message: 'Matricule, nom, prénom et mot de passe sont requis.' });
        }
        if (String(mot_de_passe).length < 6) {
            return res.status(400).json({ message: 'Mot de passe : 6 caractères minimum.' });
        }

        const existant = await Utilisateur.findOne({ where: { matricule } });
        if (existant) {
            return res.status(400).json({ message: 'Ce matricule existe déjà.' });
        }

        // Mot de passe par défaut système
        if (!p.mot_de_passe_defaut) {
            await p.update({ mot_de_passe_defaut: 'Bienvenue123' });
        }

        const admin = await Utilisateur.create({
            matricule,
            nom,
            prenom,
            id_role: roleAdmin.id,
            mot_de_passe: hacher(mot_de_passe),
            doit_changer_mdp: false,
            preferences: { theme: 'clair', langue: 'fr' }
        });

        res.status(201).json({
            ok: true,
            etape: 'donnees',
            admin: { id: admin.id, matricule: admin.matricule, nom: admin.nom, prenom: admin.prenom }
        });
    } catch (err) { next(err); }
}

async function creerDonneesDemo(req, res, next) {
    try {
        const p = await parametre();
        if (installationDejaFaite(p)) {
            return res.status(400).json({ message: 'Installation déjà terminée.' });
        }

        const roleAdmin = await Role.findOne({ where: { abbreviation: 'ADMIN' } });
        const admin = roleAdmin
            ? await Utilisateur.findOne({ where: { id_role: roleAdmin.id }, order: [['id', 'ASC']] })
            : null;
        if (!admin) {
            return res.status(400).json({ message: 'Créez d\'abord le compte administrateur.' });
        }

        const { nom_activite, abbreviation, nom_sous_activite, creer_demo } = req.body;
        if (!nom_activite || !String(nom_activite).trim()) {
            return res.status(400).json({ message: 'Le nom de l\'activité est requis.' });
        }

        const activite = await Activite.create({
            nom: String(nom_activite).trim(),
            abbreviation: (abbreviation && String(abbreviation).trim())
                || String(nom_activite).trim().slice(0, 6).toUpperCase(),
            id_user: admin.id
        });

        // Rattacher l'admin à cette activité
        await admin.update({ id_activite: activite.id });

        let sousActivite = null;
        let outil = null;
        const nomSA = nom_sous_activite && String(nom_sous_activite).trim();
        if (nomSA) {
            sousActivite = await SousActivite.create({
                nom: nomSA,
                id_activite: activite.id,
                id_parent: null
            });
        }

        // Outil exemple optionnel (case à cocher)
        if (creer_demo === true || creer_demo === 'on' || creer_demo === 'true' || creer_demo === 1) {
            outil = await Outil.create({
                nom: 'Outil exemple',
                lien: null,
                adresse: null,
                id_user: admin.id,
                credentials: []
            });
            await outil.setActivites([activite.id]);
            if (sousActivite) await outil.setSousActivites([sousActivite.id]);
        }

        res.json({
            ok: true,
            etape: 'terminer',
            activite: { id: activite.id, nom: activite.nom },
            sousActivite: sousActivite ? { id: sousActivite.id, nom: sousActivite.nom } : null,
            outil: outil ? { id: outil.id, nom: outil.nom } : null
        });
    } catch (err) { next(err); }
}

async function terminer(req, res, next) {
    try {
        const p = await parametre();
        if (installationDejaFaite(p)) {
            return res.json({ ok: true, deja: true });
        }
        const nbAdmin = await Utilisateur.count();
        if (nbAdmin < 1) {
            return res.status(400).json({ message: 'Créez au moins un compte administrateur.' });
        }
        await p.update({ installation_terminee: true });
        res.json({ ok: true, installation_terminee: true });
    } catch (err) { next(err); }
}

module.exports = {
    statut, accepterCgu, choisirAuth, creerAdmin, creerDonneesDemo, terminer
};
