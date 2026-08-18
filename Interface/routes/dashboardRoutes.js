const express = require('express');
const router = express.Router();
const { requireLogin } = require('../middlewares/requireLogin');
const { apiClient } = require('../config/api');

router.get('/', requireLogin, async (req, res, next) => {
    try {
        const api = apiClient(req);
        const uid = req.session.user.id;

        const [arb, favRes, outilsRes] = await Promise.all([
            api.get('/activites/arborescence'),
            api.get(`/utilisateurs/${uid}/favoris`).catch(() => ({ data: { outils: [], activites: [] } })),
            api.get('/outils').catch(() => ({ data: [] }))
        ]);

        const favoris = favRes.data || { outils: [], activites: [] };
        let tousOutils = outilsRes.data;
        if (!Array.isArray(tousOutils)) tousOutils = tousOutils.outils || [];

        const outilsFavoris = (favoris.outils || [])
            .map(id => tousOutils.find(o => o.id === id))
            .filter(Boolean);

        const actIds = new Set(favoris.activites || []);
        const activitesFavoris = (arb.data || []).filter(a => actIds.has(a.id));

        res.locals.page = 'dashboard';
        res.render('dashboard', {
            titre: 'Tableau de bord',
            arborescence: arb.data,
            favoris,
            outilsFavoris,
            activitesFavoris
        });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
