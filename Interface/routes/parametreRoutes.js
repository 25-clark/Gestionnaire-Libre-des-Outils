const express = require('express');
const router = express.Router();
const { apiClient } = require('../config/api');
const { requireLogin, estAdmin } = require('../middlewares/requireLogin');

router.use(requireLogin);

// Réservé à l'administrateur (aussi vérifié côté Server, source de vérité).
router.use((req, res, next) => {
    if (!estAdmin(req.session.user)) {
        return res.status(403).render('erreur', { titre: 'Accès refusé', message: 'Réservé à l\'administrateur.' });
    }
    next();
});

router.get('/', async (req, res, next) => {
    try {
        const api = apiClient(req);
        const { data: parametre } = await api.get('/parametres');
        res.render('parametres', { titre: 'Réglages', parametre, erreur: null, succes: false });
    } catch (err) { next(err); }
});

router.post('/', async (req, res) => {
    try {
        const api = apiClient(req);
        const { data: parametre } = await api.put('/parametres', req.body);
        res.render('parametres', { titre: 'Réglages', parametre, erreur: null, succes: true });
    } catch (err) {
        let parametre = req.body;
        try {
            const api = apiClient(req);
            const resp = await api.get('/parametres');
            parametre = resp.data;
        } catch { /* on affiche quand même le formulaire avec ce qui a été saisi */ }

        res.render('parametres', {
            titre: 'Réglages',
            parametre,
            erreur: err.response?.data?.message || 'Erreur lors de l\'enregistrement.',
            succes: false
        });
    }
});

module.exports = router;
