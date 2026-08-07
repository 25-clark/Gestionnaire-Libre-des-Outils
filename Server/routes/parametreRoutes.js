const express = require('express');
const router = express.Router();
const parametreController = require('../controllers/parametreController');
const { requireAuth, isAdmin } = require('../middlewares/auth');

// Pas de requireAuth ici : le nom de l'entreprise doit pouvoir s'afficher
// sur la page de connexion, avant authentification.
router.get('/public', parametreController.obtenirPublic);

router.use(requireAuth);

function reserveAdmin(req, res, next) {
    if (!isAdmin(req.currentUser)) {
        return res.status(403).json({ message: "Réservé à l'administrateur." });
    }
    next();
}

router.get('/', reserveAdmin, parametreController.obtenir);
router.put('/', reserveAdmin, parametreController.mettreAJour);

module.exports = router;
