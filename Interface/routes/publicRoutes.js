const express = require('express');
const router = express.Router();
const { apiClientAnonyme } = require('../config/api');

router.get('/statistiques', async (req, res, next) => {
    try {
        const api = apiClientAnonyme();
        const { data: stats } = await api.get('/statistiques/public');
        res.render('statistiques-public', { titre: 'Tableau de bord public', stats, publicMode: true });
    } catch (err) {
        res.status(403).render('erreur', {
            titre: 'Accès refusé',
            message: err.response?.data?.message || 'Les statistiques publiques ne sont pas activées.'
        });
    }
});

module.exports = router;
