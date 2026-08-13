const express = require('express');
const router = express.Router();
const sousActiviteController = require('../controllers/sousActiviteController');
const {
    requireAuth, checkPermission, checkAccesActivite, checkAccesSousActivite, checkAccesLectureSousActivite,
    niveauAccesActivite, niveauAccesSousActivite
} = require('../middlewares/auth');
const { SousActivite } = require('../models');

router.use(requireAuth);

router.get('/', checkPermission('sous_activites', 'read'), sousActiviteController.getAll);
router.get('/:id', checkPermission('sous_activites', 'read'), checkAccesLectureSousActivite(), sousActiviteController.getById);
router.post('/', checkPermission('sous_activites', 'create'), checkAccesActivite('write'), sousActiviteController.create);
router.put('/:id', checkPermission('sous_activites', 'update'), checkAccesSousActivite('write'), sousActiviteController.update);
router.delete('/:id', checkPermission('sous_activites', 'delete'), checkAccesSousActivite('delete'), sousActiviteController.remove);

// Copier (avec descendants) vers une autre activité/sous-activité : il faut
// pouvoir LIRE la source, et avoir l'accès "write" sur la destination.
async function checkAccesCopie(req, res, next) {
    try {
        const { id_activite_destination, id_parent_destination } = req.body;

        if (id_parent_destination) {
            const parentDest = await SousActivite.findByPk(id_parent_destination);
            if (parentDest && await niveauAccesSousActivite(req.currentUser, parentDest, 'write')) return next();
        } else if (id_activite_destination && await niveauAccesActivite(req.currentUser, parseInt(id_activite_destination, 10), 'write')) {
            return next();
        }

        return res.status(403).json({ message: "Vous n'avez pas accès en écriture à la destination choisie." });
    } catch (err) { next(err); }
}

router.post('/:id/copier',
    checkPermission('partage', 'create'),
    checkAccesLectureSousActivite(),
    checkAccesCopie,
    sousActiviteController.copier
);

module.exports = router;
