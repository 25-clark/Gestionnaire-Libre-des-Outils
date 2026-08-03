function requireLogin(req, res, next) {
    if (!req.session.user || !req.session.apiCookie) {
        return res.redirect('/login');
    }
    next();
}

// Permet de cacher/afficher des boutons dans les vues selon le rôle,
// sans bloquer l'accès (le blocage réel est fait par le Server/API).
function estAdmin(user) {
    return !!user && !!user.Role && user.Role.abbreviation === 'ADMIN';
}

module.exports = { requireLogin, estAdmin };
