function requireLogin(req, res, next) {
    if (!req.session.user || !req.session.apiCookie) {
        return res.redirect('/login');
    }

    // Mot de passe par défaut pas encore changé : on bloque l'accès au reste
    // de l'application tant que ce n'est pas fait (sécurité + traçabilité).
    // (La page /changer-mot-de-passe elle-même n'est pas protégée par ce
    // middleware — voir authRoutes.js — donc pas de boucle de redirection.)
    if (req.session.user.doit_changer_mdp) {
        return res.redirect('/changer-mot-de-passe');
    }

    next();
}

// Permet de cacher/afficher des boutons dans les vues selon le rôle,
// sans bloquer l'accès (le blocage réel est fait par le Server/API).
function estAdmin(user) {
    return !!user && !!user.Role && user.Role.abbreviation === 'ADMIN';
}

/**
 * Vérifie si un utilisateur a le droit d'effectuer une action sur une
 * ressource, en se basant sur les permissions RÉELLES de son rôle
 * (et pas seulement sur "est-il admin ?"). Un admin passe toujours.
 * Utilisé pour n'afficher dans l'interface que ce que l'utilisateur peut
 * réellement faire (le Server reste la source de vérité, ceci évite juste
 * des clics qui échouent avec un 403 confus).
 */
function peutFaire(user, resource, action) {
    if (estAdmin(user)) return true;
    if (!user || !user.Role || !user.Role.permissions) return false;

    let permissions = user.Role.permissions;
    if (typeof permissions === 'string') {
        try { permissions = JSON.parse(permissions); } catch { return false; }
    }

    return !!(permissions[resource] && permissions[resource][action]);
}

module.exports = { requireLogin, estAdmin, peutFaire };
