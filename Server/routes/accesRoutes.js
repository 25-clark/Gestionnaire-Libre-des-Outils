const express = require('express');
const router = express.Router();
const accesController = require('../controllers/accesController');
const { requireAuth, checkPermission } = require('../middlewares/auth');

router.use(requireAuth);

router.get('/activites', checkPermission('acces', 'read'), accesController.getAccesActivites);
router.post('/activites', checkPermission('acces', 'create'), accesController.accorderAccesActivite);
router.delete('/activites/:id', checkPermission('acces', 'delete'), accesController.revoquerAccesActivite);

router.get('/sous-activites', checkPermission('acces', 'read'), accesController.getAccesSousActivites);
router.post('/sous-activites', checkPermission('acces', 'create'), accesController.accorderAccesSousActivite);
router.delete('/sous-activites/:id', checkPermission('acces', 'delete'), accesController.revoquerAccesSousActivite);

module.exports = router;
