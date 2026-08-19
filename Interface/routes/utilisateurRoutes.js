const express = require('express');
const router = express.Router();
const { requireLogin } = require('../middlewares/requireLogin');
const { apiClient } = require('../config/api');

router.use(requireLogin);

// Formulaire de création (id_activite passé en query : on crée directement
// dans l'activité depuis laquelle on est venu, sans avoir à la re-choisir).
router.get('/nouveau', async (req, res, next) => {
    try {
        const api = apiClient(req);
        const { data: roles } = await api.get('/roles');
        const id_activite = req.query.id_activite || '';

        let activite = null;
        let activites = [];
        if (id_activite) {
            const resp = await api.get(`/activites/${id_activite}`);
            activite = resp.data;
        } else {
            // Repli défensif si le formulaire est atteint sans contexte.
            const resp = await api.get('/activites');
            activites = resp.data;
        }

        res.render('utilisateur/form', {
            titre: 'Nouvel utilisateur',
            roles,
            activite,
            activites,
            id_activite,
            erreur: null
        });
    } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
    try {
        const api = apiClient(req);
        const { data: utilisateur } = await api.post('/utilisateurs', req.body);

        if (req.body.id_activite) {
            return res.redirect(`/activites/${req.body.id_activite}?onglet=utilisateurs`);
        }
        res.redirect('/');
    } catch (err) {
        try {
            const api = apiClient(req);
            const { data: roles } = await api.get('/roles');
            const id_activite = req.body.id_activite || '';
            let activite = null;
            let activites = [];
            if (id_activite) {
                const resp = await api.get(`/activites/${id_activite}`);
                activite = resp.data;
            } else {
                const resp = await api.get('/activites');
                activites = resp.data;
            }
            res.render('utilisateur/form', {
                titre: 'Nouvel utilisateur',
                roles,
                activite,
                activites,
                id_activite,
                erreur: err.response?.data?.message || 'Erreur lors de la création.'
            });
        } catch (err2) { next(err2); }
    }
});

router.post('/:id/supprimer', async (req, res, next) => {
    try {
        const api = apiClient(req);
        const { data: utilisateur } = await api.get(`/utilisateurs/${req.params.id}`);
        await api.delete(`/utilisateurs/${req.params.id}`);

        if (utilisateur.id_activite) {
            return res.redirect(`/activites/${utilisateur.id_activite}?onglet=utilisateurs`);
        }
        res.redirect('/');
    } catch (err) { next(err); }
});

router.post('/:id/reinitialiser-mdp', async (req, res, next) => {
    try {
        const api = apiClient(req);
        const { data: utilisateur } = await api.get(`/utilisateurs/${req.params.id}`);
        await api.post(`/utilisateurs/${req.params.id}/reinitialiser-mdp`);

        if (utilisateur.id_activite) {
            return res.redirect(`/activites/${utilisateur.id_activite}?onglet=utilisateurs&mdpReinitialise=1`);
        }
        res.redirect('/');
    } catch (err) { next(err); }
});


router.get('/:id/modifier', async (req, res, next) => {
    try {
        const api = apiClient(req);
        const [{ data: utilisateur }, { data: roles }, { data: activites }] = await Promise.all([
            api.get(`/utilisateurs/${req.params.id}`),
            api.get('/roles'),
            api.get('/activites')
        ]);
        res.render('utilisateur/form', {
            titre: 'Modifier l\'utilisateur',
            utilisateur,
            roles,
            activite: null,
            activites,
            id_activite: utilisateur.id_activite || '',
            erreur: null
        });
    } catch (err) { next(err); }
});

router.post('/:id/modifier', async (req, res, next) => {
    try {
        const api = apiClient(req);
        await api.put(`/utilisateurs/${req.params.id}`, {
            matricule: req.body.matricule,
            nom: req.body.nom,
            prenom: req.body.prenom,
            id_role: req.body.id_role,
            id_activite: req.body.id_activite || null
        });
        const retour = req.body.id_activite
            ? `/activites/${req.body.id_activite}?onglet=utilisateurs`
            : `/activites/${req.body.id_activite || ''}?onglet=utilisateurs`;
        // Recharger user for redirect
        try {
            const { data: u } = await api.get(`/utilisateurs/${req.params.id}`);
            if (u.id_activite) return res.redirect(`/activites/${u.id_activite}?onglet=utilisateurs`);
        } catch (_) {}
        res.redirect('/');
    } catch (err) {
        try {
            const api = apiClient(req);
            const [{ data: utilisateur }, { data: roles }, { data: activites }] = await Promise.all([
                api.get(`/utilisateurs/${req.params.id}`),
                api.get('/roles'),
                api.get('/activites')
            ]);
            res.render('utilisateur/form', {
                titre: 'Modifier l\'utilisateur',
                utilisateur: { ...utilisateur, ...req.body },
                roles,
                activite: null,
                activites,
                id_activite: req.body.id_activite || '',
                erreur: err.response?.data?.message || 'Erreur lors de la modification.'
            });
        } catch (e) { next(err); }
    }
});


module.exports = router;
