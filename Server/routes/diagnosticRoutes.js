const express = require('express');
const router = express.Router();
const diagnosticController = require('../controllers/diagnosticController');
const { requireAuth, checkPermission } = require('../middlewares/auth');

router.use(requireAuth);
// Rattaché à la permission "outils" : si on peut voir les outils, on peut
// tester leur accessibilité réseau.
router.use(checkPermission('outils', 'read'));

router.get('/ping', diagnosticController.ping);
router.get('/traceroute', diagnosticController.traceroute);
router.get('/nslookup', diagnosticController.nslookup);
router.get('/port', diagnosticController.testPort);

module.exports = router;
