const express = require('express');
const router = express.Router();
const activiteController = require('../controllers/activiteController');
const { requireAuth, checkPermission, checkAccesActivite, checkAccesLectureActivite } = require('../middlewares/auth');
const { uploadLogo } = require('../middlewares/upload');

router.use(requireAuth);

router.get('/', checkPermission('activites', 'read'), activiteController.getAll);
router.get('/arborescence', checkPermission('activites', 'read'), activiteController.getArborescence);
router.get('/:id', checkPermission('activites', 'read'), checkAccesLectureActivite(), activiteController.getById);
router.post('/', checkPermission('activites', 'create'), uploadLogo.single('logo'), activiteController.create);
router.put('/:id', checkPermission('activites', 'update'), checkAccesActivite('write'), uploadLogo.single('logo'), activiteController.update);
router.delete('/:id', checkPermission('activites', 'delete'), activiteController.remove);

module.exports = router;
