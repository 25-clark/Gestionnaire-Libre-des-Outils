const express = require('express');
const router = express.Router();
const utilisateurController = require('../controllers/utilisateurController');
const { requireAuth, checkPermission } = require('../middlewares/auth');

router.use(requireAuth);

router.get('/', checkPermission('utilisateurs', 'read'), utilisateurController.getAll);
router.get('/:id', checkPermission('utilisateurs', 'read'), utilisateurController.getById);
router.post('/', checkPermission('utilisateurs', 'create'), utilisateurController.create);
router.delete('/:id', checkPermission('utilisateurs', 'delete'), utilisateurController.remove);

module.exports = router;
