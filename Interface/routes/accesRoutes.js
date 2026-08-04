const express = require('express');
const router = express.Router();
const { requireLogin } = require('../middlewares/requireLogin');
const { apiClient } = require('../config/api');

router.use(requireLogin);

router.get('/', async (req, res, next) => {
    try {
        const api = apiClient(req);
        const [accesActivites, accesSousActivites, utilisateurs, activites] = await Promise.all([
            api.get('/acces/activites'),
            api.get('/acces/sous-activites'),
            api.get('/utilisateurs'),
            api.get('/activites')
        ]);

        res.locals.page = 'acces';
        res.render('acces/liste', {
            titre: 'Accès particuliers',
            accesActivites: accesActivites.data,
            accesSousActivites: accesSousActivites.data,
            utilisateurs: utilisateurs.data,
            activites: activites.data
        });
    } catch (err) { next(err); }
});

// ---------- Accès sur une activité ----------

router.post('/activites', async (req, res, next) => {
    try {
        const api = apiClient(req);
        const permissions = {
            read: true,
            write: req.body.write === 'on',
            delete: req.body.delete === 'on'
        };
        await api.post('/acces/activites', {
            id_user: req.body.id_user,
            id_activite: req.body.id_activite,
            permissions
        });
        res.redirect(req.body.retour || '/acces');
    } catch (err) { next(err); }
});

router.post('/activites/:id/supprimer', async (req, res, next) => {
    try {
        const api = apiClient(req);
        await api.delete(`/acces/activites/${req.params.id}`);
        res.redirect(req.body.retour || '/acces');
    } catch (err) { next(err); }
});

// ---------- Accès sur une sous-activité ----------

router.post('/sous-activites', async (req, res, next) => {
    try {
        const api = apiClient(req);
        const permissions = {
            read: true,
            write: req.body.write === 'on',
            delete: req.body.delete === 'on'
        };
        await api.post('/acces/sous-activites', {
            id_user: req.body.id_user,
            id_sous_activite: req.body.id_sous_activite,
            permissions
        });
        res.redirect(req.body.retour || '/acces');
    } catch (err) { next(err); }
});

router.post('/sous-activites/:id/supprimer', async (req, res, next) => {
    try {
        const api = apiClient(req);
        await api.delete(`/acces/sous-activites/${req.params.id}`);
        res.redirect(req.body.retour || '/acces');
    } catch (err) { next(err); }
});

module.exports = router;
