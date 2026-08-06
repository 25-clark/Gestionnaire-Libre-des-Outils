const express = require('express');
const router = express.Router();
const activiteController = require('../controllers/activiteController');
const { requireAuth, checkPermission, checkAccesLectureActivite, checkActionActivite } = require('../middlewares/auth');
const { uploadLogo } = require('../middlewares/upload');

router.use(requireAuth);

router.get('/', checkPermission('activites', 'read'), activiteController.getAll);
router.get('/arborescence', checkPermission('activites', 'read'), activiteController.getArborescence);
router.get('/:id', checkPermission('activites', 'read'), checkAccesLectureActivite(), activiteController.getById);
router.post('/', checkPermission('activites', 'create'), uploadLogo.single('logo'), activiteController.create);
router.put('/:id', checkActionActivite('update'), uploadLogo.single('logo'), activiteController.update);
router.delete('/:id', checkActionActivite('delete'), activiteController.remove);

module.exports = router;
