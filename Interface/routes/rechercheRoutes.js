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
                        const list = Array.isArray(resp.data) ? resp.data : (resp.data.outils || []);
                        outils = list.filter(o => o.active);
                        archives = list.filter(o => !o.active);
                    })
                );
            }
            if (peutFaire(user, 'utilisateurs', 'read')) {
                appels.push(
                    api.get(`/utilisateurs?q=${encodeURIComponent(q)}`).then(resp => { utilisateurs = resp.data; })
                );
            }
            if (peutFaire(user, 'tickets', 'read')) {
                appels.push(
                    api.get(`/tickets?q=${encodeURIComponent(q)}`).then(resp => {
                        tickets = Array.isArray(resp.data) ? resp.data : (resp.data.tickets || []);
                    })
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

// API JSON pour la palette Ctrl+K
router.get('/api', async (req, res) => {
    try {
        const q = (req.query.q || '').trim();
        if (!q) return res.json({ resultats: [] });

        const api = apiClient(req);
        const user = req.session.user;
        const resultats = [];
        const appels = [];

        if (peutFaire(user, 'activites', 'read')) {
            appels.push(
                api.get('/activites', { params: { q } }).then(r => {
                    (Array.isArray(r.data) ? r.data : []).slice(0, 6).forEach(a => {
                        resultats.push({
                            type: 'activite',
                            icon: 'bi-folder',
                            label: a.nom,
                            meta: a.abbreviation || 'Activité',
                            href: '/activites/' + a.id
                        });
                    });
                }).catch(() => {})
            );
        }
        if (peutFaire(user, 'outils', 'read')) {
            appels.push(
                api.get('/outils', { params: { q } }).then(r => {
                    const list = Array.isArray(r.data) ? r.data : (r.data.outils || []);
                    list.filter(o => o.active !== false).slice(0, 8).forEach(o => {
                        resultats.push({
                            type: 'outil',
                            icon: 'bi-tools',
                            label: o.nom,
                            meta: 'Outil',
                            href: o.lien || ('/activites')
                        });
                    });
                }).catch(() => {})
            );
        }
        if (peutFaire(user, 'tickets', 'read')) {
            appels.push(
                api.get('/tickets', { params: { q, par_page: 5 } }).then(r => {
                    const list = Array.isArray(r.data) ? r.data : (r.data.tickets || []);
                    list.slice(0, 5).forEach(t => {
                        resultats.push({
                            type: 'ticket',
                            icon: 'bi-ticket-detailed',
                            label: '#' + t.id + ' — ' + t.titre,
                            meta: t.statut || 'Ticket',
                            href: '/tickets/' + t.id
                        });
                    });
                }).catch(() => {})
            );
        }
        if (peutFaire(user, 'utilisateurs', 'read')) {
            appels.push(
                api.get('/utilisateurs', { params: { q } }).then(r => {
                    (Array.isArray(r.data) ? r.data : []).slice(0, 5).forEach(u => {
                        resultats.push({
                            type: 'user',
                            icon: 'bi-person',
                            label: ((u.prenom || '') + ' ' + (u.nom || '')).trim(),
                            meta: u.matricule || 'Utilisateur',
                            href: (u.id_sous_activite
                                ? ('/sous-activites/' + u.id_sous_activite + '?user=' + u.id)
                                : (u.id_activite
                                    ? ('/activites/' + u.id_activite + '?onglet=utilisateurs&user=' + u.id)
                                    : '/'))
                        });
                    });
                }).catch(() => {})
            );
        }

        await Promise.all(appels);
        res.json({ resultats: resultats.slice(0, 20) });
    } catch (err) {
        console.error('[recherche/api]', err.message);
        res.status(500).json({ resultats: [], message: 'Erreur recherche' });
    }
});

module.exports = router;
