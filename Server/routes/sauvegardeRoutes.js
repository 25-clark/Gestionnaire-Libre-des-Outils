
const express = require('express');
const router = express.Router();
const sauvegardeController = require('../controllers/sauvegardeController');
const { requireAuth } = require('../middlewares/auth');

router.use(requireAuth);
router.get('/export', sauvegardeController.telecharger);
router.post('/restaurer', sauvegardeController.restaurer);

module.exports = router;
