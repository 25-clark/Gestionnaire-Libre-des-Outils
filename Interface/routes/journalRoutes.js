const express = require('express');
const router = express.Router();
const { apiClient } = require('../config/api');
const { requireLogin, estAdmin } = require('../middlewares/requireLogin');

router.use(requireLogin);
router.use((req, res, next) => {
    if (!estAdmin(req.session.user)) {
        return res.status(403).render('erreur', { titre: 'Accès refusé', message: "Réservé à l'administrateur." });
    }
    next();
});

router.get('/', async (req, res, next) => {
    try {
        const api = apiClient(req);
        const page = parseInt(req.query.page, 10) || 1;
        const { data } = await api.get('/journal', {
            params: { page, q: req.query.q || undefined, ressource: req.query.ressource || undefined, action: req.query.action || undefined }
        });

        res.render('journal', {
            titre: "Journal d'événements",
            evenements: data.evenements,
            page: data.page,
            totalPages: data.totalPages,
            total: data.total,
            q: req.query.q || '',
            ressource: req.query.ressource || '',
            action: req.query.action || ''
        });
    } catch (err) { next(err); }
});

module.exports = router;
