const express = require('express');
const router = express.Router();
const { requireLogin } = require('../middlewares/requireLogin');
const { apiClient } = require('../config/api');

router.use(requireLogin);

// Formulaire de création (id_activite optionnel passé en query)
router.get('/nouveau', async (req, res, next) => {
    try {
        const api = apiClient(req);
        const { data: roles } = await api.get('/roles');
        const { data: activites } = await api.get('/activites');

        res.render('utilisateur/form', {
            titre: 'Nouvel utilisateur',
            roles,
            activites,
            id_activite: req.query.id_activite || '',
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
            const { data: activites } = await api.get('/activites');
            res.render('utilisateur/form', {
                titre: 'Nouvel utilisateur',
                roles,
                activites,
                id_activite: req.body.id_activite || '',
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

module.exports = router;
