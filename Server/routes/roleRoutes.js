const express = require('express');
const router = express.Router();
const roleController = require('../controllers/roleController');
const { requireAuth, checkPermission } = require('../middlewares/auth');

router.use(requireAuth);

router.get('/', checkPermission('roles', 'read'), roleController.getAll);
router.get('/:id', checkPermission('roles', 'read'), roleController.getById);
router.post('/', checkPermission('roles', 'create'), roleController.create);
router.put('/:id', checkPermission('roles', 'update'), roleController.update);
router.delete('/:id', checkPermission('roles', 'delete'), roleController.remove);

module.exports = router;
