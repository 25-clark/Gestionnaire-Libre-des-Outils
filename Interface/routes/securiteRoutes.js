const express = require('express');
const router = express.Router();
const { requireLogin, estAdmin, peutFaire } = require('../middlewares/requireLogin');
const { apiClient } = require('../config/api');

router.use(requireLogin);

// Sessions (vue Administration : toutes les sessions si admin)
router.get('/sessions', async (req, res, next) => {
    try {
        if (!peutFaire(req.session.user, 'sessions', 'read') && !estAdmin(req.session.user)) {
            return res.status(403).render('erreur', {
                titre: 'Accès refusé',
                message: "Vous n'avez pas la permission de consulter les sessions actives."
            });
        }
        const { data } = await apiClient(req).get('/sessions');
        res.render('securite/sessions', {
            titre: 'Sessions actives',
            sessions: data.sessions || [],
            succes: req.query.succes,
            erreur: null,
            estAdmin: true
        });
    } catch (err) { next(err); }
});

router.post('/sessions/:id/revoquer', async (req, res, next) => {
    try {
        await apiClient(req).delete('/sessions/' + req.params.id);
        res.redirect('/securite/sessions?succes=1');
    } catch (err) {
        res.render('securite/sessions', {
            titre: 'Sessions actives',
            sessions: [],
            erreur: err.response?.data?.message || 'Erreur',
            succes: null
        });
    }
});

router.post('/sessions/revoquer-toutes', async (req, res, next) => {
    try {
        await apiClient(req).post('/sessions/revoquer-toutes', {});
        res.redirect('/securite/sessions?succes=1');
    } catch (err) { next(err); }
});

// Délégations
router.get('/delegations', async (req, res, next) => {
    try {
        if (!peutFaire(req.session.user, 'delegations', 'read') && !peutFaire(req.session.user, 'delegations', 'create') && !estAdmin(req.session.user)) {
            return res.status(403).render('erreur', {
                titre: 'Accès refusé',
                message: "Permission « Délégations » manquante."
            });
        }
        const api = apiClient(req);
        const [{ data }, { data: usersData }] = await Promise.all([
            api.get('/delegations'),
            api.get('/utilisateurs').catch(() => ({ data: [] }))
        ]);
        const users = Array.isArray(usersData) ? usersData : (usersData.utilisateurs || []);
        res.render('securite/delegations', {
            titre: 'Délégations temporaires',
            donnees: data.donnees || [],
            recues: data.recues || [],
            utilisateurs: users,
            succes: req.query.succes,
            erreur: null
        });
    } catch (err) { next(err); }
});

router.post('/delegations', async (req, res, next) => {
    try {
        if (!peutFaire(req.session.user, 'delegations', 'create') && !estAdmin(req.session.user)) {
            return res.status(403).render('erreur', { titre: 'Accès refusé', message: 'Création de délégation non autorisée.' });
        }
        await apiClient(req).post('/delegations', {
            id_receveur: req.body.id_receveur,
            date_debut: req.body.date_debut,
            date_fin: req.body.date_fin,
            motif: req.body.motif,
            perimetre: {
                tickets: req.body.perimetre_tickets === 'on' || req.body.perimetre_tickets === '1',
                acces: req.body.perimetre_acces === 'on' || req.body.perimetre_acces === '1'
            }
        });
        res.redirect('/securite/delegations?succes=1');
    } catch (err) {
        res.redirect('/securite/delegations?erreur=' + encodeURIComponent(err.response?.data?.message || 'Erreur'));
    }
});

router.post('/delegations/:id/revoquer', async (req, res, next) => {
    try {
        await apiClient(req).post('/delegations/' + req.params.id + '/revoquer');
        res.redirect('/securite/delegations?succes=1');
    } catch (err) { next(err); }
});

// Demandes d'accès
router.get('/demandes-acces', async (req, res, next) => {
    try {
        if (!peutFaire(req.session.user, 'demandes_acces', 'read') && !peutFaire(req.session.user, 'demandes_acces', 'create') && !estAdmin(req.session.user)) {
            return res.status(403).render('erreur', {
                titre: 'Accès refusé',
                message: "Permission « Demandes d'accès » manquante."
            });
        }
        const api = apiClient(req);
        const params = {};
        if (!estAdmin(req.session.user)) params.miennes = '1';
        const { data } = await api.get('/demandes-acces', { params });

        let activites = [];
        let sousActivites = [];
        let outils = [];
        try {
            const actRes = await api.get('/activites');
            activites = Array.isArray(actRes.data) ? actRes.data : (actRes.data.activites || []);
            activites.forEach(function (a) {
                (a.SousActivites || a.sousActivites || []).forEach(function (s) {
                    sousActivites.push({
                        id: s.id,
                        nom: s.nom,
                        id_activite: a.id,
                        activite: a.nom
                    });
                });
            });
        } catch (_) {}
        if (!sousActivites.length) {
            try {
                const saRes = await api.get('/sous-activites');
                const list = Array.isArray(saRes.data) ? saRes.data : (saRes.data.sousActivites || []);
                sousActivites = list.map(function (s) {
                    return { id: s.id, nom: s.nom, id_activite: s.id_activite, activite: '' };
                });
            } catch (_) {}
        }
        try {
            const oRes = await api.get('/outils');
            outils = Array.isArray(oRes.data) ? oRes.data : (oRes.data.outils || []);
        } catch (_) {}

        res.render('securite/demandes-acces', {
            titre: "Demandes d'accès",
            demandes: data.demandes || [],
            estAdmin: estAdmin(req.session.user),
            activites: activites,
            sousActivites: sousActivites,
            outils: outils,
            demandeur: req.session.user || null,
            succes: req.query.succes,
            erreur: req.query.erreur || null
        });
    } catch (err) { next(err); }
});

router.post('/demandes-acces', async (req, res, next) => {
    try {
        if (!peutFaire(req.session.user, 'demandes_acces', 'create') && !estAdmin(req.session.user)) {
            return res.status(403).render('erreur', { titre: 'Accès refusé', message: 'Création de demande non autorisée.' });
        }
        await apiClient(req).post('/demandes-acces', {
            type_cible: req.body.type_cible,
            id_cible: req.body.id_cible,
            message: req.body.message
        });
        res.redirect('/securite/demandes-acces?succes=1');
    } catch (err) {
        res.redirect('/securite/demandes-acces?erreur=' + encodeURIComponent(err.response?.data?.message || 'Erreur'));
    }
});

router.post('/demandes-acces/:id/traiter', async (req, res, next) => {
    try {
        if (!peutFaire(req.session.user, 'demandes_acces', 'update') && !estAdmin(req.session.user)) {
            return res.status(403).render('erreur', { titre: 'Accès refusé', message: 'Validation de demande non autorisée.' });
        }
        await apiClient(req).post('/demandes-acces/' + req.params.id + '/traiter', {
            decision: req.body.decision,
            reponse: req.body.reponse
        });
        res.redirect('/securite/demandes-acces?succes=1');
    } catch (err) { next(err); }
});

router.post('/demandes-acces/:id/annuler', async (req, res, next) => {
    try {
        await apiClient(req).post('/demandes-acces/' + req.params.id + '/annuler');
        res.redirect('/securite/demandes-acces?succes=1');
    } catch (err) { next(err); }
});

module.exports = router;
