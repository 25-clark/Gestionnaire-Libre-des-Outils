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
 * Un rôle dit CE QU'un utilisateur peut faire (CRUD par ressource, cf.
 * checkPermission). Un "accès particulier" (UtilisateurActivite /
 * UtilisateurSousActivite) dit OÙ il peut le faire, en dehors de son
 * activité principale :
 *   - read   : voir l'activité/sous-activité (dashboard, navigation)
 *   - write  : y créer/modifier des sous-activités, outils, etc.
 *   - delete : y supprimer des éléments
 * Un accès accordé sur une ACTIVITÉ entière s'applique à toutes ses
 * sous-activités. Un accès accordé sur une SOUS-ACTIVITÉ précise s'applique
 * à elle et à toute sa descendance (comme un dossier partagé), mais pas au
 * reste de l'activité.
 */

/**
 * true si l'utilisateur a le niveau d'accès demandé sur une activité :
 * admin, activité principale (le rôle suffit), ou accès particulier accordé.
 */
async function niveauAccesActivite(user, idActivite, niveau) {
    if (isAdmin(user)) return true;
    if (user.id_activite === idActivite) return true;

    const acces = await UtilisateurActivite.findOne({ where: { id_user: user.id, id_activite: idActivite } });
    const permissions = acces ? normaliserPermissions(acces.permissions) : null;
    return !!(permissions && permissions[niveau]);
}

/**
 * true si l'utilisateur a le niveau d'accès demandé sur une sous-activité :
 * admin, sa propre activité, accès accordé sur l'activité racine, accès
 * accordé directement sur cette sous-activité, ou sur un de ses ancêtres.
 */
async function niveauAccesSousActivite(user, sousActivite, niveau) {
    if (isAdmin(user)) return true;
    if (!sousActivite) return false;

    if (await niveauAccesActivite(user, sousActivite.id_activite, niveau)) return true;

    let courant = sousActivite;
    while (courant) {
        const acces = await UtilisateurSousActivite.findOne({ where: { id_user: user.id, id_sous_activite: courant.id } });
        const permissions = acces ? normaliserPermissions(acces.permissions) : null;
        if (permissions && permissions[niveau]) return true;

        courant = courant.id_parent ? await SousActivite.findByPk(courant.id_parent) : null;
    }

    return false;
}

/**
 * Middleware : vérifie un niveau d'accès particulier sur une activité.
 * niveau : "read" | "write" | "delete". L'id activité est cherché dans
 * req.params.id_activite, req.params.id, ou req.body.id_activite.
 */
function checkAccesActivite(niveau = 'write') {
    return async (req, res, next) => {
        try {
            const idActivite = parseInt(req.params.id_activite || req.params.id || req.body.id_activite, 10);
            if (await niveauAccesActivite(req.currentUser, idActivite, niveau)) return next();
            return res.status(403).json({ message: "Vous n'avez pas accès à cette activité." });
        } catch (err) {
            next(err);
        }
    };
}

/**
 * Middleware : vérifie un niveau d'accès particulier sur une sous-activité.
 * niveau : "read" | "write" | "delete". L'id est cherché dans
 * req.params.id_sous_activite, req.params.id, ou req.body.id_sous_activite.
 */
function checkAccesSousActivite(niveau = 'write') {
    return async (req, res, next) => {
        try {
            const idSousActivite = parseInt(req.params.id_sous_activite || req.params.id || req.body.id_sous_activite, 10);
            const sousActivite = await SousActivite.findByPk(idSousActivite);
            if (!sousActivite) return res.status(404).json({ message: 'Sous-activité introuvable.' });

            if (await niveauAccesSousActivite(req.currentUser, sousActivite, niveau)) return next();
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
    return checkAccesActivite('read');
}

/**
 * Idem, mais pour une sous-activité. Utilise niveauAccesSousActivite, qui
 * couvre aussi le cas d'un accès accordé directement sur cette sous-activité
 * (ou un ancêtre) sans que l'utilisateur ait accès au reste de l'activité —
 * un cas que l'ancienne version (basée uniquement sur getIdsActivitesAccessibles)
 * ne détectait pas.
 */
function checkAccesLectureSousActivite() {
    return checkAccesSousActivite('read');
}

module.exports = {
    requireAuth,
    isAdmin,
    checkPermission,
    checkAccesActivite,
    checkAccesSousActivite,
    niveauAccesActivite,
    niveauAccesSousActivite,
    getIdsActivitesAccessibles,
    checkAccesLectureActivite,
    checkAccesLectureSousActivite,
    normaliserPermissions
};
