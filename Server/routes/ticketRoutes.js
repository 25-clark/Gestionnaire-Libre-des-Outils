const express = require('express');
const router = express.Router();
const ticketController = require('../controllers/ticketController');
const { requireAuth, checkPermission } = require('../middlewares/auth');
const { uploadTicketImages } = require('../middlewares/upload');

router.use(requireAuth);

router.get('/', checkPermission('tickets', 'read'), ticketController.getAll);
router.get('/:id', checkPermission('tickets', 'read'), ticketController.getById);
router.post('/', checkPermission('tickets', 'create'), uploadTicketImages.array('images', 6), ticketController.create);
router.post('/:id/escalader', checkPermission('tickets', 'update'), ticketController.escalader);
router.put('/:id', ticketController.update); // droits vérifiés dans le contrôleur (créateur/assigné/permission)
router.delete('/:id', checkPermission('tickets', 'delete'), ticketController.remove);

router.post('/:id/messages', ticketController.ajouterMessage);
router.put('/:id/messages/:messageId', ticketController.modifierMessage);

module.exports = router;
