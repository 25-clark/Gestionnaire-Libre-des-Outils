const express = require('express');
const router = express.Router();
const { requireLogin } = require('../middlewares/requireLogin');

router.use(requireLogin);

const pages = {
    support: { titre: 'Support' },
    documentation: { titre: 'Documentation' },
    'mise-a-jour': { titre: 'Mise à jour' },
    extensions: { titre: 'Extensions' },
    soutien: { titre: 'Soutien & donation' },
    confidentialite: { titre: 'Confidentialité' }
};

router.get('/', (req, res) => res.redirect('/aide/documentation'));

router.get('/:page', (req, res) => {
    const p = pages[req.params.page];
    if (!p) {
        return res.status(404).render('erreur', { titre: 'Introuvable', message: "Page d'aide inconnue." });
    }
    res.render('aide/' + req.params.page, { titre: p.titre, pageAide: req.params.page });
});

module.exports = router;
