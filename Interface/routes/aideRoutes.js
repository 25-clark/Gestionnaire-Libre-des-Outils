const express = require('express');
const router = express.Router();
const { requireLogin, estAdmin } = require('../middlewares/requireLogin');

router.use(requireLogin);

const pages = {
    support: { titre: 'Support' },
    documentation: { titre: 'Documentation' },
    'mise-a-jour': { titre: 'Mise à jour' },
    extensions: { titre: 'Extensions' },
    soutien: { titre: 'Soutien & donation' },
    confidentialite: { titre: 'Confidentialité' }
};

function itemsAideAutorises(user) {
    if (estAdmin(user)) return Object.keys(pages);
    if (!user || !user.Role || !user.Role.permissions) return Object.keys(pages);
    let perms = user.Role.permissions;
    if (typeof perms === 'string') {
        try { perms = JSON.parse(perms); } catch { return Object.keys(pages); }
    }
    if (!perms.aide) return Object.keys(pages); // rétrocompat
    return Object.keys(pages).filter(k => !!perms.aide[k]);
}

router.get('/', (req, res) => {
    const allowed = itemsAideAutorises(req.session.user);
    if (!allowed.length) {
        return res.status(403).render('erreur', { titre: 'Accès refusé', message: 'Aucune page d\'aide n\'est autorisée pour votre rôle.' });
    }
    const prefer = allowed.includes('documentation') ? 'documentation' : allowed[0];
    res.redirect('/aide/' + prefer);
});

router.get('/:page', (req, res) => {
    const p = pages[req.params.page];
    if (!p) {
        return res.status(404).render('erreur', { titre: 'Introuvable', message: "Page d'aide inconnue." });
    }
    const allowed = itemsAideAutorises(req.session.user);
    if (!allowed.includes(req.params.page)) {
        return res.status(403).render('erreur', { titre: 'Accès refusé', message: "Cette page d'aide n'est pas autorisée pour votre rôle." });
    }
    res.render('aide/' + req.params.page, { titre: p.titre, pageAide: req.params.page });
});

module.exports = router;
