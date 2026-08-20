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
        res.render('parametres', { titre: 'Réglages', parametre, erreur: null, succes: req.query.succes || null, query: req.query });
    } catch (err) { next(err); }
});

router.post('/', async (req, res) => {
    try {
        const body = { ...req.body };
        // Une checkbox non cochée n'est pas envoyée du tout par le navigateur :
        // on normalise ici en booléen explicite pour ne jamais dépendre d'un
        // "valeur absente = inchangé" côté Server, qui empêcherait de désactiver
        // la complexité une fois activée.
        body.mdp_complexite = Array.isArray(body.mdp_complexite)
            ? body.mdp_complexite.includes('on')
            : body.mdp_complexite === 'on';
        body.surveillance_active = Array.isArray(body.surveillance_active)
            ? body.surveillance_active.includes('on')
            : body.surveillance_active === 'on';
        body.totp_disponible = Array.isArray(body.totp_disponible)
            ? body.totp_disponible.includes('on')
            : body.totp_disponible === 'on';
        body.totp_obligatoire = Array.isArray(body.totp_obligatoire)
            ? body.totp_obligatoire.includes('on')
            : body.totp_obligatoire === 'on';
        body.credentials_actifs = Array.isArray(body.credentials_actifs)
            ? body.credentials_actifs.includes('on')
            : body.credentials_actifs === 'on';
        body.auth_3fa_actif = Array.isArray(body.auth_3fa_actif)
            ? body.auth_3fa_actif.includes('on')
            : body.auth_3fa_actif === 'on';

        const api = apiClient(req);
        const { data: parametre } = await api.put('/parametres', body);
        res.render('parametres', { titre: 'Réglages', parametre, erreur: null, succes: true, query: req.query });
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
            succes: false,
            query: req.query
        });
    }
});


router.get('/sauvegarde/export', async (req, res, next) => {
    try {
        const api = apiClient(req);
        const response = await api.get('/sauvegarde/export', { responseType: 'arraybuffer' });
        const disp = response.headers['content-disposition'] || 'attachment; filename="glo-sauvegarde.json"';
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Content-Disposition', disp);
        res.send(Buffer.from(response.data));
    } catch (err) { next(err); }
});

router.post('/sauvegarde/restaurer', (req, res, next) => {
    const multer = require('multer');
    const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 80 * 1024 * 1024 } });
    upload.single('fichier')(req, res, async (err) => {
        if (err) return next(err);
        try {
            if (!req.file) {
                return res.redirect('/parametres?erreur=Fichier manquant');
            }
            const payload = JSON.parse(req.file.buffer.toString('utf8'));
            const api = apiClient(req);
            await api.post('/sauvegarde/restaurer', payload);
            res.redirect('/parametres?succes=Restauration terminée');
        } catch (e) {
            res.redirect('/parametres?erreur=' + encodeURIComponent(e.response?.data?.message || e.message || 'Échec restauration'));
        }
    });
});

module.exports = router;
