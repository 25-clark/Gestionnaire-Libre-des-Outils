const { Utilisateur, Role, UtilisateurActivite, UtilisateurSousActivite } = require('../models');

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

            if (acces && acces.permissions && acces.permissions[niveau]) {
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

            if (acces && acces.permissions && acces.permissions[niveau]) {
                return next();
            }

            return res.status(403).json({ message: "Vous n'avez pas accès à cette sous-activité." });
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
    checkAccesSousActivite
};
