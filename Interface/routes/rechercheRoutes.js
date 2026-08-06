const express = require('express');
const router = express.Router();
const { requireLogin, peutFaire } = require('../middlewares/requireLogin');
const { apiClient } = require('../config/api');

router.use(requireLogin);

router.get('/', async (req, res, next) => {
    try {
        const q = (req.query.q || '').trim();
        const api = apiClient(req);
        const user = req.session.user;

        let outils = [];
        let utilisateurs = [];

        if (q) {
            const appels = [];

            if (peutFaire(user, 'outils', 'read')) {
                appels.push(
                    api.get(`/outils?q=${encodeURIComponent(q)}`).then(resp => { outils = resp.data; })
                );
            }
            if (peutFaire(user, 'utilisateurs', 'read')) {
                appels.push(
                    api.get(`/utilisateurs?q=${encodeURIComponent(q)}`).then(resp => { utilisateurs = resp.data; })
                );
            }

            await Promise.all(appels);
        }

        res.render('recherche', {
            titre: 'Recherche',
            q,
            outils,
            utilisateurs
        });
    } catch (err) { next(err); }
});

module.exports = router;
