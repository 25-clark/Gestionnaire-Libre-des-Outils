const express = require('express');
const router = express.Router();
const { requireLogin } = require('../middlewares/requireLogin');
const { apiClient } = require('../config/api');

router.use(requireLogin);

// Formulaire de création (id_activite et id_parent optionnel passés en query)
router.get('/nouveau', async (req, res, next) => {
    try {
        const { id_activite, id_parent } = req.query;
        res.render('sousActivite/form', {
            titre: 'Nouvelle sous-activité',
            sousActivite: null,
            id_activite,
            id_parent: id_parent || '',
            erreur: null
        });
    } catch (err) { next(err); }
});

router.post('/', async (req, res) => {
    try {
        const api = apiClient(req);
        const { data: sousActivite } = await api.post('/sous-activites', req.body);
        res.redirect(`/activites/${sousActivite.id_activite}`);
    } catch (err) {
        res.render('sousActivite/form', {
            titre: 'Nouvelle sous-activité',
            sousActivite: null,
            id_activite: req.body.id_activite,
            id_parent: req.body.id_parent || '',
            erreur: err.response?.data?.message || 'Erreur lors de la création.'
        });
    }
});

router.get('/:id/modifier', async (req, res, next) => {
    try {
        const api = apiClient(req);
        const { data: sousActivite } = await api.get(`/sous-activites/${req.params.id}`);
        res.render('sousActivite/form', {
            titre: 'Modifier la sous-activité',
            sousActivite,
            id_activite: sousActivite.id_activite,
            id_parent: sousActivite.id_parent || '',
            erreur: null
        });
    } catch (err) { next(err); }
});

router.post('/:id/modifier', async (req, res) => {
    try {
        const api = apiClient(req);
        const { data: sousActivite } = await api.put(`/sous-activites/${req.params.id}`, req.body);
        res.redirect(`/activites/${sousActivite.id_activite}`);
    } catch (err) {
        res.render('sousActivite/form', {
            titre: 'Modifier la sous-activité',
            sousActivite: { id: req.params.id, ...req.body },
            id_activite: req.body.id_activite,
            id_parent: req.body.id_parent || '',
            erreur: err.response?.data?.message || 'Erreur lors de la modification.'
        });
    }
});

router.post('/:id/supprimer', async (req, res, next) => {
    try {
        const api = apiClient(req);
        const { data: sousActivite } = await api.get(`/sous-activites/${req.params.id}`);
        await api.delete(`/sous-activites/${req.params.id}`);
        res.redirect(`/activites/${sousActivite.id_activite}`);
    } catch (err) { next(err); }
});

module.exports = router;
