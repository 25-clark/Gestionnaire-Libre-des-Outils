const express = require('express');
const router = express.Router();
const utilisateurController = require('../controllers/utilisateurController');
const { requireAuth, checkPermission, isAdmin } = require('../middlewares/auth');

router.use(requireAuth);

router.get('/', checkPermission('utilisateurs', 'read'), utilisateurController.getAll);
router.get('/:id', checkPermission('utilisateurs', 'read'), utilisateurController.getById);
router.post('/', checkPermission('utilisateurs', 'create'), utilisateurController.create);
router.delete('/:id', checkPermission('utilisateurs', 'delete'), utilisateurController.remove);

// Réservé à l'administrateur : remettre le mot de passe par défaut, cas
// "l'utilisateur a oublié son mot de passe".
router.post('/:id/reinitialiser-mdp', (req, res, next) => {
    if (!isAdmin(req.currentUser)) {
        return res.status(403).json({ message: 'Réservé à l\'administrateur.' });
    }
    next();
}, utilisateurController.reinitialiserMotDePasse);

// Mise à jour du profil (champs enrichis + préférences) — l'utilisateur peut
// modifier son propre profil ; un admin peut modifier celui de n'importe qui.
router.put('/:id/profil', utilisateurController.updateProfil);

module.exports = router;
