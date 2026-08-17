const express = require('express');
const router = express.Router();
const { requireLogin } = require('../middlewares/requireLogin');
const { apiClient } = require('../config/api');

router.get('/', requireLogin, async (req, res, next) => {
    try {
        const api = apiClient(req);
        const { data: arborescence } = await api.get('/activites/arborescence');

        res.locals.page = 'dashboard';
        res.render('dashboard', {
            titre: 'Accueil',
            arborescence
        });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
