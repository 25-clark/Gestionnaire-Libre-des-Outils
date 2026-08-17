const { Parametre, Utilisateur, Role, Activite, SousActivite } = require('../models');
const { hacher } = require('../utils/motDePasse');
const { consigner } = require('../utils/journal');
const ldap = require('../utils/ldap');

async function trouverOuCreerParametre() {
    const [parametre] = await Parametre.findOrCreate({ where: { id: 1 }, defaults: {} });
    return parametre;
}

// Config LDAP complète SAUF le mot de passe du compte technique, jamais
// renvoyé en clair au client — juste un booléen indiquant s'il est défini.
async function obtenirParametres(req, res, next) {
    try {
        const parametre = await trouverOuCreerParametre();
        const config = parametre.toJSON();
        const motDePasseDefini = !!config.ldap_bind_password;
        delete config.ldap_bind_password;
        delete config.mot_de_passe_defaut; // pas utile ici, on évite de le renvoyer par la même occasion

        res.json({ ...config, ldap_bind_password_defini: motDePasseDefini, ldapjs_disponible: ldap.estDisponible() });
    } catch (err) { next(err); }
}

async function mettreAJourParametres(req, res, next) {
    try {
        const parametre = await trouverOuCreerParametre();

        const champs = [
            'ldap_actif', 'ldap_url', 'ldap_bind_dn',
            'ldap_base_dn_utilisateurs', 'ldap_filtre_utilisateurs',
            'ldap_attribut_matricule', 'ldap_attribut_nom', 'ldap_attribut_prenom', 'ldap_role_par_defaut',
            'ldap_base_dn_groupes', 'ldap_filtre_groupes', 'ldap_attribut_groupe_nom', 'ldap_filtre_sous_groupes'
        ];
        const maj = {};
        for (const champ of champs) {
            if (req.body[champ] !== undefined) maj[champ] = req.body[champ] || null;
        }
        maj.ldap_actif = req.body.ldap_actif === true || req.body.ldap_actif === 'on' || req.body.ldap_actif === 'true';

        // Le mot de passe n'est remplacé que si un nouveau a été saisi
        // (champ laissé vide = on garde l'ancien, pour ne pas avoir à le
        // ressaisir à chaque modification des autres réglages).
        if (req.body.ldap_bind_password) {
            maj.ldap_bind_password = req.body.ldap_bind_password;
        }

        await parametre.update(maj);

        await consigner({
            user: req.currentUser,
            action: 'modification',
            ressource: 'ldap',
            id_ressource: parametre.id,
            libelle: `Configuration LDAP modifiée par ${req.currentUser.prenom} ${req.currentUser.nom}`
        });

        res.json({ message: 'Configuration LDAP enregistrée.' });
    } catch (err) { next(err); }
}

async function tester(req, res, next) {
    try {
        const parametre = await trouverOuCreerParametre();
        const resultat = await ldap.testerConnexion(parametre);
        res.json(resultat);
    } catch (err) {
        res.status(400).json({ ok: false, message: err.message });
    }
}

async function importerUtilisateurs(req, res, next) {
    try {
        const parametre = await trouverOuCreerParametre();
        const utilisateursLdap = await ldap.rechercherUtilisateursLdap(parametre);

        const role = (parametre.ldap_role_par_defaut && await Role.findOne({ where: { nom: parametre.ldap_role_par_defaut } }))
            || await Role.findOne({ order: [['id', 'ASC']] });

        if (!role) {
            return res.status(400).json({ message: "Aucun rôle disponible pour attribuer les comptes importés — créez au moins un rôle d'abord." });
        }

        let crees = 0, misAJour = 0, ignores = 0;
        for (const u of utilisateursLdap) {
            if (!u.matricule) { ignores++; continue; }

            const existant = await Utilisateur.findOne({ where: { matricule: u.matricule } });
            if (existant) {
                await existant.update({
                    nom: u.nom || existant.nom,
                    prenom: u.prenom || existant.prenom
                });
                misAJour++;
            } else {
                await Utilisateur.create({
                    matricule: u.matricule,
                    nom: u.nom || '(sans nom)',
                    prenom: u.prenom || '(sans prénom)',
                    id_role: role.id,
                    mot_de_passe: hacher(parametre.mot_de_passe_defaut),
                    doit_changer_mdp: true
                });
                crees++;
            }
        }

        await consigner({
            user: req.currentUser,
            action: 'import_ldap',
            ressource: 'utilisateur',
            libelle: `Import LDAP des utilisateurs : ${crees} créé(s), ${misAJour} mis à jour, ${ignores} ignoré(s)`
        });

        res.json({ crees, misAJour, ignores, total: utilisateursLdap.length });
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
}

// Groupes racine -> Activités ; sous-groupes de chacun -> Sous-activités.
// Les groupes/activités déjà existants (même nom) sont laissés tels quels
// (pas d'écrasement d'une activité existante configurée manuellement).
async function importerActivites(req, res, next) {
    try {
        const parametre = await trouverOuCreerParametre();
        const groupesLdap = await ldap.rechercherGroupesLdap(parametre);

        let activitesCreees = 0, activitesIgnorees = 0, sousActivitesCreees = 0, sousActivitesIgnorees = 0;

        for (const g of groupesLdap) {
            let activite = await Activite.findOne({ where: { nom: g.nom } });
            if (!activite) {
                activite = await Activite.create({
                    nom: g.nom,
                    abbreviation: g.nom.replace(/[^a-zA-Z0-9]/g, '').substring(0, 8).toUpperCase() || 'LDAP',
                    id_user: req.currentUser.id
                });
                activitesCreees++;
            } else {
                activitesIgnorees++;
            }

            for (const nomSousGroupe of g.sousGroupes || []) {
                const existante = await SousActivite.findOne({ where: { nom: nomSousGroupe, id_activite: activite.id } });
                if (existante) { sousActivitesIgnorees++; continue; }
                await SousActivite.create({ nom: nomSousGroupe, id_activite: activite.id, id_parent: null });
                sousActivitesCreees++;
            }
        }

        await consigner({
            user: req.currentUser,
            action: 'import_ldap',
            ressource: 'activite',
            libelle: `Import LDAP des activités : ${activitesCreees} activité(s) créée(s), ${sousActivitesCreees} sous-activité(s) créée(s)`
        });

        res.json({
            activitesCreees, activitesIgnorees,
            sousActivitesCreees, sousActivitesIgnorees,
            totalGroupes: groupesLdap.length
        });
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
}

module.exports = { obtenirParametres, mettreAJourParametres, tester, importerUtilisateurs, importerActivites };
