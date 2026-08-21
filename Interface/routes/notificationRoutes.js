const express = require('express');
const router = express.Router();
const { apiClient } = require('../config/api');
const { requireLogin, peutFaire } = require('../middlewares/requireLogin');

router.use(requireLogin);

router.use((req, res, next) => {
    if (!peutFaire(req.session.user, 'notifications', 'read')) {
        return res.status(403).render('erreur', {
            titre: 'Accès refusé',
            message: "Vous n'avez pas accès aux notifications."
        });
    }
    next();
});

router.get('/', async (req, res, next) => {
    try {

        const api = apiClient(req);
        const page = parseInt(req.query.page, 10) || 1;
        const { data } = await api.get('/notifications', { params: { page } });

        res.render('notifications', {
            titre: 'Notifications',
            notifications: data.notifications,
            page: data.page,
            totalPages: data.totalPages,
            total: data.total
        });
    } catch (err) { next(err); }
});

// Marque comme lue puis redirige vers le lien associé (ou revient aux
// notifications s'il n'y en a pas) — un seul clic suffit.
router.post('/:id/lue', async (req, res) => {
    let lien = '/notifications';
    try {
        const api = apiClient(req);
        const { data } = await api.post(`/notifications/${req.params.id}/lue`);
        if (data.lien) lien = data.lien;
    } catch { /* si ça échoue, on revient simplement à la liste */ }
    delete req.session._notifBadge;
    res.redirect(lien);
});

router.post('/toutes-lues', async (req, res) => {
    try {
        const api = apiClient(req);
        await api.post('/notifications/toutes-lues');
        delete req.session._notifBadge;
    } catch { /* pas bloquant */ }
    res.redirect('/notifications');
});

router.post('/vider', async (req, res) => {
    try {
        const api = apiClient(req);
        await api.post('/notifications/vider');
        delete req.session._notifBadge;
    } catch { /* pas bloquant */ }
    res.redirect('/notifications');
});



router.get('/:id/ouvrir', async (req, res, next) => {
    try {
        const api = apiClient(req);
        const { data: n } = await api.get(`/notifications/${req.params.id}`).catch(() => ({ data: null }));
        try { await api.post(`/notifications/${req.params.id}/lue`); } catch (_) {}
        if (n && n.lien) return res.redirect(n.lien);
        return res.redirect('/notifications');
    } catch (err) {
        res.redirect('/notifications');
    }
});

module.exports = router;

