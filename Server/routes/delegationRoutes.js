const express = require('express');
const router = express.Router();
const { requireAuth, checkPermission } = require('../middlewares/auth');
const ctrl = require('../controllers/delegationController');

router.use(requireAuth);
router.get('/', checkPermission('delegations', 'read'), ctrl.lister);
router.post('/', checkPermission('delegations', 'create'), ctrl.creer);
router.post('/:id/revoquer', checkPermission('delegations', 'delete'), ctrl.revoquer);

module.exports = router;
