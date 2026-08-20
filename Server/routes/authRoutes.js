const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { requireAuth } = require('../middlewares/auth');

router.post('/login', authController.login);
router.post('/logout', requireAuth, authController.logout);
router.get('/me', requireAuth, authController.me);
router.post('/changer-mot-de-passe', requireAuth, authController.changerMotDePasse);
router.post('/2fa/verifier', authController.verifier2fa);
router.post('/2fa/setup', requireAuth, authController.setup2fa);
router.post('/2fa/activer', requireAuth, authController.activer2fa);
router.post('/2fa/desactiver', requireAuth, authController.desactiver2fa);

router.post('/code-email', authController.verifierCodeEmail);
router.post('/3fa', authController.verifierCodeEmail); // alias rétrocompat
module.exports = router;
