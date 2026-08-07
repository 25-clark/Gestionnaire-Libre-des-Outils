const express = require('express');
const router = express.Router();
const sousActiviteController = require('../controllers/sousActiviteController');
const { requireAuth, checkPermission, checkAccesActivite, checkAccesSousActivite, checkAccesLectureSousActivite } = require('../middlewares/auth');

router.use(requireAuth);

router.get('/', checkPermission('sous_activites', 'read'), sousActiviteController.getAll);
router.get('/:id', checkPermission('sous_activites', 'read'), checkAccesLectureSousActivite(), sousActiviteController.getById);
router.post('/', checkPermission('sous_activites', 'create'), checkAccesActivite('write'), sousActiviteController.create);
router.put('/:id', checkPermission('sous_activites', 'update'), checkAccesSousActivite('write'), sousActiviteController.update);
router.delete('/:id', checkPermission('sous_activites', 'delete'), checkAccesSousActivite('delete'), sousActiviteController.remove);

module.exports = router;
