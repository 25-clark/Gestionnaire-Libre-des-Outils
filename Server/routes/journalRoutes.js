const express = require('express');
const router = express.Router();
const journalController = require('../controllers/journalController');
const { requireAuth, isAdmin } = require('../middlewares/auth');

router.use(requireAuth);
router.use((req, res, next) => {
    if (!isAdmin(req.currentUser)) {
        return res.status(403).json({ message: "Réservé à l'administrateur." });
    }
    next();
});

router.get('/', journalController.getAll);
router.get('/tout', journalController.getTout);

module.exports = router;
