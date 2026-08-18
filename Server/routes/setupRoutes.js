const express = require('express');
const router = express.Router();
const setupController = require('../controllers/setupController');
const sauvegardeController = require('../controllers/sauvegardeController');
const { Parametre } = require('../models');

// Bloquer toute modification setup une fois l'installation terminée
async function seulementSiPasInstalle(req, res, next) {
    try {
        const [p] = await Parametre.findOrCreate({ where: { id: 1 }, defaults: {} });
        // statut reste accessible pour le client
        if (req.path === '/statut' || req.path.endsWith('/statut')) return next();
        if (p.installation_terminee && req.method !== 'GET') {
            return res.status(403).json({ message: 'Installation déjà terminée.' });
        }
        next();
    } catch (err) { next(err); }
}

router.use(seulementSiPasInstalle);

router.get('/statut', setupController.statut);
router.post('/cgu', setupController.accepterCgu);
router.post('/restaurer', sauvegardeController.restaurerInstallation);
router.post('/auth', setupController.choisirAuth);
router.post('/admin', setupController.creerAdmin);
router.post('/donnees', setupController.creerDonneesDemo);
router.post('/terminer', setupController.terminer);

module.exports = router;
