const express = require('express');
const router = express.Router();
const { requireLogin } = require('../middlewares/requireLogin');
const { uploadOutilImage } = require('../middlewares/upload');
const { apiClient } = require('../config/api');

router.use(requireLogin);

router.get('/nouveau', async (req, res, next) => {
    try {
        const api = apiClient(req);
        const { data: utilisateurs } = await api.get('/utilisateurs');
        const { data: activites } = await api.get('/activites');
        const id_activite = req.query.id_activite || '';
        const id_sous_activite = req.query.id_sous_activite || '';

        let sousActivites = [];
        if (id_activite) {
            const resp = await api.get(`/sous-activites?id_activite=${id_activite}`);
            sousActivites = resp.data;
        }

        res.render('outil/form', {
            titre: 'Nouvel outil',
            utilisateurs,
            activites,
            sousActivites,
            id_activite,
            id_sous_activite,
            erreur: null
        });
    } catch (err) { next(err); }
});

router.post('/', uploadOutilImage.single('image'), async (req, res, next) => {
    try {
        const api = apiClient(req);
        const image = req.file ? `/uploads/outils/${req.file.filename}` : null;

        const activites = req.body.id_activite ? [req.body.id_activite] : [];
        const sousActivites = req.body.id_sous_activite ? [req.body.id_sous_activite] : [];

        const { data: outil } = await api.post('/outils', {
            nom: req.body.nom,
            lien: req.body.lien,
            id_user: req.body.id_user,
            image,
            activites: JSON.stringify(activites),
            sousActivites: JSON.stringify(sousActivites)
        });

        if (req.body.id_activite) {
            return res.redirect(`/activites/${req.body.id_activite}?onglet=outils`);
        }
        res.redirect('/');
    } catch (err) {
        next(err);
    }
});

router.post('/:id/toggle-active', async (req, res, next) => {
    try {
        const api = apiClient(req);
        await api.patch(`/outils/${req.params.id}/toggle-active`);
        res.redirect(req.body.retour || '/');
    } catch (err) { next(err); }
});

router.post('/:id/supprimer', async (req, res, next) => {
    try {
        const api = apiClient(req);
        await api.delete(`/outils/${req.params.id}`);
        res.redirect(req.body.retour || '/');
    } catch (err) { next(err); }
});

module.exports = router;
