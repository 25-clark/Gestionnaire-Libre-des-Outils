const express = require('express');
const router = express.Router();
const journalController = require('../controllers/journalController');
const { requireAuth, checkPermission } = require('../middlewares/auth');

router.use(requireAuth);
router.use(checkPermission('journal', 'read'));

router.get('/', journalController.getAll);
router.get('/tout', journalController.getTout);

module.exports = router;
