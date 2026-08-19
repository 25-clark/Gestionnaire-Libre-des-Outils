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
        const idsOutils = (favoris.outils || []).map(Number);
        const idsActivites = (favoris.activites || []).map(Number);
        req.session._favorisCache = { outils: idsOutils, activites: idsActivites, ts: Date.now() };
        res.locals.favorisOutilsIds = idsOutils;
        res.locals.favorisActivitesIds = idsActivites;

        let tousOutils = outilsRes.data;
        if (!Array.isArray(tousOutils)) tousOutils = tousOutils.outils || [];

        const outilsFavoris = idsOutils
            .map(id => tousOutils.find(o => Number(o.id) === id))
            .filter(Boolean);

        // Arborescence des épinglés : activités épinglées + outils épinglés groupés
        const arboEpingles = [];
        const actById = {};
        (arb.data || []).forEach(a => { actById[a.id] = a; });

        idsActivites.forEach(id => {
            const a = actById[id];
            if (!a) return;
            arboEpingles.push({
                type: 'activite',
                id: a.id,
                nom: a.nom,
                abbreviation: a.abbreviation,
                sousActivites: a.sousActivites || [],
                outils: outilsFavoris.filter(o => {
                    const acts = o.activites || [];
                    return acts.some(x => Number(x.id || x) === id);
                })
            });
        });

        // Outils épinglés non déjà rattachés à une activité épinglée
        const outilsOrphelins = outilsFavoris.filter(o => {
            const acts = o.activites || [];
            const lie = acts.some(x => idsActivites.includes(Number(x.id || x)));
            return !lie;
        });

        res.locals.page = 'dashboard';
        res.render('dashboard', {
            titre: 'Tableau de bord',
            arborescence: arb.data || [],
            favoris,
            outilsFavoris,
            arboEpingles,
            outilsOrphelins,
            idsOutilsFavoris: idsOutils,
            idsActivitesFavoris: idsActivites
        });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
