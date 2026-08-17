const express = require('express');
const router = express.Router();
const ldapController = require('../controllers/ldapController');
const { requireAuth, isAdmin } = require('../middlewares/auth');

router.use(requireAuth);
router.use((req, res, next) => {
    if (!isAdmin(req.currentUser)) {
        return res.status(403).json({ message: "Réservé à l'administrateur." });
    }
    next();
});

router.get('/parametres', ldapController.obtenirParametres);
router.put('/parametres', ldapController.mettreAJourParametres);
router.post('/tester', ldapController.tester);
router.post('/importer-utilisateurs', ldapController.importerUtilisateurs);
router.post('/importer-activites', ldapController.importerActivites);

module.exports = router;
