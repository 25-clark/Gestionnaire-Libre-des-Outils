const express = require('express');
const router = express.Router();
const diagnosticController = require('../controllers/diagnosticController');
const { requireAuth, checkPermission } = require('../middlewares/auth');

router.use(requireAuth);
// Ressource dédiée "diagnostic", indépendante de "outils" — un rôle peut
// voir les outils sans forcément avoir le droit de sonder le réseau.
router.use(checkPermission('diagnostic', 'read'));

router.get('/ping', diagnosticController.ping);
router.get('/traceroute', diagnosticController.traceroute);
router.get('/nslookup', diagnosticController.nslookup);
router.get('/port', diagnosticController.testPort);

module.exports = router;
