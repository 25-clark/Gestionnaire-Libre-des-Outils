const { Utilisateur, Role, SousActivite, UtilisateurActivite, UtilisateurSousActivite } = require('../models');

/**
 * Vérifie que l'utilisateur est connecté (session active) et attache
 * req.currentUser (avec son rôle) à la requête.
 */
async function requireAuth(req, res, next) {
    try {
        if (!req.session || !req.session.userId) {
            return res.status(401).json({ message: 'Non authentifié. Veuillez vous connecter.' });
        }

        const user = await Utilisateur.findByPk(req.session.userId, {
            include: [{ model: Role }]
        });

        if (!user) {
            req.session.destroy(() => {});
            return res.status(401).json({ message: 'Session invalide, veuillez vous reconnecter.' });
        }

        req.currentUser = user;
        next();
    } catch (err) {
        next(err);
    }
}

/**
 * Vérifie qu'un admin est bien admin (abbreviation "ADMIN"). Un admin
 * peut toujours tout faire, sans passer par le détail des permissions.
 */
function isAdmin(user) {
    return !!user && !!user.Role && user.Role.abbreviation === 'ADMIN';
}

/**
 * Normalise le champ "permissions" d'un rôle. Selon la version de MySQL /
 * du driver, une colonne JSON peut parfois revenir sous forme de chaîne
 * plutôt que d'objet déjà parsé : on gère les deux cas pour éviter des
 * refus d'accès silencieux et incompréhensibles.
 */
function normaliserPermissions(permissions) {
    if (!permissions) return {};
    if (typeof permissions === 'string') {
        try {
            return JSON.parse(permissions);
        } catch {
            return {};
        }
    }
    return permissions;
}

/**
 * Middleware générique : vérifie la permission globale (rôle) pour une
 * ressource et une action données. Ex : checkPermission('outils', 'create')
 * Un admin passe toujours.
 */
function checkPermission(resource, action) {
    return (req, res, next) => {
        const user = req.currentUser;

        if (!user || !user.Role) {
            return res.status(401).json({ message: 'Non authentifié.' });
        }

        if (isAdmin(user)) {
            return next();
        }

        const permissions = normaliserPermissions(user.Role.permissions);
        const resourcePerms = permissions[resource] || {};

        if (resourcePerms[action]) {
            return next();
        }

        const message = `Accès refusé : action "${action}" non autorisée sur "${resource}".`;

        // En dev, on donne un indice concret pour diagnostiquer rapidement
        // un rôle mal configuré (case à cocher oubliée, rôle non re-seedé...).
        if (process.env.NODE_ENV !== 'production') {
            console.warn(
                `[checkPermission] refusé pour ${user.matricule} (rôle "${user.Role.nom}") sur ${resource}.${action} — permissions actuelles :`,
                JSON.stringify(permissions[resource] || 'aucune entrée pour cette ressource')
            );
        }

        return res.status(403).json({ message });
    };
}

/**
 * Vérifie un accès particulier (superuser sur une activité/sous-activité
 * précise), accordé via UtilisateurActivite / UtilisateurSousActivite.
 * À utiliser en plus de checkPermission quand l'action porte sur une
 * activité/sous-activité qui n'est pas celle de l'utilisateur.
 *
 * niveau : "read" | "write" | "delete"
 */
function checkAccesActivite(niveau = 'write') {
    return async (req, res, next) => {
        try {
            const user = req.currentUser;
            if (isAdmin(user)) return next();

            const idActivite = parseInt(req.params.id_activite || req.params.id || req.body.id_activite, 10);

            if (user.id_activite === idActivite) {
                return next();
            }

            const acces = await UtilisateurActivite.findOne({
                where: { id_user: user.id, id_activite: idActivite }
            });

            const permissions = normaliserPermissions(acces && acces.permissions);
            if (permissions[niveau]) {
                return next();
            }

            return res.status(403).json({ message: "Vous n'avez pas accès à cette activité." });
        } catch (err) {
            next(err);
        }
    };
}

function checkAccesSousActivite(niveau = 'write') {
    return async (req, res, next) => {
        try {
            const user = req.currentUser;
            if (isAdmin(user)) return next();

            const idSousActivite = parseInt(req.params.id_sous_activite || req.params.id || req.body.id_sous_activite, 10);

            const acces = await UtilisateurSousActivite.findOne({
                where: { id_user: user.id, id_sous_activite: idSousActivite }
            });

            const permissions = normaliserPermissions(acces && acces.permissions);
            if (permissions[niveau]) {
                return next();
            }

            return res.status(403).json({ message: "Vous n'avez pas accès à cette sous-activité." });
        } catch (err) {
            next(err);
        }
    };
}

/**
 * Renvoie la liste des ids d'activités auxquelles un utilisateur a
 * effectivement accès : son activité principale (id_activite) + celles
 * accordées explicitement en accès particulier (UtilisateurActivite).
 * Un utilisateur non rattaché et sans accès accordé ne voit RIEN par
 * défaut — c'est un rôle qui doit lui donner accès aux outils, pas une
 * activité entière.
 *
 * Renvoie null pour un admin : signifie "aucune restriction" (accès à tout).
 */
async function getIdsActivitesAccessibles(user) {
    if (isAdmin(user)) return null;

    const ids = new Set();
    if (user.id_activite) ids.add(user.id_activite);

    const acces = await UtilisateurActivite.findAll({ where: { id_user: user.id } });
    acces.forEach((a) => ids.add(a.id_activite));

    return Array.from(ids);
}

/**
 * Middleware : vérifie que l'utilisateur a accès en lecture à l'activité
 * demandée (req.params.id). Un admin passe toujours. Bloque la simple
 * consultation d'une activité à laquelle l'utilisateur n'a pas été
 * explicitement rattaché (via son activité principale ou un accès
 * particulier accordé dans l'onglet "Utilisateurs"/"Accès").
 */
function checkAccesLectureActivite() {
    return async (req, res, next) => {
        try {
            const user = req.currentUser;
            if (isAdmin(user)) return next();

            const idsAccessibles = await getIdsActivitesAccessibles(user);
            const idDemande = parseInt(req.params.id, 10);

            if (idsAccessibles.includes(idDemande)) return next();

            return res.status(403).json({ message: "Vous n'avez pas accès à cette activité." });
        } catch (err) {
            next(err);
        }
    };
}

/**
 * Idem, mais pour une sous-activité : l'accès dépend de l'accès à son
 * activité racine (id_activite).
 */
function checkAccesLectureSousActivite() {
    return async (req, res, next) => {
        try {
            const user = req.currentUser;
            if (isAdmin(user)) return next();

            const sousActivite = await SousActivite.findByPk(req.params.id);
            if (!sousActivite) {
                return res.status(404).json({ message: 'Sous-activité introuvable.' });
            }

            const idsAccessibles = await getIdsActivitesAccessibles(user);
            if (idsAccessibles.includes(sousActivite.id_activite)) return next();

            return res.status(403).json({ message: "Vous n'avez pas accès à cette sous-activité." });
        } catch (err) {
            next(err);
        }
    };
}

/**
 * ============================================================
 * RÔLE + ACCÈS PARTICULIER : LES DEUX SE COMPLÈTENT (OR), PAS AND
 * ============================================================
 * Le rôle définit une capacité par défaut ("ce type d'utilisateur peut
 * modifier des activités"). L'accès particulier accorde une EXCEPTION
 * ciblée sur une activité/sous-activité précise, INDÉPENDAMMENT du rôle
 * ("cet utilisateur précis peut aussi modifier CETTE activité, même si
 * son rôle ne le permet pas en général"). C'est le fonctionnement
 * "superuser ponctuel" voulu : un admin peut débloquer une action pour
 * un équipier sur un seul périmètre, sans changer son rôle globalement.
 *
 * Autorise une action de modification/suppression sur une ACTIVITÉ si :
 * - admin, ou
 * - le rôle autorise l'action globalement ET l'utilisateur a accès (au
 *   moins en lecture) à cette activité, ou
 * - un accès particulier a été accordé sur CETTE activité précisément,
 *   avec le niveau requis (write pour update, delete pour delete).
 */
function checkActionActivite(action) {
    const niveauAcces = action === 'delete' ? 'delete' : 'write';

    return async (req, res, next) => {
        try {
            const user = req.currentUser;
            if (isAdmin(user)) return next();

            const idActivite = parseInt(req.params.id, 10);

            const permissions = normaliserPermissions(user.Role.permissions);
            const roleAutorise = !!(permissions.activites && permissions.activites[action]);

            if (roleAutorise) {
                const idsAccessibles = await getIdsActivitesAccessibles(user);
                if (idsAccessibles.includes(idActivite)) return next();
            }

            const acces = await UtilisateurActivite.findOne({ where: { id_user: user.id, id_activite: idActivite } });
            const accesPermissions = normaliserPermissions(acces && acces.permissions);
            if (accesPermissions[niveauAcces]) return next();

            return res.status(403).json({ message: `Accès refusé : action "${action}" non autorisée sur cette activité.` });
        } catch (err) {
            next(err);
        }
    };
}

/**
 * Idem pour une SOUS-ACTIVITÉ : le rôle autorise globalement + accès à
 * l'activité racine, OU un accès particulier ciblé sur cette sous-activité.
 */
function checkActionSousActivite(action) {
    const niveauAcces = action === 'delete' ? 'delete' : 'write';

    return async (req, res, next) => {
        try {
            const user = req.currentUser;
            if (isAdmin(user)) return next();

            const idSousActivite = parseInt(req.params.id, 10);
            const sousActivite = await SousActivite.findByPk(idSousActivite);
            if (!sousActivite) {
                return res.status(404).json({ message: 'Sous-activité introuvable.' });
            }

            const permissions = normaliserPermissions(user.Role.permissions);
            const roleAutorise = !!(permissions.sous_activites && permissions.sous_activites[action]);

            if (roleAutorise) {
                const idsAccessibles = await getIdsActivitesAccessibles(user);
                if (idsAccessibles.includes(sousActivite.id_activite)) return next();
            }

            const acces = await UtilisateurSousActivite.findOne({ where: { id_user: user.id, id_sous_activite: idSousActivite } });
            const accesPermissions = normaliserPermissions(acces && acces.permissions);
            if (accesPermissions[niveauAcces]) return next();

            return res.status(403).json({ message: `Accès refusé : action "${action}" non autorisée sur cette sous-activité.` });
        } catch (err) {
            next(err);
        }
    };
}

/**
 * Autorise la CRÉATION d'une sous-activité sous une activité donnée
 * (req.body.id_activite) selon la même logique OR : rôle global + accès
 * à l'activité, ou accès particulier "write" accordé sur cette activité.
 */
function checkCreationSousActivite() {
    return async (req, res, next) => {
        try {
            const user = req.currentUser;
            if (isAdmin(user)) return next();

            const idActivite = parseInt(req.body.id_activite, 10);

            const permissions = normaliserPermissions(user.Role.permissions);
            const roleAutorise = !!(permissions.sous_activites && permissions.sous_activites.create);

            if (roleAutorise) {
                const idsAccessibles = await getIdsActivitesAccessibles(user);
                if (idsAccessibles.includes(idActivite)) return next();
            }

            const acces = await UtilisateurActivite.findOne({ where: { id_user: user.id, id_activite: idActivite } });
            const accesPermissions = normaliserPermissions(acces && acces.permissions);
            if (accesPermissions.write) return next();

            return res.status(403).json({ message: 'Accès refusé : création de sous-activité non autorisée sur cette activité.' });
        } catch (err) {
            next(err);
        }
    };
}

module.exports = {
    requireAuth,
    isAdmin,
    checkPermission,
    checkAccesActivite,
    checkAccesSousActivite,
    getIdsActivitesAccessibles,
    checkAccesLectureActivite,
    checkAccesLectureSousActivite,
    checkActionActivite,
    checkActionSousActivite,
    checkCreationSousActivite,
    normaliserPermissions
};
