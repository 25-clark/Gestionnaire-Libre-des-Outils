const express = require('express');
const router = express.Router();
const { requireAuth, checkPermission } = require('../middlewares/auth');
const ctrl = require('../controllers/demandeAccesController');

router.use(requireAuth);
router.get('/', checkPermission('demandes_acces', 'read'), ctrl.lister);
router.post('/', checkPermission('demandes_acces', 'create'), ctrl.creer);
router.post('/:id/traiter', checkPermission('demandes_acces', 'update'), ctrl.traiter);
router.post('/:id/annuler', checkPermission('demandes_acces', 'create'), ctrl.annuler);

module.exports = router;
