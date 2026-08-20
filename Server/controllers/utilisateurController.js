const { Utilisateur, Role, Activite, Outil, Parametre, Journal, sequelize, UtilisateurRole } = require('../models');
const { isAdmin, getIdsActivitesAccessibles } = require('../middlewares/auth');
const { hacher } = require('../utils/motDePasse');
const { consigner } = require('../utils/journal');
const { notifier } = require('../utils/notification');

// Renvoie le mot de passe par défaut configuré dans les réglages généraux
// (créé automatiquement s'il n'existe pas encore).
function normaliserPreferences(prefs) {
    if (!prefs) return { theme: 'clair', langue: 'fr', auth_code_actif: false };
    if (typeof prefs === 'string') {
        try { prefs = JSON.parse(prefs); } catch { return { theme: 'clair', langue: 'fr', auth_code_actif: false }; }
    }
    if (typeof prefs !== 'object') return { theme: 'clair', langue: 'fr', auth_code_actif: false };
    const theme = ['clair', 'sombre', 'auto'].includes(prefs.theme) ? prefs.theme : 'clair';
    const langue = ['fr', 'en'].includes(prefs.langue) ? prefs.langue : 'fr';
    const auth_code_actif = prefs.auth_code_actif === true || prefs.auth_code_actif === 'true' || prefs.auth_code_actif === '1' || prefs.auth_code_actif === 1;
    return { theme, langue, auth_code_actif };
}

async function motDePasseDefautActuel() {
    const [parametre] = await Parametre.findOrCreate({ where: { id: 1 }, defaults: {} });
    return parametre.mot_de_passe_defaut;
}

async function getAll(req, res, next) {
    try {
        const where = {};

        // Filtre optionnel par activité, ex: GET /api/utilisateurs?id_activite=3
        if (req.query.id_activite) {
            if (!isAdmin(req.currentUser)) {
                const idsAccessibles = await getIdsActivitesAccessibles(req.currentUser);
                if (!idsAccessibles.includes(parseInt(req.query.id_activite, 10))) {
                    return res.status(403).json({ message: "Vous n'avez pas accès à cette activité." });
                }
            }
            where.id_activite = req.query.id_activite;
        } else if (!isAdmin(req.currentUser)) {
            // Pas de filtre demandé explicitement : un utilisateur non admin ne
            // doit voir que les utilisateurs des activités auxquelles il a accès.
            const idsAccessibles = await getIdsActivitesAccessibles(req.currentUser);
            where.id_activite = idsAccessibles;
        }

        let utilisateurs = await Utilisateur.findAll({
            where,
            include: [{ model: Role }, { model: Activite }],
            order: [['nom', 'ASC']]
        });

        // Recherche libre par nom, prénom ou matricule, ex: ?q=dupont
        if (req.query.q) {
            const terme = req.query.q.trim().toLowerCase();
            utilisateurs = utilisateurs.filter(u =>
                u.nom.toLowerCase().includes(terme) ||
                u.prenom.toLowerCase().includes(terme) ||
                u.matricule.toLowerCase().includes(terme)
            );
        }

        // Dernière connexion (utile pour repérer les comptes inactifs),
        // calculée à partir du Journal plutôt que stockée en doublon sur
        // Utilisateur — une seule requête groupée pour toute la liste.
        const ids = utilisateurs.map(u => u.id);
        let dernieresConnexions = new Map();
        if (ids.length) {
            const lignes = await Journal.findAll({
                attributes: ['id_user', [sequelize.fn('MAX', sequelize.col('createdAt')), 'derniere']],
                where: { action: 'connexion', id_user: ids },
                group: ['id_user'],
                raw: true
            });
            dernieresConnexions = new Map(lignes.map(l => [l.id_user, l.derniere]));
        }

        const resultat = utilisateurs.map(u => {
            const json = u.toJSON();
            json.derniere_connexion = dernieresConnexions.get(u.id) || null;
            return json;
        });

        res.json(resultat);
    } catch (err) { next(err); }
}

async function getById(req, res, next) {
    try {
        const utilisateur = await Utilisateur.findByPk(req.params.id, {
            include: [
                { model: Role },
                { model: Role, as: 'Roles' },
                { model: Activite },
                { model: Outil }
            ]
        });
        if (!utilisateur) return res.status(404).json({ message: 'Utilisateur introuvable.' });
        const json = utilisateur.toJSON();
        json.preferences = normaliserPreferences(json.preferences);
        delete json.mot_de_passe;
        delete json.totp_secret;
        res.json(json);
    } catch (err) { next(err); }
}

async function create(req, res, next) {
    try {
        const { matricule, nom, prenom, id_activite, id_role } = req.body;

        if (!matricule || !nom || !prenom || !id_role) {
            return res.status(400).json({ message: 'Matricule, nom, prénom et rôle sont requis.' });
        }

        const mot_de_passe_defaut = await motDePasseDefautActuel();

        const utilisateur = await Utilisateur.create({
            matricule,
            nom,
            prenom,
            id_activite: id_activite || null,
            id_role,
            mot_de_passe: hacher(mot_de_passe_defaut),
            doit_changer_mdp: true
        });

        const utilisateurComplet = await Utilisateur.findByPk(utilisateur.id, {
            include: [{ model: Role }, { model: Activite }]
        });

        await consigner({
            user: req.currentUser,
            action: 'creation',
            ressource: 'utilisateur',
            id_ressource: utilisateur.id,
            libelle: `Utilisateur ${prenom} ${nom} (${matricule}) créé`
        });

        res.status(201).json(utilisateurComplet);
    } catch (err) {
        if (err.name === 'SequelizeUniqueConstraintError') {
            return res.status(409).json({ message: 'Ce matricule existe déjà.' });
        }
        next(err);
    }
}

// Volontairement PAS de update() : selon la règle métier, en cas d'erreur sur
// un utilisateur (nom/prénom), on le supprime et on le recrée.

// Remet le mot de passe d'un utilisateur à la valeur par défaut et le force
// à le changer à la prochaine connexion (cas "j'ai oublié mon mot de passe").
async function reinitialiserMotDePasse(req, res, next) {
    try {
        const utilisateur = await Utilisateur.findByPk(req.params.id);
        if (!utilisateur) return res.status(404).json({ message: 'Utilisateur introuvable.' });

        const mot_de_passe_defaut = await motDePasseDefautActuel();

        await utilisateur.update({
            mot_de_passe: hacher(mot_de_passe_defaut),
            doit_changer_mdp: true,
            // Une réinitialisation par un admin est aussi l'occasion de
            // débloquer le compte s'il l'était suite à des échecs répétés.
            tentatives_echouees: 0,
            bloque_jusqu_a: null
        });

        await consigner({
            user: req.currentUser,
            action: 'reinitialisation_mdp',
            ressource: 'utilisateur',
            id_ressource: utilisateur.id,
            libelle: `Mot de passe de ${utilisateur.prenom} ${utilisateur.nom} (${utilisateur.matricule}) réinitialisé par ${req.currentUser.prenom} ${req.currentUser.nom}`
        });

        await notifier({
            id_user: utilisateur.id,
            type: 'alerte',
            message: 'Votre mot de passe a été réinitialisé par un administrateur. Vous devrez le changer à votre prochaine connexion.'
        });

        res.json({ message: 'Mot de passe réinitialisé à la valeur par défaut.' });
    } catch (err) { next(err); }
}

async function remove(req, res, next) {
    try {
        const utilisateur = await Utilisateur.findByPk(req.params.id);
        if (!utilisateur) return res.status(404).json({ message: 'Utilisateur introuvable.' });

        const { prenom, nom, matricule } = utilisateur;
        await utilisateur.destroy();

        await consigner({
            user: req.currentUser,
            action: 'suppression',
            ressource: 'utilisateur',
            id_ressource: req.params.id,
            libelle: `Utilisateur ${prenom} ${nom} (${matricule}) supprimé`
        });

        res.json({ message: 'Utilisateur supprimé.' });
    } catch (err) { next(err); }
}




// Mise à jour des champs de profil (email, téléphone, etc.) et préférences.
// L'utilisateur peut modifier son propre profil ; un admin peut modifier
// celui de n'importe quel utilisateur.
function peutModifierIdentite(user) {
    if (!user) return false;
    if (isAdmin(user)) return true;
    const perms = (user.Role && user.Role.permissions) ? user.Role.permissions : {};
    const profil = perms.profil || {};
    return !!(profil.update_identite || profil.update);
}

function peutModifierUtilisateurs(user) {
    if (!user) return false;
    if (isAdmin(user)) return true;
    const perms = (user.Role && user.Role.permissions) ? user.Role.permissions : {};
    const u = perms.utilisateurs || {};
    return !!u.update;
}

async function updateProfil(req, res, next) {
    try {
        const id = parseInt(req.params.id, 10);
        const soi = parseInt(req.currentUser.id, 10) === id;
        const adminOuGestionnaire = peutModifierUtilisateurs(req.currentUser);

        if (!soi && !adminOuGestionnaire) {
            return res.status(403).json({ message: 'Vous ne pouvez modifier que votre propre profil.' });
        }

        const utilisateur = await Utilisateur.findByPk(id);
        if (!utilisateur) return res.status(404).json({ message: 'Utilisateur introuvable.' });

        const data = {};
        const champsContact = ['email', 'telephone', 'fonction', 'adresse'];
        for (const champ of champsContact) {
            if (req.body[champ] !== undefined) data[champ] = req.body[champ] || null;
        }
        if (req.body.autres_contacts !== undefined) {
            let contacts = req.body.autres_contacts;
            if (!Array.isArray(contacts)) {
                contacts = contacts ? [String(contacts)] : [];
            }
            data.autres_contacts = contacts.map(x => String(x || '').trim()).filter(Boolean);
        }
        if (req.body.preferences && typeof req.body.preferences === 'object') {
            const base = normaliserPreferences(utilisateur.preferences);
            data.preferences = normaliserPreferences({ ...base, ...req.body.preferences });
        }

        // Identité : soi-même si permission profil.update_identite, ou gestionnaire
        const peutIdentite = adminOuGestionnaire || (soi && peutModifierIdentite(req.currentUser));
        if (peutIdentite) {
            if (req.body.nom !== undefined) data.nom = String(req.body.nom || '').trim();
            if (req.body.prenom !== undefined) data.prenom = String(req.body.prenom || '').trim();
            if (req.body.matricule !== undefined) {
                const mat = String(req.body.matricule || '').trim();
                if (mat) data.matricule = mat;
            }
        }

        // Rôle / activité : uniquement gestionnaire utilisateurs.update
        if (adminOuGestionnaire) {
            if (req.body.id_role !== undefined && req.body.id_role !== '') {
                data.id_role = parseInt(req.body.id_role, 10);
            }
            if (req.body.id_activite !== undefined) {
                data.id_activite = req.body.id_activite === '' || req.body.id_activite === null
                    ? null
                    : parseInt(req.body.id_activite, 10);
            }
        }

        try {
            await utilisateur.update(data);
        } catch (e) {
            if (e.name === 'SequelizeUniqueConstraintError') {
                return res.status(409).json({ message: 'Ce matricule existe déjà.' });
            }
            throw e;
        }

        // Rôles additionnels (table utilisateur_roles)
        if (adminOuGestionnaire && req.body.id_roles !== undefined) {
            let ids = req.body.id_roles;
            if (!Array.isArray(ids)) ids = ids ? [ids] : [];
            ids = ids.map(Number).filter(n => n > 0);
            // Exclure le rôle principal pour éviter le doublon
            const principal = data.id_role || utilisateur.id_role;
            ids = ids.filter(n => n !== principal);
            await UtilisateurRole.destroy({ where: { id_user: id } });
            for (const rid of ids) {
                await UtilisateurRole.create({ id_user: id, id_role: rid });
            }
        }

        const { Role } = require('../models');
        const fresh = await Utilisateur.findByPk(id, {
            include: [
                { model: Role, attributes: ['id', 'nom', 'abbreviation', 'permissions'] },
                { model: Role, as: 'Roles', attributes: ['id', 'nom', 'abbreviation'] },
                { model: Role, as: 'Roles', attributes: ['id', 'nom', 'abbreviation', 'permissions'] }
            ]
        });
        const json = fresh.toJSON();
        json.preferences = normaliserPreferences(json.preferences);
        delete json.mot_de_passe;
        delete json.totp_secret;
        res.json(json);
    } catch (err) { next(err); }
}

/** Mise à jour administrative d'un compte (alias explicite). */
async function update(req, res, next) {
    return updateProfil(req, res, next);
}





function normaliserFavoris(f) {
    if (!f) return { outils: [], activites: [] };
    if (typeof f === 'string') {
        try { f = JSON.parse(f); } catch { return { outils: [], activites: [] }; }
    }
    if (typeof f !== 'object') return { outils: [], activites: [] };
    return {
        outils: Array.isArray(f.outils) ? f.outils.map(Number).filter(n => n > 0) : [],
        activites: Array.isArray(f.activites) ? f.activites.map(Number).filter(n => n > 0) : []
    };
}

async function toggleFavori(req, res, next) {
    try {
        const id = parseInt(req.params.id, 10);
        const monId = parseInt(req.currentUser.id, 10);
        if (monId !== id && !isAdmin(req.currentUser)) {
            return res.status(403).json({ message: 'Action non autorisée.' });
        }
        const type = req.body.type;
        const id_cible = parseInt(req.body.id_cible, 10);
        if (!['outil', 'activite'].includes(type) || !id_cible) {
            return res.status(400).json({ message: 'type (outil|activite) et id_cible requis.' });
        }
        const user = await Utilisateur.findByPk(id);
        if (!user) return res.status(404).json({ message: 'Utilisateur introuvable.' });

        const fav = normaliserFavoris(user.favoris);
        const key = type === 'outil' ? 'outils' : 'activites';
        const idx = fav[key].indexOf(id_cible);
        let epingle = false;
        if (idx >= 0) {
            fav[key].splice(idx, 1);
            epingle = false;
        } else {
            fav[key] = [id_cible].concat(fav[key].filter(x => x !== id_cible)).slice(0, 50);
            epingle = true;
        }

        // Forcer la détection JSON Sequelize
        user.set('favoris', fav);
        user.changed('favoris', true);
        await user.save();

        res.json({ favoris: fav, epingle, type, id_cible });
    } catch (err) { next(err); }
}

async function getFavoris(req, res, next) {
    try {
        const id = parseInt(req.params.id, 10);
        const monId = parseInt(req.currentUser.id, 10);
        if (monId !== id && !isAdmin(req.currentUser)) {
            return res.status(403).json({ message: 'Action non autorisée.' });
        }
        const user = await Utilisateur.findByPk(id);
        if (!user) return res.status(404).json({ message: 'Utilisateur introuvable.' });
        res.json(normaliserFavoris(user.favoris));
    } catch (err) { next(err); }
}

module.exports = { getAll, getById, create, remove, reinitialiserMotDePasse, updateProfil, update, toggleFavori, getFavoris };

