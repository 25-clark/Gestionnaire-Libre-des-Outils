function requireLogin(req, res, next) {
    if (req.path && req.path.startsWith('/public')) return next();

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
    if (!user) return false;
    if (user.Role && user.Role.abbreviation === 'ADMIN') return true;
    const extra = user.Roles || user.rolesEffectifs || [];
    return extra.some(r => r && r.abbreviation === 'ADMIN');
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
    if (!user) return false;

    // Multi-rôles : intersection (refus > accord)
    const roles = [];
    if (user.Role) roles.push(user.Role);
    if (user.Roles && Array.isArray(user.Roles)) {
        user.Roles.forEach(r => { if (!roles.some(x => x.id === r.id)) roles.push(r); });
    }
    if (user.rolesEffectifs && Array.isArray(user.rolesEffectifs)) {
        user.rolesEffectifs.forEach(r => { if (!roles.some(x => x.id === r.id)) roles.push(r); });
    }
    if (!roles.length) return false;

    return roles.every(role => {
        let permissions = role.permissions;
        if (!permissions) return false;
        if (typeof permissions === 'string') {
            try { permissions = JSON.parse(permissions); } catch { return false; }
        }
        return !!(permissions[resource] && permissions[resource][action]);
    });
}

module.exports = { requireLogin, estAdmin, peutFaire };
