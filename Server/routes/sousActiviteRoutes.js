const express = require('express');
const router = express.Router();
const sousActiviteController = require('../controllers/sousActiviteController');
const { requireAuth, checkPermission, checkAccesLectureSousActivite, checkCreationSousActivite, checkActionSousActivite } = require('../middlewares/auth');

router.use(requireAuth);

router.get('/', checkPermission('sous_activites', 'read'), sousActiviteController.getAll);
router.get('/:id', checkPermission('sous_activites', 'read'), checkAccesLectureSousActivite(), sousActiviteController.getById);
router.post('/', checkCreationSousActivite(), sousActiviteController.create);
router.put('/:id', checkActionSousActivite('update'), sousActiviteController.update);
router.delete('/:id', checkActionSousActivite('delete'), sousActiviteController.remove);

module.exports = router;
