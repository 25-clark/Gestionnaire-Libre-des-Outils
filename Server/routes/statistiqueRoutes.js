const express = require('express');
const router = express.Router();
const statistiqueController = require('../controllers/statistiqueController');
const { requireAuth, isAdmin } = require('../middlewares/auth');

// Public (si activé dans Réglages généraux) — avant requireAuth
router.get('/public', statistiqueController.obtenirPublic);

router.use(requireAuth);
router.use((req, res, next) => {
    if (!isAdmin(req.currentUser)) {
        return res.status(403).json({ message: "Réservé à l'administrateur." });
    }
    next();
});

router.get('/', statistiqueController.obtenir);

module.exports = router;
