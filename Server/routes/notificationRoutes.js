const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const { requireAuth } = require('../middlewares/auth');

router.use(requireAuth);

// Chacun ne voit/gère que ses propres notifications (filtré par
// req.currentUser.id dans le contrôleur — pas besoin de checkPermission ici,
// ce n'est pas une ressource métier partagée).
router.get('/', notificationController.getAll);
router.get('/non-lues/nombre', notificationController.nombreNonLues);
router.post('/:id/lue', notificationController.marquerLue);
router.post('/toutes-lues', notificationController.marquerToutesLues);
router.delete('/', notificationController.vider);
router.post('/vider', notificationController.vider);

module.exports = router;
