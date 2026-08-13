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

        let activites = [];
        let sousActivites = [];
        let outils = [];
        let archives = [];
        let utilisateurs = [];
        let tickets = [];

        // Chaque catégorie n'est cherchée que si le rôle de l'utilisateur a le
        // droit de lecture correspondant. Le Server applique en plus son
        // propre périmètre d'accès (activités/sous-activités accessibles),
        // donc un compte restreint ne voit ici que ce qu'il a le droit de voir.
        if (q) {
            const appels = [];

            if (peutFaire(user, 'activites', 'read')) {
                appels.push(
                    api.get(`/activites?q=${encodeURIComponent(q)}`).then(resp => { activites = resp.data; })
                );
            }
            if (peutFaire(user, 'sous_activites', 'read')) {
                appels.push(
                    api.get(`/sous-activites?q=${encodeURIComponent(q)}`).then(resp => { sousActivites = resp.data; })
                );
            }
            if (peutFaire(user, 'outils', 'read')) {
                appels.push(
                    api.get(`/outils?q=${encodeURIComponent(q)}`).then(resp => {
                        outils = resp.data.filter(o => o.active);
                        archives = resp.data.filter(o => !o.active);
                    })
                );
            }
            if (peutFaire(user, 'utilisateurs', 'read')) {
                appels.push(
                    api.get(`/utilisateurs?q=${encodeURIComponent(q)}`).then(resp => { utilisateurs = resp.data; })
                );
            }
            if (peutFaire(user, 'tickets', 'read')) {
                // Le Server filtre déjà par visibilité réelle du ticket
                // (créateur, assigné, ou périmètre accessible) — cf.
                // utilisateurPeutVoirTicket dans ticketController.js.
                appels.push(
                    api.get(`/tickets?q=${encodeURIComponent(q)}`).then(resp => { tickets = resp.data; })
                );
            }

            await Promise.all(appels);
        }

        res.render('recherche', {
            titre: 'Recherche',
            q,
            activites,
            sousActivites,
            outils,
            archives,
            utilisateurs,
            tickets
        });
    } catch (err) { next(err); }
});

module.exports = router;
