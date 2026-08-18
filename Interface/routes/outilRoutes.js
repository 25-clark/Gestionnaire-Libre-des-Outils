const express = require('express');
const router = express.Router();
const { requireLogin } = require('../middlewares/requireLogin');
const { uploadOutilImage } = require('../middlewares/upload');
const { apiClient } = require('../config/api');

router.use(requireLogin);

router.get('/nouveau', async (req, res, next) => {
    try {
        const api = apiClient(req);
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

        // Pas de id_user envoyé : le Server assigne automatiquement
        // l'utilisateur connecté comme propriétaire.
        const { data: outil } = await api.post('/outils', {
            nom: req.body.nom,
            lien: req.body.lien,
            adresse: req.body.adresse,
            image,
            credentials: req.body.credentials || '[]',
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

router.post('/:id/verifier-statut', async (req, res, next) => {
    try {
        const api = apiClient(req);
        await api.post(`/outils/${req.params.id}/verifier-statut`);
        res.redirect(req.body.retour || '/');
    } catch (err) { next(err); }
});

router.get('/:id/historique-statut', async (req, res, next) => {
    try {
        const api = apiClient(req);
        const [{ data: outil }, { data: historique }] = await Promise.all([
            api.get(`/outils/${req.params.id}`),
            api.get(`/outils/${req.params.id}/historique-statut`)
        ]);
        res.render('outil/historique-statut', { titre: `Historique — ${outil.nom}`, outil, historique });
    } catch (err) { next(err); }
});

router.post('/:id/supprimer', async (req, res, next) => {
    try {
        const api = apiClient(req);
        await api.delete(`/outils/${req.params.id}`);
        res.redirect(req.body.retour || '/');
    } catch (err) { next(err); }
});

// ---------- Partage : rattacher un outil existant à une activité/sous-activité
// supplémentaire, sans le dupliquer. ----------

router.get('/:id/partager', async (req, res, next) => {
    try {
        const api = apiClient(req);
        const { data: outil } = await api.get(`/outils/${req.params.id}`);
        const { data: activites } = await api.get('/activites');

        const id_activite = req.query.id_activite || '';
        let sousActivites = [];
        if (id_activite) {
            const resp = await api.get(`/sous-activites?id_activite=${id_activite}`);
            sousActivites = resp.data;
        }

        res.render('outil/partager', {
            titre: `Partager — ${outil.nom}`,
            outil,
            activites,
            sousActivites,
            id_activite,
            retour: req.query.retour || '/',
            erreur: null
        });
    } catch (err) { next(err); }
});

router.post('/:id/partager', async (req, res, next) => {
    try {
        const api = apiClient(req);
        await api.post(`/outils/${req.params.id}/partager`, {
            id_activite: req.body.id_sous_activite ? null : (req.body.id_activite || null),
            id_sous_activite: req.body.id_sous_activite || null
        });
        res.redirect(`/outils/${req.params.id}/partager?retour=${encodeURIComponent(req.body.retour || '/')}`);
    } catch (err) {
        try {
            const api = apiClient(req);
            const { data: outil } = await api.get(`/outils/${req.params.id}`);
            const { data: activites } = await api.get('/activites');
            let sousActivites = [];
            if (req.body.id_activite) {
                const resp = await api.get(`/sous-activites?id_activite=${req.body.id_activite}`);
                sousActivites = resp.data;
            }
            res.render('outil/partager', {
                titre: `Partager — ${outil.nom}`,
                outil, activites, sousActivites,
                id_activite: req.body.id_activite || '',
                retour: req.body.retour || '/',
                erreur: err.response?.data?.message || 'Erreur lors du partage.'
            });
        } catch (err2) { next(err2); }
    }
});

router.post('/:id/retirer-partage/activite/:idActivite', async (req, res, next) => {
    try {
        const api = apiClient(req);
        await api.post(`/outils/${req.params.id}/retirer-partage/activite/${req.params.idActivite}`);
        res.redirect(`/outils/${req.params.id}/partager?retour=${encodeURIComponent(req.body.retour || '/')}`);
    } catch (err) { next(err); }
});

router.post('/:id/retirer-partage/sous-activite/:idSousActivite', async (req, res, next) => {
    try {
        const api = apiClient(req);
        await api.post(`/outils/${req.params.id}/retirer-partage/sous-activite/${req.params.idSousActivite}`);
        res.redirect(`/outils/${req.params.id}/partager?retour=${encodeURIComponent(req.body.retour || '/')}`);
    } catch (err) { next(err); }
});


// ---------- Credentials d'un outil ----------
router.get('/:id/credentials', async (req, res, next) => {
    try {
        // Module + permission (la source de vérité reste le Server)
        const { peutFaire } = require('../middlewares/requireLogin');
        if (!res.locals.credentialsActifs) {
            return res.status(403).render('erreur', {
                titre: 'Credentials désactivés',
                message: 'Le module credentials est désactivé dans les Réglages généraux.'
            });
        }
        if (!peutFaire(req.session.user, 'credentials', 'read')) {
            return res.status(403).render('erreur', {
                titre: 'Accès refusé',
                message: "Vous n'avez pas la permission de consulter les credentials."
            });
        }
        const api = apiClient(req);
        const { data: outil } = await api.get(`/outils/${req.params.id}`);
        res.render('outil/credentials', {
            titre: `Credentials — ${outil.nom}`,
            outil,
            retour: req.query.retour || '/',
            erreur: null,
            succes: null
        });
    } catch (err) { next(err); }
});

router.post('/:id/credentials', async (req, res, next) => {
    try {
        const api = apiClient(req);
        let credentials = req.body.credentials || '[]';
        if (typeof credentials === 'string') {
            try { credentials = JSON.parse(credentials); } catch (_) { credentials = []; }
        }
        const { data: outil } = await api.put(`/outils/${req.params.id}/credentials`, { credentials });
        res.render('outil/credentials', {
            titre: `Credentials — ${outil.nom}`,
            outil,
            retour: req.body.retour || '/',
            erreur: null,
            succes: 'Credentials enregistrés.'
        });
    } catch (err) {
        try {
            const api = apiClient(req);
            const { data: outil } = await api.get(`/outils/${req.params.id}`);
            res.render('outil/credentials', {
                titre: `Credentials — ${outil.nom}`,
                outil,
                retour: req.body.retour || '/',
                erreur: err.response?.data?.message || 'Erreur lors de l\'enregistrement.',
                succes: null
            });
        } catch (err2) { next(err2); }
    }
});


router.get('/:id/maintenance', async (req, res, next) => {
    try {
        const api = apiClient(req);
        const { data: outil } = await api.get(`/outils/${req.params.id}`);
        const retour = req.query.retour || '/';
        res.render('outil/maintenance', { titre: 'Maintenance — ' + outil.nom, outil, retour, erreur: null, succes: null });
    } catch (err) { next(err); }
});

router.post('/:id/maintenance', async (req, res, next) => {
    try {
        const api = apiClient(req);
        const body = {
            note_maintenance: req.body.note_maintenance,
            derangement_debut: req.body.derangement_debut || null,
            derangement_fin: req.body.derangement_fin || null,
            derangement_message: req.body.derangement_message
        };
        await api.put(`/outils/${req.params.id}/maintenance`, body);
        const retour = req.body.retour || '/';
        res.redirect(retour);
    } catch (err) {
        try {
            const api = apiClient(req);
            const { data: outil } = await api.get(`/outils/${req.params.id}`);
            res.render('outil/maintenance', {
                titre: 'Maintenance',
                outil,
                retour: req.body.retour || '/',
                erreur: err.response?.data?.message || 'Erreur',
                succes: null
            });
        } catch (e) { next(err); }
    }
});


router.post('/:id/favori', async (req, res) => {
    try {
        const api = apiClient(req);
        const uid = req.session.user.id;
        const { data } = await api.post(`/utilisateurs/${uid}/favoris`, {
            type: 'outil',
            id_cible: parseInt(req.params.id, 10)
        });
        const wantsJson = (req.headers.accept || '').includes('application/json')
            || req.headers['x-requested-with'] === 'XMLHttpRequest'
            || req.query.ajax === '1';
        if (wantsJson) return res.json(data);
        const retour = req.body.retour || req.get('Referer') || '/';
        const sep = retour.includes('?') ? '&' : '?';
        res.redirect(retour + sep + 'epingle=' + (data.epingle ? '1' : '0'));
    } catch (err) {
        const msg = err.response?.data?.message || err.message || 'Erreur épinglage';
        console.error('[favori outil]', msg);
        if ((req.headers.accept || '').includes('application/json')) {
            return res.status(err.response?.status || 500).json({ message: msg });
        }
        res.redirect((req.body.retour || req.get('Referer') || '/') + '?erreur_favori=1');
    }
});

module.exports = router;

