const express = require('express');
const router = express.Router();
const { requireLogin } = require('../middlewares/requireLogin');
const { uploadLogo } = require('../middlewares/upload');
const { apiClient } = require('../config/api');

router.use(requireLogin);

// Formulaire de création
router.get('/nouveau', (req, res) => {
    res.render('activite/form', { titre: 'Nouvelle activité', activite: null, erreur: null });
});

router.post('/', uploadLogo.single('logo'), async (req, res) => {
    try {
        const api = apiClient(req);
        const logo = req.file ? `/uploads/logos/${req.file.filename}` : null;
        const { data: activite } = await api.post('/activites', { ...req.body, logo });
        res.redirect(`/activites/${activite.id}`);
    } catch (err) {
        res.render('activite/form', {
            titre: 'Nouvelle activité',
            activite: null,
            erreur: err.response?.data?.message || 'Erreur lors de la création.'
        });
    }
});

// Détail d'une activité : onglets Utilisateurs / Outils / Sous-activités
router.get('/:id', async (req, res, next) => {
    try {
        const api = apiClient(req);
        const onglet = req.query.onglet || 'sous-activites';

        const { data: activite } = await api.get(`/activites/${req.params.id}`);
        const { data: sousActivites } = await api.get(`/sous-activites?id_activite=${req.params.id}`);

        let utilisateurs = [];
        let outils = [];

        if (onglet === 'utilisateurs') {
            const resp = await api.get(`/utilisateurs?id_activite=${req.params.id}`);
            utilisateurs = resp.data;
        } else if (onglet === 'outils') {
            const resp = await api.get(`/outils?id_activite=${req.params.id}`);
            outils = resp.data;
        }

        res.locals.page = 'activite';
        res.render('activite/detail', {
            titre: activite.nom,
            activite,
            sousActivites,
            utilisateurs,
            outils,
            onglet
        });
    } catch (err) {
        next(err);
    }
});

// Formulaire de modification (nom, abréviation, logo)
router.get('/:id/modifier', async (req, res, next) => {
    try {
        const api = apiClient(req);
        const { data: activite } = await api.get(`/activites/${req.params.id}`);
        res.render('activite/form', { titre: 'Modifier l\'activité', activite, erreur: null });
    } catch (err) {
        next(err);
    }
});

router.post('/:id/modifier', uploadLogo.single('logo'), async (req, res) => {
    try {
        const api = apiClient(req);
        const logo = req.file ? `/uploads/logos/${req.file.filename}` : undefined;
        await api.put(`/activites/${req.params.id}`, { ...req.body, logo });
        res.redirect(`/activites/${req.params.id}`);
    } catch (err) {
        res.render('activite/form', {
            titre: "Modifier l'activité",
            activite: { id: req.params.id, ...req.body },
            erreur: err.response?.data?.message || 'Erreur lors de la modification.'
        });
    }
});

router.post('/:id/supprimer', async (req, res, next) => {
    try {
        const api = apiClient(req);
        await api.delete(`/activites/${req.params.id}`);
        res.redirect('/');
    } catch (err) {
        next(err);
    }
});

module.exports = router;
