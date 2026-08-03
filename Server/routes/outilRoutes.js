const express = require('express');
const router = express.Router();
const outilController = require('../controllers/outilController');
const { requireAuth, checkPermission } = require('../middlewares/auth');
const { uploadOutilImage } = require('../middlewares/upload');

router.use(requireAuth);

router.get('/', checkPermission('outils', 'read'), outilController.getAll);
router.get('/:id', checkPermission('outils', 'read'), outilController.getById);
router.post('/', checkPermission('outils', 'create'), uploadOutilImage.single('image'), outilController.create);
router.patch('/:id/toggle-active', checkPermission('outils', 'update'), outilController.toggleActive);
router.delete('/:id', checkPermission('outils', 'delete'), outilController.remove);

module.exports = router;
