const express = require('express');
const router = express.Router();
const { requireLogin } = require('../middlewares/requireLogin');
const { apiClient } = require('../config/api');

router.use(requireLogin);

router.get('/', async (req, res, next) => {
    try {
        const api = apiClient(req);
        const { data: stats } = await api.get('/statistiques');
        res.render('statistiques', { titre: 'Statistiques', stats });
    } catch (err) { next(err); }
});

module.exports = router;
