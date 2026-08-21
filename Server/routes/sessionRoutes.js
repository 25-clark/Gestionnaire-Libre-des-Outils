const express = require('express');
const router = express.Router();
const { requireAuth, checkPermission, isAdmin, userHasPermission } = require('../middlewares/auth');
const ctrl = require('../controllers/sessionController');

router.use(requireAuth);
router.get('/', checkPermission('sessions', 'read'), ctrl.lister);
router.post('/revoquer-toutes', checkPermission('sessions', 'delete'), ctrl.revoquerToutes);
router.delete('/:id', checkPermission('sessions', 'delete'), ctrl.revoquer);

module.exports = router;
