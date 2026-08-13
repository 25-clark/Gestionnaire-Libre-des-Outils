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

        // Sous-activités de l'activité sélectionnée dans le formulaire
        // d'octroi (rechargé via GET quand l'activité change) : le menu
        // "Sous-activité précise" ne s'affiche que si cette activité en a.
        const id_activite = req.query.id_activite || '';
        let sousActivitesDisponibles = [];
        if (id_activite) {
            const resp = await api.get(`/sous-activites?id_activite=${id_activite}`);
            sousActivitesDisponibles = resp.data;
        }

        res.locals.page = 'acces';
        res.render('acces/liste', {
            titre: 'Accès particuliers',
            accesActivites: accesActivites.data,
            accesSousActivites: accesSousActivites.data,
            utilisateurs: utilisateurs.data,
            activites: activites.data,
            sousActivitesDisponibles,
            id_activite,
            id_user_selectionne: req.query.id_user || ''
        });
    } catch (err) { next(err); }
});

// Formulaire unique d'octroi : dispatch selon qu'une sous-activité précise
// a été choisie ou non (le champ id_sous_activite n'apparaît/n'est envoyé
// que si l'activité sélectionnée en a — cf. acces/liste.ejs).
router.post('/', async (req, res, next) => {
    try {
        const api = apiClient(req);
        const permissions = {
            read: true,
            write: req.body.write === 'on',
            delete: req.body.delete === 'on'
        };

        if (req.body.id_sous_activite) {
            await api.post('/acces/sous-activites', {
                id_user: req.body.id_user,
                id_sous_activite: req.body.id_sous_activite,
                permissions
            });
        } else {
            await api.post('/acces/activites', {
                id_user: req.body.id_user,
                id_activite: req.body.id_activite,
                permissions
            });
        }

        res.redirect('/acces');
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
